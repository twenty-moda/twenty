"use client";

import { KeyRound, RefreshCw, UserMinus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FieldError, FormAlert, SubmitButton, Toggle } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { inputClass, inputCompactClass, selectClass, SelectWrap } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { PANEL_ROLE_HINT, PANEL_ROLE_LABEL, PANEL_ROLES, type PanelRole } from "@/lib/panel-access";
import { idle, type ActionState } from "../../_lib/action-state";
import { addMemberAction, changeRoleAction, removeAdminAction, resetPasswordAction } from "./actions";

/** Contraseña fácil de dictar: sin 0/O ni 1/l/I. */
function suggestPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (set: string, n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => set[x % set.length]).join("");
  return `${pick(letters, 4)}-${pick(digits, 4)}-${pick(letters, 4)}`;
}

type Method = "usuario" | "correo";

export function AddMemberForm({ emailEnabled }: { emailEnabled: boolean }) {
  // Cada alta que sale bien deja el formulario en blanco; si falla, se queda lo escrito.
  const [formKey, setFormKey] = useState(0);
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await addMemberAction(prev, fd);
    if (result.status === "success") setFormKey((k) => k + 1);
    return result;
  }, idle);
  return (
    <div className="space-y-4">
      <form key={formKey} action={action} className="space-y-5">
        <MemberFields state={state} emailEnabled={emailEnabled} />
      </form>
      <FormAlert state={state} />
    </div>
  );
}

function MemberFields({ state, emailEnabled }: { state: ActionState; emailEnabled: boolean }) {
  const [method, setMethod] = useState<Method>("usuario");
  const [values, setValues] = useState({ name: "", username: "", password: "", email: "" });
  const [role, setRole] = useState<PanelRole>("vendedor");
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));
  return (
    <>
      <input type="hidden" name="method" value={method} />
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">Cómo entra</legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {(
            [
              ["usuario", "Con usuario y contraseña", "Sin correo: tú le das el usuario y la contraseña."],
              ["correo", "Con su correo", "Entra con su Google o con una contraseña de ese correo."],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              onClick={() => setMethod(value)}
              className={cn(
                "min-w-[14rem] flex-1 rounded-xl border px-4 py-3 text-left text-sm transition",
                method === value ? "border-white bg-white text-black" : "border-line hover:border-white/50",
              )}
            >
              <span className="block font-semibold">{label}</span>
              <span className={cn("block text-xs", method === value ? "text-black/60" : "text-muted")}>{hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Nombre</span>
          <input name="name" required autoComplete="off" value={values.name} onChange={set("name")} placeholder="Ej. Ana Torres" className={inputClass} />
          <FieldError state={state} name="name" />
        </label>
        {method === "usuario" ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Usuario</span>
            <input
              name="username"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={values.username}
              onChange={(e) => setValues((v) => ({ ...v, username: e.target.value.toLowerCase().replace(/\s+/g, "") }))}
              placeholder="Ej. tienda1 o ana.torres"
              className={inputClass}
            />
            <FieldError state={state} name="username" />
            <span className="mt-1.5 block text-xs text-muted">En minúsculas, sin espacios. Es lo que escribe al entrar.</span>
          </label>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Correo</span>
            <input name="email" type="email" required autoComplete="off" inputMode="email" value={values.email} onChange={set("email")} placeholder="ana@gmail.com" className={inputClass} />
            <FieldError state={state} name="email" />
            <span className="mt-1.5 block text-xs text-muted">Si entrará con Google, el correo de su cuenta de Google.</span>
          </label>
        )}
      </div>

      {method === "usuario" ? (
        <div className="sm:max-w-md">
          <span className="mb-1.5 block text-sm font-medium">Contraseña</span>
          <div className="flex gap-2">
            <input name="password" required autoComplete="new-password" value={values.password} onChange={set("password")} placeholder="Mínimo 8 caracteres" className={cn(inputClass, "font-mono")} />
            <button type="button" onClick={() => setValues((v) => ({ ...v, password: suggestPassword() }))} className={cn(buttonClass("secondary"), "h-12")}>
              <RefreshCw className="size-4" aria-hidden /> Generar
            </button>
          </div>
          <FieldError state={state} name="password" />
          <span className="mt-1.5 block text-xs text-muted">Anótala y dásela a la persona: después no se puede ver, solo cambiar por otra.</span>
        </div>
      ) : null}

      <RolePicker value={role} onChange={setRole} />
      {method === "correo" && emailEnabled ? <Toggle name="notify" defaultChecked label="Enviarle un correo con las instrucciones para entrar" /> : null}
      <FieldError state={state} name="role" />
      <SubmitButton pendingLabel="Dando acceso…">Dar acceso al panel</SubmitButton>
    </>
  );
}

