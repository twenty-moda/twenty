/**
 * Cuentas: se entra con Google o con correo y contraseña (Firebase confirma quién es; ver firebase-auth.ts). Es una
 * sola cuenta por email: la misma fila de `users` para la tienda y, si tiene rol admin, para el panel. La cuenta
 * reúne los pedidos hechos con ese email, los datos para el checkout (en `customers`, el mismo registro que llena
 * cada compra) y las direcciones guardadas.
 */
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { AddressInput, ProfileInput } from "@/lib/account-forms";
import type { Courier } from "@/lib/couriers";
import { accountLogin, isPanelRole, PANEL_ROLES, type PanelRole } from "@/lib/panel-access";
import type { Db } from "../db/client";
import { addresses, customers, districts, orderItems, orders, sessions, users, type UserRole } from "../db/schema";
import type { FirebaseIdentity } from "./firebase-auth";
import { ORDERS_ID } from "./orders";
import { hashPassword, normalizeUsername, passwordProblem, USERNAME_PATTERN, verifyPassword } from "./passwords";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const MAX_ADDRESSES = 10;

export type AccountUser = { id: string; name: string; email: string };

/**
 * Entra (o crea la cuenta de cliente) con la identidad de Firebase. Busca por el uid y, si no, por el email
 * (verificado), así una cuenta que ya existía con ese email (creada en el panel, migrada o con el otro método de
 * ingreso) queda vinculada y es la misma. Con `createIfMissing: false` (panel) solo entra una cuenta que ya exista.
 */
export async function signInWithFirebase(
  db: Db,
  identity: FirebaseIdentity,
  { createIfMissing = true, now = new Date() }: { createIfMissing?: boolean; now?: Date } = {},
): Promise<{ ok: true; userId: string; role: UserRole } | { ok: false; reason: "inactive" | "not_found" }> {
  return db.transaction(async (tx) => {
    const [byUid] = await tx.select().from(users).where(eq(users.firebaseUid, identity.uid)).limit(1);
    const [byEmail] = byUid ? [] : await tx.select().from(users).where(eq(users.email, identity.email)).limit(1);
    const existing = byUid ?? byEmail;
    if (existing && !existing.isActive) return { ok: false as const, reason: "inactive" as const };
    if (!existing && !createIfMissing) return { ok: false as const, reason: "not_found" as const };

    let userId: string;
    if (existing) {
      // Si cambió el email de su cuenta de Google, se actualiza (salvo que otra cuenta ya lo use).
      const emailChanged = existing.email !== identity.email;
      const emailFree = emailChanged && !(await tx.select({ id: users.id }).from(users).where(eq(users.email, identity.email)).limit(1)).length;
      await tx
        .update(users)
        .set({
          firebaseUid: identity.uid,
          photoUrl: identity.picture ?? existing.photoUrl,
          lastLoginAt: now,
          updatedAt: now,
          ...(emailFree ? { email: identity.email } : {}),
          // Nombre de Google si la cuenta aún no tenía uno propio.
          ...(!existing.name.trim() && identity.name ? { name: identity.name } : {}),
        })
        .where(eq(users.id, existing.id));
      userId = existing.id;
    } else {
      const [created] = await tx
        .insert(users)
        .values({
          name: identity.name ?? identity.email.split("@")[0],
          email: identity.email,
          firebaseUid: identity.uid,
          photoUrl: identity.picture,
          role: "customer",
          lastLoginAt: now,
        })
        .returning({ id: users.id });
      userId = created.id;
    }
    // El registro de cliente con ese email (el que llenan las compras) queda enlazado a la cuenta.
    await tx.update(customers).set({ userId }).where(and(eq(customers.email, identity.email), isNull(customers.userId)));
    return { ok: true as const, userId, role: existing?.role ?? ("customer" as const) };
  });
}

