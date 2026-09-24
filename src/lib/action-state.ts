import type { z } from "zod";

/** Resultado de una acción de formulario (para useActionState), en la tienda y en el admin. */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Para forzar que el formulario muestre el mensaje de nuevo aunque sea igual. */
  at?: number;
  /** Lo que escribió la persona: React limpia el formulario al terminar la acción y así no se pierde. */
  values?: Record<string, string>;
};

export const idle: ActionState = { status: "idle" };
export const success = (message: string): ActionState => ({ status: "success", message, at: Date.now() });
export const failure = (message: string, fieldErrors?: Record<string, string>, values?: Record<string, string>): ActionState => ({
  status: "error",
  message,
  fieldErrors,
  values,
  at: Date.now(),
});

/** Los campos de texto de un FormData (para devolverlos en `values`). */
export const formValues = (fd: FormData): Record<string, string> =>
  Object.fromEntries([...fd.entries()].filter((e): e is [string, string] => typeof e[1] === "string" && !e[0].startsWith("$")));

export function zodFailure(error: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
  return failure("Revisa los campos marcados.", fieldErrors);
}
