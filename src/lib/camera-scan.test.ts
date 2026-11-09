import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ZXING_WASM_SHA256, ZXING_WASM_VERSION } from "barcode-detector/ponyfill";
import { describe, expect, it } from "vitest";
import { cameraErrorMessage, createScanGate, zxingWasmPath } from "./camera-scan";

describe("createScanGate", () => {
  it("cuenta un código una sola vez mientras sigue en el cuadro", () => {
    const see = createScanGate(1500);
    expect(see(["TMW-0001"], 0)).toBe("TMW-0001");
    // La cámara lo sigue viendo varias veces por segundo durante más que el intervalo.
    for (let t = 150; t <= 4000; t += 150) expect(see(["TMW-0001"], t)).toBeNull();
  });

  it("lo vuelve a contar si salió del cuadro el tiempo suficiente", () => {
    const see = createScanGate(1500);
    expect(see(["TMW-0001"], 0)).toBe("TMW-0001");
    expect(see([], 500)).toBeNull();
    // Volvió antes del intervalo: es la misma lectura.
    expect(see(["TMW-0001"], 1000)).toBeNull();
    expect(see([], 1200)).toBeNull();
    expect(see(["TMW-0001"], 2600)).toBe("TMW-0001");
  });

  it("otro código cuenta enseguida, de a uno por lectura", () => {
    const see = createScanGate(1500);
    expect(see(["TMW-0001"], 0)).toBe("TMW-0001");
    expect(see(["TMW-0002"], 100)).toBe("TMW-0002");
    // Dos etiquetas nuevas en el mismo cuadro: una ahora y la otra en la siguiente lectura.
    expect(see(["TMW-0003", "TMW-0004"], 200)).toBe("TMW-0003");
    expect(see(["TMW-0003", "TMW-0004"], 300)).toBeNull();
  });

  it("ignora lecturas vacías y espacios", () => {
    const see = createScanGate();
    expect(see(["", "  "], 0)).toBeNull();
    expect(see([" TMW-0001 "], 10)).toBe("TMW-0001");
  });
});

describe("cameraErrorMessage", () => {
  const named = (name: string) => Object.assign(new Error("x"), { name });

  it("explica cada caso con palabras del vendedor", () => {
    expect(cameraErrorMessage(named("NotAllowedError"))).toMatch(/permiso/);
    expect(cameraErrorMessage(named("NotFoundError"))).toMatch(/No encontramos una cámara/);
    expect(cameraErrorMessage(named("NotReadableError"))).toMatch(/Otra app/);
    expect(cameraErrorMessage(named("CameraUnsupported"))).toMatch(/Chrome o Safari/);
    expect(cameraErrorMessage(named("ReaderLoadError"))).toMatch(/lector de códigos/);
    expect(cameraErrorMessage("raro")).toMatch(/No se pudo abrir la cámara/);
  });
});

describe("lector en WebAssembly", () => {
  it("public/ tiene el .wasm de la versión instalada de barcode-detector", () => {
    const file = path.join(process.cwd(), "public", zxingWasmPath(ZXING_WASM_VERSION));
    expect(existsSync(file), `Copia node_modules/.pnpm/zxing-wasm@${ZXING_WASM_VERSION}*/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm a ${file}`).toBe(true);
    expect(createHash("sha256").update(readFileSync(file)).digest("hex")).toBe(ZXING_WASM_SHA256);
  });
});
