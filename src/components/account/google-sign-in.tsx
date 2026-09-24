"use client";

import type { Auth } from "firebase/auth";
import { CircleAlert, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { signInWithGoogleAction } from "@/app/(store)/cuenta/actions";
import type { FirebaseWebConfig } from "@/lib/firebase-config";

type Firebase = { auth: Auth; mod: typeof import("firebase/auth") };

let loading: Promise<Firebase> | null = null;
/** El SDK se carga una sola vez y solo en esta página (no pesa en el resto de la tienda). */
function loadFirebase(config: FirebaseWebConfig): Promise<Firebase> {
  loading ??= Promise.all([import("firebase/app"), import("firebase/auth")])
    .then(([app, mod]) => {
      const firebaseApp = app.getApps()[0] ?? app.initializeApp(config);
      // En memoria: la sesión de la tienda es nuestra cookie; Firebase no guarda nada en el navegador.
      const auth = mod.initializeAuth(firebaseApp, { persistence: mod.inMemoryPersistence, popupRedirectResolver: mod.browserPopupRedirectResolver });
      auth.languageCode = "es";
      return { auth, mod };
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

/** Instagram, Facebook y TikTok abren los enlaces en su propio navegador, donde Google no deja iniciar sesión. */
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Bytedance|\bLine\//i;
const noop = () => () => {};

const ERRORS: Record<string, string> = {
  "auth/popup-blocked": "Tu navegador bloqueó la ventana de Google. Permite las ventanas emergentes e inténtalo de nuevo.",
  "auth/network-request-failed": "Sin conexión. Revisa tu internet e inténtalo de nuevo.",
  "auth/unauthorized-domain": "El ingreso con Google no está habilitado en esta dirección de la web.",
};

export function GoogleSignIn({ config, returnTo }: { config: FirebaseWebConfig | null; returnTo: string }) {
  const router = useRouter();
  const firebase = useRef<Firebase | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(config ? null : "El ingreso con Google aún no está disponible.");
  const [copied, setCopied] = useState(false);
  const inApp = useSyncExternalStore(noop, () => IN_APP.test(navigator.userAgent), () => false);

  useEffect(() => {
    if (!config) return;
    let active = true;
    loadFirebase(config).then(
      (fb) => {
        if (!active) return;
        firebase.current = fb;
        setReady(true);
      },
      () => active && setError("No pudimos cargar el ingreso con Google. Revisa tu conexión y recarga la página."),
    );
    return () => {
      active = false;
    };
  }, [config]);

  const signIn = () => {
    const fb = firebase.current;
    if (!fb || busy) return;
    setError(null);
    setBusy(true);
    const provider = new fb.mod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    // La ventana de Google se abre en el mismo toque (si no, el navegador la bloquea).
    fb.mod
      .signInWithPopup(fb.auth, provider)
      .then(async (credential) => {
        const token = await credential.user.getIdToken();
        await fb.mod.signOut(fb.auth);
        const result = await signInWithGoogleAction(token, returnTo);
        if (!result.ok) {
          setError(result.message);
          setBusy(false);
          return;
        }
        router.replace(result.next);
        router.refresh();
      })
      .catch((e: { code?: string }) => {
        setBusy(false);
        if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") return;
        setError(ERRORS[e?.code ?? ""] ?? "No se pudo entrar con Google. Inténtalo de nuevo.");
      });
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(location.href).then(() => setCopied(true), () => {});
  };

  return (
    <div className="space-y-4">
      {inApp ? (
        <div className="rounded-xl bg-warning/15 p-4 text-sm text-warning">
          <p className="font-semibold">Abre esta página en Chrome o Safari</p>
          <p className="mt-1">Google no deja iniciar sesión dentro de Instagram, Facebook o TikTok. Copia el enlace y ábrelo en tu navegador.</p>
          <button type="button" onClick={copyLink} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-warning/40 px-4 font-semibold">
            <Copy className="size-4" aria-hidden /> {copied ? "¡Enlace copiado!" : "Copiar enlace"}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={signIn}
        disabled={!ready || busy}
        className="flex h-13 w-full items-center justify-center gap-3 rounded-full bg-white px-6 text-sm font-bold text-black transition active:scale-[0.98] disabled:opacity-60"
      >
        <GoogleLogo />
        {busy ? "Entrando…" : ready ? "Continuar con Google" : "Cargando…"}
      </button>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
        </p>
      ) : null}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}