function RolePicker({ value, onChange }: { value: PanelRole; onChange: (role: PanelRole) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">Perfil</legend>
      {(["vendedor", "vendedor_virtual", "admin"] as const).map((r) => (
        <label key={r} className="flex items-start gap-3 text-sm">
          <input type="radio" name="role" value={r} checked={value === r} onChange={() => onChange(r)} className="mt-0.5 size-5 accent-white" />
          <span>
            <span className="font-semibold">{PANEL_ROLE_LABEL[r]}</span>
            <span className="block text-muted">{PANEL_ROLE_HINT[r]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

type MemberProps = { id: string; name: string; role: PanelRole; hasUsername: boolean; canChange: boolean; canRemove: boolean };

/** Perfil, contraseña nueva (cuentas con usuario) y quitar el acceso. */
export function MemberActions({ id, name, role, hasUsername, canChange, canRemove }: MemberProps) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(idle);
  const [resetting, setResetting] = useState(false);
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {canChange ? (
          <SelectWrap>
            <select
              aria-label={`Perfil de ${name}`}
              defaultValue={role}
              disabled={pending}
              onChange={(e) => {
                const next = e.target.value;
                start(async () => setState(await changeRoleAction(id, next)));
              }}
              className={cn(selectClass, "h-9 w-44 text-xs")}
            >
              {PANEL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {PANEL_ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </SelectWrap>
        ) : null}
        {hasUsername ? (
          <button type="button" onClick={() => setResetting((r) => !r)} className={buttonClass("ghost", "sm")}>
            <KeyRound className="size-4" aria-hidden /> Nueva contraseña
          </button>
        ) : null}
        {canRemove ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const extra = hasUsername ? "Su usuario deja de funcionar." : "Su cuenta de la tienda sigue igual.";
              if (window.confirm(`¿Quitarle el acceso al panel a ${name}? ${extra}`)) start(async () => setState(await removeAdminAction(id)));
            }}
            className={buttonClass("ghost", "sm")}
          >
            <UserMinus className="size-4" aria-hidden /> {pending ? "Un momento…" : "Quitar acceso"}
          </button>
        ) : null}
      </div>
      {resetting ? <ResetPasswordForm id={id} onDone={() => setResetting(false)} /> : null}
      {state.status !== "idle" ? <FormAlert state={state} /> : null}
    </div>
  );
}

function ResetPasswordForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [state, action] = useActionState(resetPasswordAction.bind(null, id), idle);
  const [password, setPassword] = useState("");
  if (state.status === "success")
    return (
      <div className="space-y-2">
        <FormAlert state={state} />
        <button type="button" onClick={onDone} className={buttonClass("ghost", "sm")}>
          Listo
        </button>
      </div>
    );
  return (
    <form action={action} className="flex w-full flex-wrap items-start gap-2 sm:w-auto sm:justify-end">
      <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
        <input name="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña nueva" aria-label="Contraseña nueva" className={cn(inputCompactClass, "font-mono")} />
        <FieldError state={state} name="password" />
      </div>
      <button type="button" onClick={() => setPassword(suggestPassword())} className={cn(buttonClass("secondary", "sm"), "h-11")}>
        Generar
      </button>
      <SubmitButton variant="secondary" pendingLabel="Guardando…" className="h-11">
        Guardar
      </SubmitButton>
      {state.status === "error" && !state.fieldErrors ? <FormAlert state={state} /> : null}
    </form>
  );
}
