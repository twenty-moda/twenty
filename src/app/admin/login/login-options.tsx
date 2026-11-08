"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition, type ComponentProps } from "react";
import { FirebaseSignIn } from "@/components/account/firebase-sign-in";
import { buttonClass } from "@/components/admin/ui";
import { Field, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { passwordSignInAction } from "./actions";

type Method = "usuario" | "correo";
const METHOD_KEY = "twenty-panel-ingreso";
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
const readMethod = (): Method | null => {
  try {
    const saved = localStorage.getItem(METHOD_KEY);
    return saved === "usuario" || saved === "correo" ? saved : null;
  } catch {
    return null;
  }
};

/**
 * Dos formas de entrar al panel: con usuario y contraseña (el equipo de la tienda, sin correo) o con Google / correo
 * (Firebase). Cada computadora recuerda la última que se usó.
 */
export function LoginOptions({ firebase }: { firebase: ComponentProps<typeof FirebaseSignIn>["config"] }) {
  const saved = useSyncExternalStore(subscribe, readMethod, () => null);
  const [picked, setPicked] = useState<Method | null>(null);
  const method = picked ?? saved ?? "usuario";
  const choose = (next: Method) => {
    setPicked(next);
    try {
      localStorage.setItem(METHOD_KEY, next);
    } catch {
      // Sin localStorage solo no se recuerda.
    }
  };
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Cómo entrar" className="flex rounded-full border border-line bg-raised p-1 text-sm font-semibold">
        {(
          [
            ["usuario", "Usuario y contraseña"],
            ["correo", "Google o correo"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={method === value}
            onClick={() => choose(value)}
            className={cn("h-10 flex-1 rounded-full px-3", method === value ? "bg-white text-black" : "text-muted hover:text-white")}
          >
            {label}
          </button>
        ))}
      </div>
      {method === "usuario" ? (
        <PasswordForm />
      ) : (
        <>
          <FirebaseSignIn config={firebase} mode="admin" returnTo="/admin" />
          <p className="text-center text-xs text-subtle">
            Es tu misma cuenta de la tienda. ¿Te dieron acceso con tu correo y no tienes contraseña? Entra con Google o toca «Crear contraseña» con ese correo.
          </p>
        </>
      )}
    </div>
  );
}

function PasswordForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await passwordSignInAction({ username, password, next: "/admin" });
          if (!result.ok) {
            setError(result.message);
            setPassword("");
            return;
          }
          router.replace(result.next);
          router.refresh();
        });
      }}
    >
      <Field label="Usuario">
        {(a11y) => (
          <input
            {...a11y}
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            autoFocus
            className={inputClass}
          />
        )}
      </Field>
      <Field label="Contraseña">
        {(a11y) => (
          <div className="relative">
            <input
              {...a11y}
              name="password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={cn(inputClass, "pr-14")}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Ocultar la contraseña" : "Ver la contraseña"}
              className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center text-muted hover:text-white"
            >
              {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
            </button>
          </div>
        )}
      </Field>
      {error ? (
        <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={cn(buttonClass("primary"), "h-12 w-full text-base")}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
      <p className="text-center text-xs text-subtle">El usuario y la contraseña te los da el admin en Equipo. Si la olvidaste, pídele una nueva.</p>
    </form>
  );
}
