"use client";

import type { ActionCodeSettings, Auth } from "firebase/auth";
import type { FirebaseWebConfig } from "@/lib/firebase-config";

export type Firebase = { auth: Auth; mod: typeof import("firebase/auth") };

let loading: Promise<Firebase> | null = null;

/** El SDK se carga una sola vez y solo donde se usa (ingresar, mis datos), no en el resto de la tienda. */
export function loadFirebase(config: FirebaseWebConfig): Promise<Firebase> {
  loading ??= Promise.all([import("firebase/app"), import("firebase/auth")])
    .then(([app, mod]) => {
      const firebaseApp = app.getApps()[0] ?? app.initializeApp(config);
      // En memoria: la sesión es nuestra cookie; Firebase no guarda nada en el navegador.
      const auth = mod.initializeAuth(firebaseApp, { persistence: mod.inMemoryPersistence, popupRedirectResolver: mod.browserPopupRedirectResolver });
      // Correos de Firebase (confirmar email, cambiar contraseña) en español.
      auth.languageCode = "es";
      return { auth, mod };
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

/** Adónde vuelve la persona después de tocar el enlace del correo de Firebase. */
export const returnLink = (path: string): ActionCodeSettings => ({ url: `${location.origin}${path}` });

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/invalid-login-credentials": "Correo o contraseña incorrectos.",
  "auth/wrong-password": "Correo o contraseña incorrectos.",
  "auth/user-not-found": "Correo o contraseña incorrectos.",
  "auth/missing-password": "Escribe tu contraseña.",
  "auth/invalid-email": "Revisa tu correo.",
  "auth/weak-password": "La contraseña debe tener al menos 8 caracteres.",
  "auth/email-already-in-use":
    "Ya hay una cuenta con ese correo. Entra con tu contraseña (o con Google si es tu correo de Google). Si no tienes contraseña, usa «¿Olvidaste tu contraseña?» para crearla.",
  "auth/too-many-requests": "Hiciste muchos intentos seguidos. Espera unos minutos e inténtalo de nuevo.",
  "auth/user-disabled": "Esta cuenta está desactivada. Escríbenos por WhatsApp y te ayudamos.",
  "auth/popup-blocked": "Tu navegador bloqueó la ventana de Google. Permite las ventanas emergentes e inténtalo de nuevo.",
  "auth/network-request-failed": "Sin conexión. Revisa tu internet e inténtalo de nuevo.",
  "auth/unauthorized-domain": "El ingreso no está habilitado en esta dirección de la web.",
  "auth/unauthorized-continue-uri": "El ingreso no está habilitado en esta dirección de la web.",
};

export function firebaseErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  return MESSAGES[code] ?? "No se pudo completar. Inténtalo de nuevo.";
}

export const isCancelled = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  return code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request";
};
