"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { failure, formValues, success, type ActionState } from "@/lib/action-state";
import { addressSchema, profileSchema, safeReturnPath } from "@/lib/account-forms";
import { formErrors } from "@/lib/public-forms";
import { getDb } from "@/server/db/client";
import {
  deleteAddress,
  getAccountProfile,
  listAddresses,
  saveAccountProfile,
  saveAddress,
  setDefaultAddress,
  signInWithGoogle,
  type AccountProfile,
  type SavedAddress,
} from "@/server/services/accounts";
import { InvalidIdTokenError, verifyFirebaseIdToken } from "@/server/services/firebase-auth";
import { endAccountSession, getAccount, startAccountSession } from "../_lib/account";
import { allowRequest } from "../_lib/request";

export type SignInResult = { ok: true; next: string } | { ok: false; message: string };

/** El navegador entró con Google (Firebase) y manda su ID token: se verifica y se abre la sesión de la tienda. */
export async function signInWithGoogleAction(idToken: unknown, returnTo: unknown): Promise<SignInResult> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return { ok: false, message: "El ingreso con Google aún no está disponible." };
  if (typeof idToken !== "string" || idToken.length > 5000) return { ok: false, message: "No pudimos leer tu cuenta de Google. Inténtalo de nuevo." };
  if (!(await allowRequest("login"))) return { ok: false, message: "Hiciste muchos intentos seguidos. Espera unos minutos." };

  let identity;
  try {
    identity = await verifyFirebaseIdToken(idToken, projectId);
  } catch (error) {
    if (!(error instanceof InvalidIdTokenError)) console.error("[cuenta] No se pudo verificar el token de Google", error instanceof Error ? error.message : error);
    return { ok: false, message: "No pudimos confirmar tu cuenta de Google. Inténtalo de nuevo." };
  }
  const result = await signInWithGoogle(getDb(), identity);
  if (!result.ok) return { ok: false, message: "Esta cuenta está desactivada. Escríbenos por WhatsApp y te ayudamos." };
  await startAccountSession(result.userId);
  return { ok: true, next: safeReturnPath(returnTo) };
}

export async function signOutAction() {
  await endAccountSession();
  redirect("/");
}

export async function saveProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getAccount();
  if (!user) redirect("/ingresar?volver=/cuenta/datos");
  const values = formValues(fd);
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return failure("Revisa los campos marcados.", formErrors(parsed.error), values);
  await saveAccountProfile(getDb(), user, parsed.data);
  refresh();
  return success("Guardamos tus datos. Los usaremos para llenar el checkout.");
}

export async function saveAddressAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getAccount();
  if (!user) redirect("/ingresar?volver=/cuenta/direcciones");
  const values = formValues(fd);
  const parsed = addressSchema.safeParse({ ...values, isDefault: values.isDefault === "on" });
  if (!parsed.success) return failure("Revisa los campos marcados.", formErrors(parsed.error), values);
  const result = await saveAddress(getDb(), user.id, parsed.data, id ?? undefined);
  if (!result.ok) return failure(result.message, result.field ? { [result.field]: result.message } : undefined, values);
  refresh();
  return success(id ? "Dirección actualizada." : "Dirección guardada.");
}

const idSchema = z.uuid();

export async function deleteAddressAction(id: string) {
  const user = await getAccount();
  if (!user || !idSchema.safeParse(id).success) return;
  await deleteAddress(getDb(), user.id, id);
  refresh();
}

export async function setDefaultAddressAction(id: string) {
  const user = await getAccount();
  if (!user || !idSchema.safeParse(id).success) return;
  await setDefaultAddress(getDb(), user.id, id);
  refresh();
}

export type CheckoutAccount = { email: string; profile: AccountProfile; addresses: SavedAddress[] } | null;

/** Para el checkout (que es estático): si hay cuenta abierta, sus datos y direcciones para llenar el formulario. */
export async function getCheckoutAccountAction(): Promise<CheckoutAccount> {
  const user = await getAccount();
  if (!user) return null;
  const db = getDb();
  const [profile, saved] = await Promise.all([getAccountProfile(db, user), listAddresses(db, user.id)]);
  return { email: user.email, profile, addresses: saved };
}