export async function getAccountUser(db: Db, userId: string) {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, photoUrl: users.photoUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

// ─── Mis datos ───────────────────────────────────────────────────────────────

export type AccountProfile = {
  name: string;
  email: string;
  phone: string;
  documentType: "dni" | "ce" | "pasaporte";
  documentNumber: string;
};

/** Datos para el checkout: los de la última compra con ese email, o el nombre de Google si aún no compró. */
export async function getAccountProfile(db: Db, user: AccountUser): Promise<AccountProfile> {
  const [customer] = await db.select().from(customers).where(eq(customers.email, user.email)).limit(1);
  // El checkout pide DNI, C.E. o pasaporte (el RUC va aparte, en la factura).
  const type = customer?.documentType;
  const personal = type === "dni" || type === "ce" || type === "pasaporte";
  return {
    name: customer?.name ?? user.name,
    email: user.email,
    phone: customer?.phone ?? "",
    documentType: personal ? type : "dni",
    documentNumber: personal ? (customer?.documentNumber ?? "") : "",
  };
}

export async function saveAccountProfile(db: Db, user: AccountUser, input: ProfileInput) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(customers)
      .values({ userId: user.id, email: user.email, name: input.name, phone: input.phone, documentType: input.documentType, documentNumber: input.documentNumber })
      .onConflictDoUpdate({
        target: customers.email,
        set: { userId: user.id, name: input.name, phone: input.phone, documentType: input.documentType, documentNumber: input.documentNumber, updatedAt: now },
      });
    await tx.update(users).set({ name: input.name, phone: input.phone, updatedAt: now }).where(eq(users.id, user.id));
  });
}

// ─── Mis pedidos ─────────────────────────────────────────────────────────────

/** Los pedidos hechos con el email de la cuenta (también los de antes de crearla). */
export async function listAccountOrders(db: Db, email: string) {
  return db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      createdAt: orders.createdAt,
      totalCents: orders.totalCents,
      shippingMethodName: orders.shippingMethodName,
      units: sql<number>`(select coalesce(sum(${orderItems.quantity}), 0)::int from ${orderItems} where ${orderItems.orderId} = ${ORDERS_ID})`,
      image: sql<string | null>`(select ${orderItems.image} from ${orderItems} where ${orderItems.orderId} = ${ORDERS_ID} and ${orderItems.image} is not null order by ${orderItems.productName} limit 1)`,
    })
    .from(orders)
    .where(eq(orders.email, email))
    .orderBy(desc(orders.createdAt))
    .limit(100);
}

// ─── Direcciones ─────────────────────────────────────────────────────────────

export type SavedAddress = Awaited<ReturnType<typeof listAddresses>>[number];

export async function listAddresses(db: Db, userId: string) {
  return db
    .select({
      id: addresses.id,
      kind: addresses.kind,
      label: addresses.label,
      ubigeo: addresses.ubigeo,
      address: addresses.address,
      reference: addresses.reference,
      agencyName: addresses.agencyName,
      agencyId: addresses.agencyId,
      agencyCourier: addresses.agencyCourier,
      isDefault: addresses.isDefault,
      district: districts.name,
      province: districts.province,
      department: districts.department,
    })
    .from(addresses)
    .innerJoin(districts, eq(districts.ubigeo, addresses.ubigeo))
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), desc(addresses.updatedAt));
}

export type SaveAddressResult = { ok: true; id: string } | { ok: false; field?: keyof AddressInput; message: string };

/** Crea o edita una dirección. La primera queda como principal; marcar otra como principal desmarca la anterior. */
export async function saveAddress(db: Db, userId: string, input: AddressInput, id?: string): Promise<SaveAddressResult> {
  const [district] = await db.select().from(districts).where(eq(districts.ubigeo, input.ubigeo)).limit(1);
  if (!district) return { ok: false, field: "ubigeo", message: "Elige el distrito" };
  if (input.kind === "delivery" && district.deliveryPriceCents === null) {
    return { ok: false, field: "ubigeo", message: "El delivery llega solo a Lima Metropolitana y Callao. Para provincia, guarda una agencia." };
  }
  const values = {
    kind: input.kind,
    label: input.label,
    ubigeo: input.ubigeo,
    address: input.kind === "delivery" ? input.address : null,
    reference: input.kind === "delivery" ? input.reference : null,
    agencyName: input.kind === "agency" ? input.agencyName : null,
    agencyId: input.kind === "agency" ? (input.agencyId ?? null) : null,
    agencyCourier: input.kind === "agency" && input.agencyId ? input.agencyCourier : null,
  };

  return db.transaction(async (tx) => {
    const others = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, userId));
    if (!id && others.length >= MAX_ADDRESSES) return { ok: false as const, message: `Puedes guardar hasta ${MAX_ADDRESSES} direcciones. Borra alguna para agregar otra.` };
    const makeDefault = input.isDefault || others.filter((o) => o.id !== id).length === 0;
    let savedId = id;
    if (id) {
      const updated = await tx
        .update(addresses)
        .set({ ...values, ...(makeDefault ? { isDefault: true } : {}), updatedAt: new Date() })
        .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
        .returning({ id: addresses.id });
      if (!updated.length) return { ok: false as const, message: "Esa dirección ya no existe." };
    } else {
      const [created] = await tx.insert(addresses).values({ ...values, userId, isDefault: makeDefault }).returning({ id: addresses.id });
      savedId = created.id;
    }
    if (makeDefault) await tx.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, userId), ne(addresses.id, savedId!)));
    return { ok: true as const, id: savedId! };
  });
}

