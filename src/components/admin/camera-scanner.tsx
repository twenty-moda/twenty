"use client";

import { Camera, CameraOff, Flashlight, FlashlightOff, RotateCcw } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { buttonClass } from "@/components/admin/ui";
import { cameraErrorMessage, createScanGate, SCAN_FORMATS, zxingWasmPath } from "@/lib/camera-scan";
import { cn } from "@/lib/cn";

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type NativeDetector = { new (options: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };
type TrackCapabilities = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] };

const named = (name: string) => Object.assign(new Error(name), { name });

// El de WebAssembly se arma una vez por página: cerrar y abrir la cámara no lo vuelve a bajar.
let wasmDetector: Promise<Detector> | null = null;

/** El lector del sistema (Chrome de Android) si lee Code 128; si no (iPhone, iPad, Windows), el de WebAssembly. */
async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetector }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      if (supported.includes("code_128")) return new Native({ formats: SCAN_FORMATS.filter((f) => supported.includes(f)) });
    } catch {
      // Sigue con el de WebAssembly.
    }
  }
  wasmDetector ??= (async () => {
    const { BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill");
    const wasm = zxingWasmPath(ZXING_WASM_VERSION);
    await prepareZXingModule({ overrides: { locateFile: (file: string, prefix: string) => (file.endsWith(".wasm") ? wasm : prefix + file) }, fireImmediately: true });
    return new BarcodeDetector({ formats: [...SCAN_FORMATS] });
  })().catch(() => {
    wasmDetector = null;
    throw named("ReaderLoadError");
  });
  return wasmDetector;
}

// El pitido de la pistola: avisa que la lectura entró sin mirar la pantalla.
let audio: AudioContext | null = null;
function beep() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 2000;
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.1);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.1);
  } catch {
    // Sin sonido no pasa nada.
  }
  navigator.vibrate?.(40);
}

// Cada equipo recuerda si usa la cámara: en una tablet de caja queda abierta en cada venta nueva.
const CAMERA_KEY = "twenty-lector-camara";
const subscribeStorage = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
/** Si en este equipo el lector es la cámara (el punto de venta no enfoca el buscador: abriría el teclado encima). */
export const isCameraScanOn = () => {
  try {
    return localStorage.getItem(CAMERA_KEY) === "1";
  } catch {
    return false;
  }
};

type CameraScanProps = {
  /** Lo mismo que hace la pistola con el código + Enter. */
  onScan: (code: string) => void;
  /** El buscador: la cámara va al lado y su vista debajo. */
  children: ReactNode;
  /** `lg` en el punto de venta (buscador de 64 px). */
  size?: "md" | "lg";
};

