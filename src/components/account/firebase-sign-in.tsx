"use client";

import type { AuthCredential, User } from "firebase/auth";
import { CircleAlert, CircleCheck, Copy, Eye, EyeOff, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { SignInResult } from "@/app/(store)/_lib/sign-in";
import { signInWithFirebaseAction } from "@/app/(store)/cuenta/actions";
import { adminSignInAction } from "@/app/admin/login/actions";
import type { FirebaseWebConfig } from "@/lib/firebase-config";
import { Field, inputClass, Segmented } from "../ui/form";
import { firebaseErrorMessage, isCancelled, loadFirebase, returnLink, type Firebase } from "./firebase-client";

/** Instagram, Facebook y TikTok abren los enlaces en su propio navegador, donde Google no deja iniciar sesión. */
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Bytedance|\bLine\//i;
const noop = () => () => {};
const MIN_PASSWORD = 8;

type View = "signin" | "signup" | "verify";
type Props = {
  config: FirebaseWebConfig | null;
  /** Tienda (crea la cuenta la primera vez) o panel (solo cuentas con rol admin). */
  mode: "store" | "admin";
  returnTo: string;
  /** Volvió del enlace de confirmación del correo. */
  verified?: boolean;
};

/**
 * Entrar con Google o con correo y contraseña (Firebase). Es una sola cuenta por email: si alguien creó su cuenta
 * con contraseña y después entra con Google (o al revés), Firebase las une y en la tienda es la misma cuenta.
 * Las cuentas con contraseña confirman su correo antes de poder entrar.
 */
export function FirebaseSignIn({ config, mode, returnTo, verified = false }: Props) {
  const router = useRouter();
  const firebase = useRef<Firebase | null>(null);
  // Google con un correo que ya tiene contraseña (y Firebase no puede unirlas solo): se une al entrar con la contraseña.
  const pendingGoogle = useRef<AuthCredential | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(config ? null : "El ingreso aún no está disponible.");
  const [info, setInfo] = useState<string | null>(verified ? "¡Listo, confirmaste tu correo! Ya puedes entrar." : null);
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
      () => active && setError("No pudimos cargar el ingreso. Revisa tu conexión y recarga la página."),
    );
    return () => {
      active = false;
    };
  }, [config]);

  const link = mode === "admin" ? "/admin/login" : `/ingresar?verificado=1&volver=${encodeURIComponent(returnTo)}`;

  /** Con la cuenta de Firebase lista: se manda el token al servidor, que abre nuestra sesión. */
  const finish = async (fb: Firebase, user: User) => {
    const token = await user.getIdToken();
    await fb.mod.signOut(fb.auth);
    const action = mode === "admin" ? adminSignInAction : signInWithFirebaseAction;
    const result: SignInResult = await action(token, returnTo);
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    router.replace(result.next);
    router.refresh();
  };

  const run = (task: (fb: Firebase) => Promise<void>) => {
    const fb = firebase.current;
    if (!fb || busy) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    task(fb).catch((e) => {
      setBusy(false);
      if (isCancelled(e)) return;
      if ((e as { code?: string }).code === "auth/account-exists-with-different-credential") {
        pendingGoogle.current = fb.mod.GoogleAuthProvider.credentialFromError(e as never);
        const address = (e as { customData?: { email?: string } }).customData?.email;
        if (address) setEmail(address);
        setView("signin");
        setError("Ese correo ya tiene una cuenta con contraseña. Entra con tu contraseña y quedará unida a Google para la próxima.");
        return;
      }
      setError(firebaseErrorMessage(e));
    });
  };

  const google = () =>
    run(async (fb) => {
      const provider = new fb.mod.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      // La ventana de Google se abre en el mismo toque (si no, el navegador la bloquea).
      const { user } = await fb.mod.signInWithPopup(fb.auth, provider);
      await finish(fb, user);
    });

  const signIn = (event: FormEvent) => {
    event.preventDefault();
    run(async (fb) => {
      const { user } = await fb.mod.signInWithEmailAndPassword(fb.auth, email.trim(), password);
      if (!user.emailVerified) {
        await fb.mod.sendEmailVerification(user, returnLink(link)).catch(() => {});
        await fb.mod.signOut(fb.auth);
        setView("verify");
        setBusy(false);
        return;
      }
      if (pendingGoogle.current) {
        await fb.mod.linkWithCredential(user, pendingGoogle.current).catch(() => {});
        pendingGoogle.current = null;
      }
      await finish(fb, user);
    });
  };

  const signUp = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 3) return setError("Escribe tu nombre y apellido.");
    if (password.length < MIN_PASSWORD) return setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
    run(async (fb) => {
      const { user } = await fb.mod.createUserWithEmailAndPassword(fb.auth, email.trim(), password);
      await fb.mod.updateProfile(user, { displayName: name.trim() });
      await fb.mod.sendEmailVerification(user, returnLink(link));
      await fb.mod.signOut(fb.auth);
      setView("verify");
      setBusy(false);
    });
  };

  /** "Ya lo confirmé": se vuelve a entrar con la contraseña (así el token es nuevo y dice que el correo está confirmado). */
  const afterVerify = () =>
    run(async (fb) => {
      const { user } = await fb.mod.signInWithEmailAndPassword(fb.auth, email.trim(), password);
      if (!user.emailVerified) {
        await fb.mod.signOut(fb.auth);
        setBusy(false);
        setError("Todavía no vemos confirmado tu correo. Toca el enlace del correo que te enviamos (revisa también Spam).");
        return;
      }
      await finish(fb, user);
    });

  const resend = () =>
    run(async (fb) => {
      const { user } = await fb.mod.signInWithEmailAndPassword(fb.auth, email.trim(), password);
      await fb.mod.sendEmailVerification(user, returnLink(link));
      await fb.mod.signOut(fb.auth);
      setBusy(false);
      setInfo(`Te reenviamos el correo a ${email.trim()}.`);
    });

  const forgot = () => {
    if (!email.trim()) return setError("Escribe tu correo arriba y vuelve a tocar «¿Olvidaste tu contraseña?».");
    run(async (fb) => {
      await fb.mod.sendPasswordResetEmail(fb.auth, email.trim(), returnLink(link));
      setBusy(false);
      // Firebase no dice si el correo tiene cuenta (para no revelarlo): el mensaje tampoco.
      setInfo(`Si ${email.trim()} tiene una cuenta, te llegará un correo para crear una contraseña nueva. Revisa también Spam.`);
    });
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(location.href).then(() => setCopied(true), () => {});
  };

  const messages = (
    <>
      {info ? (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-success/15 px-4 py-3 text-sm text-success">
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {info}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
        </p>
      ) : null}
    </>
  );

  if (view === "verify") {
    return (
      <div className="space-y-4 text-center">
        <Mail className="mx-auto size-10" aria-hidden />
        <div>
          <h2 className="text-lg font-bold">Confirma tu correo</h2>
          <p className="mt-1 text-sm text-muted">
            Te enviamos un enlace a <strong className="text-white">{email.trim()}</strong>. Ábrelo, toca el enlace y vuelve aquí. Si no llega, revisa Spam.
          </p>
        </div>
        {messages}
        <button type="button" onClick={afterVerify} disabled={!ready || busy} className={primaryButton}>
          {busy ? "Un momento…" : "Ya lo confirmé, entrar"}
        </button>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={resend} disabled={!ready || busy} className={secondaryButton}>
            Reenviar correo
          </button>
          <button type="button" onClick={() => (setView("signin"), setError(null), setInfo(null))} className={secondaryButton}>
            Usar otro correo
          </button>
        </div>
      </div>
    );
  }

  const signup = view === "signup";
  return (
    <div className="space-y-4">
      {inApp ? (
        <div className="rounded-xl bg-warning/15 p-4 text-sm text-warning">
          <p className="font-semibold">Para entrar con Google, abre esta página en Chrome o Safari</p>
          <p className="mt-1">Google no deja iniciar sesión dentro de Instagram, Facebook o TikTok. Con tu correo y contraseña sí puedes entrar aquí.</p>
          <button type="button" onClick={copyLink} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-warning/40 px-4 font-semibold">
            <Copy className="size-4" aria-hidden /> {copied ? "¡Enlace copiado!" : "Copiar enlace"}
          </button>
        </div>
      ) : null}

      <button type="button" onClick={google} disabled={!ready || busy} className={cnButton("bg-white text-black")}>
        <GoogleLogo />
        {ready ? "Continuar con Google" : "Cargando…"}
      </button>

      <div className="flex items-center gap-3 text-xs text-subtle" aria-hidden>
        <span className="h-px flex-1 bg-line" /> o con tu correo <span className="h-px flex-1 bg-line" />
      </div>

      <Segmented
        label="Ingresar o crear cuenta"
        value={view}
        options={[
          { value: "signin", label: "Ingresar" },
          { value: "signup", label: mode === "admin" ? "Crear contraseña" : "Crear cuenta" },
        ]}
        onChange={(v) => {
          setView(v);
          setError(null);
          setInfo(null);
        }}
      />

      <form onSubmit={signup ? signUp : signIn} className="space-y-4" noValidate>
        {signup ? (
          <Field label="Nombre y apellido">
            {(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inputClass} />}
          </Field>
        ) : null}
        <Field label="Correo">
          {(p) => <input {...p} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={inputClass} />}
        </Field>
        <Field label="Contraseña" hint={signup ? `Mínimo ${MIN_PASSWORD} caracteres. Te enviaremos un correo para confirmar tu email.` : undefined}>
          {(p) => (
            <div className="relative">
              <input
                {...p}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={signup ? "new-password" : "current-password"}
                className={`${inputClass} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted"
              >
                {showPassword ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
              </button>
            </div>
          )}
        </Field>
        {messages}
        <button type="submit" disabled={!ready || busy} className={primaryButton}>
          {busy ? "Un momento…" : signup ? (mode === "admin" ? "Crear contraseña" : "Crear cuenta") : "Ingresar"}
        </button>
        {!signup ? (
          <button type="button" onClick={forgot} disabled={!ready || busy} className="mx-auto block min-h-10 text-sm font-semibold text-muted underline underline-offset-4">
            ¿Olvidaste tu contraseña?
          </button>
        ) : null}
      </form>
    </div>
  );
}

const cnButton = (colors: string) =>
  `flex h-13 w-full items-center justify-center gap-3 rounded-full px-6 text-sm font-bold transition active:scale-[0.98] disabled:opacity-60 ${colors}`;
const primaryButton = cnButton("bg-white text-black");
const secondaryButton = "min-h-10 rounded-full border border-line px-4 text-sm font-semibold disabled:opacity-60";

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