export async function setDefaultAddress(db: Db, userId: string, id: string) {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(addresses)
      .set({ isDefault: true })
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning({ id: addresses.id });
    if (updated.length) await tx.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, userId), ne(addresses.id, id)));
  });
}

/** Borra una dirección; si era la principal, pasa a serlo la más reciente. */
export async function deleteAddress(db: Db, userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning({ isDefault: addresses.isDefault });
    if (!deleted?.isDefault) return;
    const [next] = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, userId)).orderBy(desc(addresses.updatedAt)).limit(1);
    if (next) await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
  });
}

/**
 * Después de comprar con la cuenta abierta: guarda la dirección usada si es nueva (si ya estaba, solo la pone
 * primero) y enlaza el registro de cliente. Etiqueta por defecto: el distrito o la agencia.
 */
export async function rememberCheckoutAddress(
  db: Db,
  userId: string,
  input: {
    kind: "delivery" | "agency";
    ubigeo: string;
    address?: string | null;
    reference?: string | null;
    agencyName?: string | null;
    agencyId?: string | null;
    agencyCourier?: Courier | null;
  },
) {
  const saved = await listAddresses(db, userId);
  const same = (value: string | null | undefined, other: string | null) => (value ?? "").trim().toLowerCase() === (other ?? "").trim().toLowerCase();
  const match = saved.find(
    (a) =>
      a.kind === input.kind &&
      (input.kind === "delivery"
        ? a.ubigeo === input.ubigeo && same(input.address, a.address)
        : input.agencyId
          ? a.agencyId === input.agencyId && a.agencyCourier === (input.agencyCourier ?? null)
          : a.ubigeo === input.ubigeo && same(input.agencyName, a.agencyName)),
  );
  if (match) {
    await db.update(addresses).set({ updatedAt: new Date(), ...(input.kind === "delivery" ? { reference: input.reference ?? null } : {}) }).where(eq(addresses.id, match.id));
    return;
  }
  if (saved.length >= MAX_ADDRESSES) return;
  const [district] = await db.select({ name: districts.name }).from(districts).where(eq(districts.ubigeo, input.ubigeo)).limit(1);
  if (!district) return;
  await saveAddress(db, userId, {
    kind: input.kind,
    label: input.kind === "delivery" ? district.name : (input.agencyName ?? district.name).slice(0, 40),
    ubigeo: input.ubigeo,
    address: input.address ?? null,
    reference: input.reference ?? null,
    agencyName: input.agencyName ?? null,
    agencyId: input.agencyId ?? null,
    agencyCourier: input.agencyId ? (input.agencyCourier ?? null) : null,
    isDefault: false,
  });
}

/** Enlaza el registro de cliente de una compra con la cuenta que la hizo (si el email es el mismo). */
export async function linkCustomerToAccount(db: Db, user: AccountUser, orderEmail: string) {
  if (orderEmail.toLowerCase() !== user.email) return;
  await db.update(customers).set({ userId: user.id }).where(and(eq(customers.email, user.email), isNull(customers.userId)));
}

// ─── Equipo (quién entra al panel) ───────────────────────────────────────────

