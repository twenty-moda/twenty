"use server";

import { failure, formValues, success, type ActionState } from "@/lib/action-state";
import { formErrors, subscribeSchema } from "@/lib/public-forms";
import { getDb } from "@/server/db/client";
import { subscribe } from "@/server/services/messages";
import { allowRequest } from "../_lib/request";

export async function subscribeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  if (values.website) return success("¡Listo! Te avisaremos de los próximos drops.");
  const parsed = subscribeSchema.safeParse(values);
  if (!parsed.success) return failure(formErrors(parsed.error).email ?? "Revisa tu email", undefined, values);
  if (!(await allowRequest("subscribe"))) return failure("Inténtalo de nuevo en un rato.", undefined, values);
  await subscribe(getDb(), parsed.data.email);
  return success("¡Listo! Te avisaremos de los próximos drops.");
}
