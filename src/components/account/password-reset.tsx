"use client";

import { CircleAlert, CircleCheck, KeyRound } from "lucide-react";
import { useState } from "react";
import type { FirebaseWebConfig } from "@/lib/firebase-config";
import { firebaseErrorMessage, loadFirebase, returnLink } from "./firebase-client";

/**
 * Crear o cambiar la contraseña: Firebase manda un enlace al correo de la cuenta. Sirve también a quien entró con
 * Google y quiere poder entrar con su correo: la contraseña se agrega a la misma cuenta.
 */
export function PasswordReset({ email, config }: { email: string; config: FirebaseWebConfig | null }) {
  const [state, setState] = useState<{ status: "idle" | "busy" | "sent" | "error"; message?: string }>({ status: "idle" });
  if (!config) return null;

  const send = async () => {
    setState({ status: "busy" });
    try {
      const fb = await loadFirebase(config);
      await fb.mod.sendPasswordResetEmail(fb.auth, email, returnLink("/ingresar"));
      setState({ status: "sent" });
    } catch (error) {
      setState({ status: "error", message: firebaseErrorMessage(error) });
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={send}
        disabled={state.status === "busy"}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-line px-5 text-sm font-semibold disabled:opacity-60"
      >
        <KeyRound className="size-4" aria-hidden /> {state.status === "busy" ? "Enviando…" : "Crear o cambiar mi contraseña"}
      </button>
      {state.status === "sent" ? (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-success/15 px-4 py-3 text-sm text-success">
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> Te enviamos un enlace a {email}. Ábrelo para elegir tu contraseña (revisa también Spam).
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
    </div>
  );
}