/**
 * Da acceso al panel a un email: crea la cuenta o, si ya existía (p. ej. como cliente de la tienda), le da el rol
 * admin. La persona entra en /admin/login con Google o creando su contraseña con ese correo (Firebase).
 */
export async function grantAdmin(db: Db, input: { email: string; name: string }) {
  const result = await grantPanelAccess(db, { ...input, role: "admin" });
  if (!result.ok) throw new Error(result.message); // dar admin nunca deja el panel sin admins
  return { ...result.user, alreadyAdmin: result.previousRole === "admin" };
}

export { PANEL_ROLES, type PanelRole } from "@/lib/panel-access";

type TeamFail = { ok: false; field?: "username" | "password"; message: string };
const LAST_ADMIN = "Tiene que quedar al menos un admin.";

/** Admins activos, bloqueados hasta el final de la transacción: dos cambios a la vez no dejan el panel sin admins. */
const lockAdmins = (tx: Tx) =>
  tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)))
    .for("update");

/**
 * Da acceso al panel con un perfil a un correo (crea la cuenta o cambia el de una que ya existía, también la de un
 * cliente). Entra con Google o con correo y contraseña de Firebase. Pasar a vendedor al único admin dejaría el panel
 * sin nadie que lo maneje: no se permite.
 */
export async function grantPanelAccess(
  db: Db,
  input: { email: string; name: string; role: PanelRole },
): Promise<{ ok: true; user: { id: string; email: string; name: string }; previousRole: UserRole | null } | { ok: false; message: string }> {
  const email = input.email.trim().toLowerCase();
  return db.transaction(async (tx) => {
    const admins = await lockAdmins(tx);
    const [before] = await tx.select({ role: users.role }).from(users).where(eq(users.email, email)).limit(1);
    if (input.role !== "admin" && before?.role === "admin" && admins.length <= 1) return { ok: false as const, message: LAST_ADMIN };
    const [user] = await tx
      .insert(users)
      .values({ email, name: input.name.trim(), role: input.role })
      .onConflictDoUpdate({ target: users.email, set: { role: input.role, isActive: true, updatedAt: new Date() } })
      .returning({ id: users.id, name: users.name });
    return { ok: true as const, user: { ...user, email }, previousRole: before?.role ?? null };
  });
}

/**
 * Cuenta del equipo con usuario y contraseña, sin correo (TWENTY no tiene correo corporativo). Si ese usuario existió
 * y se le quitó el acceso, vuelve con la contraseña y el perfil nuevos.
 */
export async function createStaffAccount(
  db: Db,
  input: { username: string; name: string; role: PanelRole; password: string },
): Promise<{ ok: true; user: { id: string; username: string; name: string }; reactivated: boolean } | TeamFail> {
  const username = normalizeUsername(input.username);
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, field: "username", message: "El usuario va en minúsculas, de 3 a 30 letras o números (puede llevar . - _), sin espacios ni @." };
  }
  const problem = passwordProblem(input.password, username);
  if (problem) return { ok: false, field: "password", message: problem };
  const panelPasswordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id, isActive: users.isActive, role: users.role }).from(users).where(eq(users.username, username)).for("update");
    if (existing?.isActive && isPanelRole(existing.role)) return { ok: false as const, field: "username" as const, message: "Ya hay alguien del equipo con ese usuario." };
    const values = { name: input.name.trim(), role: input.role, panelPasswordHash, isActive: true, updatedAt: new Date() };
    const [user] = existing
      ? await tx.update(users).set(values).where(eq(users.id, existing.id)).returning({ id: users.id, name: users.name })
      : await tx
          .insert(users)
          .values({ ...values, username })
          .returning({ id: users.id, name: users.name });
    return { ok: true as const, user: { ...user, username }, reactivated: !!existing };
  });
}

/** Entra al panel con usuario y contraseña. No dice qué falló (usuario, contraseña o cuenta sin acceso). */
export async function signInWithPassword(
  db: Db,
  input: { username: string; password: string },
  now = new Date(),
): Promise<{ ok: true; userId: string; role: PanelRole } | { ok: false }> {
  const username = normalizeUsername(input.username);
  const [user] = USERNAME_PATTERN.test(username)
    ? await db
        .select({ id: users.id, role: users.role, isActive: users.isActive, hash: users.panelPasswordHash })
        .from(users)
        .where(eq(users.username, username))
        .limit(1)
    : [];
  // verifyPassword tarda lo mismo aunque el usuario no exista.
  const valid = await verifyPassword(input.password, user?.hash ?? null);
  if (!user || !valid || !user.isActive || !isPanelRole(user.role)) return { ok: false };
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  return { ok: true, userId: user.id, role: user.role };
}