/** Buscador + botón «Cámara»: el teléfono o la tablet leen las etiquetas como la pistola. */
export function CameraScan({ onScan, children, size = "md" }: CameraScanProps) {
  const saved = useSyncExternalStore(subscribeStorage, isCameraScanOn, () => false);
  const [picked, setPicked] = useState<boolean | null>(null);
  const on = picked ?? saved;
  const choose = (next: boolean) => {
    setPicked(next);
    try {
      if (next) localStorage.setItem(CAMERA_KEY, "1");
      else localStorage.removeItem(CAMERA_KEY);
    } catch {
      // Sin localStorage solo no se recuerda.
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          aria-pressed={on}
          onClick={() => choose(!on)}
          className={cn(
            "flex shrink-0 items-center justify-center gap-2 rounded-xl border px-3.5 font-semibold transition sm:px-4",
            size === "lg" ? "h-16 min-w-16" : "h-12 min-w-12",
            on ? "border-white bg-white text-black" : "border-line text-white hover:border-white/60",
          )}
        >
          {on ? <CameraOff className="size-5" aria-hidden /> : <Camera className="size-5" aria-hidden />}
          <span className="sr-only sm:not-sr-only">{on ? "Cerrar cámara" : "Cámara"}</span>
        </button>
      </div>
      {on ? <CameraView onScan={onScan} /> : null}
    </div>
  );
}

type Status = { kind: "starting" } | { kind: "ready" } | { kind: "error"; message: string };

function CameraView({ onScan }: { onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  // null = esta cámara no tiene linterna.
  const [torch, setTorch] = useState<boolean | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [hit, setHit] = useState(false);

  const handleScan = useEffectEvent((code: string) => {
    beep();
    setLastCode(code);
    setHit(true);
    clearTimeout(hitTimer.current);
    hitTimer.current = setTimeout(() => setHit(false), 500);
    onScan(code);
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw named("CameraUnsupported");
      // El lector carga mientras el navegador pide el permiso.
      const detecting = createDetector();
      detecting.catch(() => undefined);
      const opened = await navigator.mediaDevices.getUserMedia({
        audio: false,
        // La de atrás y en alta: las barras del Code 128 son finas.
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (stopped) return opened.getTracks().forEach((t) => t.stop());
      stream = opened;
      const track = opened.getVideoTracks()[0];
      trackRef.current = track;
      const caps = (track.getCapabilities?.() ?? {}) as TrackCapabilities;
      if (caps.focusMode?.includes("continuous")) track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
      if (caps.torch) setTorch(false);
      video.srcObject = opened;
      await video.play();
      const detector = await detecting;
      if (stopped) return;
      setStatus({ kind: "ready" });

      const see = createScanGate();
      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= 2 && !document.hidden) {
          try {
            const found = await detector.detect(video);
            const code = stopped ? null : see(found.map((b) => b.rawValue), performance.now());
            if (code) handleScan(code);
          } catch {
            // Un cuadro que no se pudo leer: sigue con el próximo.
          }
        }
        timer = setTimeout(tick, 120);
      };
      void tick();
    })().catch((error: unknown) => {
      if (!stopped) setStatus({ kind: "error", message: cameraErrorMessage(error) });
    });

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
      video.srcObject = null;
    };
  }, [attempt]);

  const toggleTorch = () => {
    const track = trackRef.current;
    if (!track || torch === null) return;
    const next = !torch;
    track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }).then(
      () => setTorch(next),
      () => setTorch(null),
    );
  };

  const retry = () => {
    setStatus({ kind: "starting" });
    setTorch(null);
    setAttempt((a) => a + 1);
  };

  return (
    <div>
      <div className={cn("relative h-52 overflow-hidden rounded-2xl border border-line bg-black sm:h-64", status.kind === "error" && "hidden")}>
        <video ref={videoRef} playsInline muted autoPlay aria-label="Vista de la cámara" className="size-full object-cover" />
        {/* Cuadro de apuntar: lo de afuera se oscurece y el borde se pone verde con cada lectura. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-[8%] inset-y-[22%] rounded-xl border-2 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)] transition-colors",
            hit ? "border-success" : "border-white/80",
          )}
        >
          <span className="absolute inset-x-3 top-1/2 h-px bg-white/50" />
        </div>
        {status.kind === "starting" ? <p className="absolute inset-0 grid place-items-center bg-black/70 text-sm text-muted">Abriendo la cámara…</p> : null}
        {torch !== null ? (
          <button
            type="button"
            aria-pressed={torch}
            aria-label={torch ? "Apagar la linterna" : "Prender la linterna"}
            onClick={toggleTorch}
            className="absolute top-2 right-2 grid size-11 place-items-center rounded-full bg-black/60 text-white"
          >
            {torch ? <FlashlightOff className="size-5" aria-hidden /> : <Flashlight className="size-5" aria-hidden />}
          </button>
        ) : null}
        <p className="absolute inset-x-2 bottom-2 truncate rounded-lg bg-black/70 px-3 py-1.5 text-center text-xs text-white">
          {lastCode ? (
            <>
              Leído <span className="font-mono font-semibold">{lastCode}</span> · para otra igual, aparta la cámara y vuelve a apuntar
            </>
          ) : (
            "Apunta al código de barras de la etiqueta"
          )}
        </p>
      </div>
      {status.kind === "error" ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-danger/50 bg-danger/10 p-4 text-sm">
          <p>{status.message}</p>
          <button type="button" onClick={retry} className={buttonClass("secondary")}>
            <RotateCcw className="size-4" aria-hidden /> Reintentar
          </button>
        </div>
      ) : null}
    </div>
  );
}