/** El admin cambia el perfil de alguien del equipo (nunca deja el panel sin admins). */
export async function setPanelRole(db: Db, userId: string, role: PanelRole): Promise<{ ok: true; name: string } | TeamFail> {
  return db.transaction(async (tx) => {
    const admins = await lockAdmins(tx);
    const [target] = await tx.select({ name: users.name, role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, userId)).for("update");
    if (!target?.isActive || !isPanelRole(target.role)) return { ok: false as const, message: "Esa persona ya no tiene acceso al panel." };
    if (target.role === "admin" && role !== "admin" && admins.length <= 1) return { ok: false as const, message: LAST_ADMIN };
    await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
    return { ok: true as const, name: target.name };
  });
}

/** Prende o apaga los avisos de pedidos por correo de alguien del equipo (solo les llegan a los admin con correo). */
export async function setOrderEmails(db: Db, userId: string, enabled: boolean): Promise<{ ok: true; name: string } | TeamFail> {
  const [updated] = await db
    .update(users)
    .set({ orderEmails: enabled, updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.isActive, true), inArray(users.role, [...PANEL_ROLES])))
    .returning({ name: users.name });
  return updated ? { ok: true, name: updated.name } : { ok: false, message: "Esa persona ya no tiene acceso al panel." };
}

/** Contraseña nueva para una cuenta con usuario: cierra sus sesiones del panel (tiene que volver a entrar). */
export async function setPanelPassword(db: Db, userId: string, password: string): Promise<{ ok: true; username: string } | TeamFail> {
  const [target] = await db.select({ username: users.username, role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target?.username || !target.isActive || !isPanelRole(target.role)) return { ok: false, message: "Esa cuenta no entra con usuario y contraseña." };
  const problem = passwordProblem(password, target.username);
  if (problem) return { ok: false, field: "password", message: problem };
  const panelPasswordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ panelPasswordHash, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.scope, "admin")));
  });
  return { ok: true, username: target.username };
}

/** Admins activos (los que tienen `orderEmails` reciben los avisos de pedidos). */
export function listAdmins(db: Db) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)))
    .orderBy(users.name);
}

/** Quienes entran al panel, con su perfil. */
export function listTeam(db: Db) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, username: users.username, role: users.role, lastLoginAt: users.lastLoginAt, orderEmails: users.orderEmails })
    .from(users)
    .where(and(inArray(users.role, [...PANEL_ROLES]), eq(users.isActive, true)))
    .orderBy(users.role, users.name);
}

/**
 * Quita el acceso al panel: una cuenta con correo vuelve a ser de cliente en la tienda; una con usuario se desactiva.
 * Sus sesiones del panel se cierran al instante. No se puede quitar el acceso propio ni dejar el panel sin admins.
 */
export async function revokeAdmin(db: Db, userId: string, actorId: string): Promise<{ ok: true; login: string } | { ok: false; message: string }> {
  if (userId === actorId) return { ok: false, message: "No puedes quitarte el acceso a ti mismo: pídeselo a otro admin." };
  return db.transaction(async (tx) => {
    const team = await tx
      .select({ id: users.id, email: users.email, username: users.username, role: users.role })
      .from(users)
      .where(and(inArray(users.role, [...PANEL_ROLES]), eq(users.isActive, true)))
      .for("update");
    const target = team.find((a) => a.id === userId);
    if (!target) return { ok: false as const, message: "Esa persona ya no tiene acceso al panel." };
    if (target.role === "admin" && team.filter((a) => a.role === "admin").length <= 1) return { ok: false as const, message: LAST_ADMIN };
    await tx
      .update(users)
      .set(target.email ? { role: "customer", updatedAt: new Date() } : { isActive: false, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.scope, "admin")));
    return { ok: true as const, login: accountLogin(target) };
  });
}
