import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const accounts = await import("./accounts");
const { createSession, validateSession } = await import("./auth");

let db: Db;
const LIMA = "140130";
const AREQUIPA = "040101";
type Identity = Parameters<typeof accounts.signInWithFirebase>[1];
const google = (over: Partial<Identity> = {}): Identity => ({
  uid: "uid-ana",
  email: "ana@example.com",
  name: "Ana Pérez",
  picture: "https://lh3.googleusercontent.com/a/ana",
  provider: "google.com",
  ...over,
});
const delivery = (over: Partial<Parameters<typeof accounts.saveAddress>[2]> = {}) => ({
  kind: "delivery" as const,
  label: "Casa",
  ubigeo: LIMA,
  address: "Av. Primavera 123",
  reference: null,
  agencyName: null,
  isDefault: false,
  ...over,
});

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE districts CASCADE`);
  await db.insert(schema.districts).values([
    { ubigeo: LIMA, name: "Santiago De Surco", province: "Lima", department: "Lima", deliveryPriceCents: 1200 },
    { ubigeo: AREQUIPA, name: "Arequipa", province: "Arequipa", department: "Arequipa", deliveryPriceCents: null },
  ]);
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE payments, order_status_history, order_items, orders, customers, addresses, sessions, users CASCADE`);
});

afterAll(async () => {
  await closeDb();
});

async function signIn(identity = google()) {
  const result = await accounts.signInWithFirebase(db, identity);
  if (!result.ok) throw new Error("no entró");
  return result.userId;
}

describe("signInWithFirebase", () => {
  it("crea la cuenta de cliente la primera vez y la reutiliza después (por el uid)", async () => {
    const first = await signIn();
    const again = await signIn(google({ picture: "https://lh3.googleusercontent.com/a/nueva" }));
    expect(again).toBe(first);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, first));
    expect(user).toMatchObject({ email: "ana@example.com", role: "customer", firebaseUid: "uid-ana", photoUrl: "https://lh3.googleusercontent.com/a/nueva", passwordHash: null });
  });

  it("vincula una cuenta que ya existía con ese email sin cambiarle el rol", async () => {
    const admin = await accounts.grantAdmin(db, { name: "Equipo", email: "Ana@Example.com" });
    expect(await signIn()).toBe(admin.id);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, admin.id));
    expect(user).toMatchObject({ role: "admin", firebaseUid: "uid-ana" });
  });

  it("con correo y contraseña o con Google es la misma cuenta", async () => {
    const withPassword = await signIn(google({ provider: "password", name: null, picture: null }));
    expect(await signIn(google({ provider: "google.com" }))).toBe(withPassword);
    // Aunque Firebase diera otro uid para ese email, se une por el email verificado.
    expect(await signIn(google({ uid: "uid-otro-proveedor" }))).toBe(withPassword);
    expect(await db.select().from(schema.users)).toHaveLength(1);
  });

  it("el panel solo deja entrar a cuentas que ya existen", async () => {
    expect(await accounts.signInWithFirebase(db, google(), { createIfMissing: false })).toEqual({ ok: false, reason: "not_found" });
    await signIn();
    expect(await accounts.signInWithFirebase(db, google(), { createIfMissing: false })).toMatchObject({ ok: true, role: "customer" });
    await accounts.grantAdmin(db, { name: "Ana", email: "ana@example.com" });
    expect(await accounts.signInWithFirebase(db, google(), { createIfMissing: false })).toMatchObject({ ok: true, role: "admin" });
  });

  it("no deja entrar a una cuenta desactivada", async () => {
    const id = await signIn();
    await db.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, id));
    expect(await accounts.signInWithFirebase(db, google())).toEqual({ ok: false, reason: "inactive" });
  });

  it("enlaza el registro de cliente de compras anteriores con ese email", async () => {
    await db.insert(schema.customers).values({ name: "Ana", email: "ana@example.com", phone: "999111222" });
    const id = await signIn();
    const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.email, "ana@example.com"));
    expect(customer.userId).toBe(id);
  });

  it("una sesión de la cuenta no sirve para el panel (aunque el email sea de un admin)", async () => {
    const admin = await accounts.grantAdmin(db, { name: "Equipo", email: "ana@example.com" });
    const { token } = await createSession(db, admin.id, null, "cuenta");
    expect(await validateSession(db, token, "admin")).toBeNull();
    expect(await validateSession(db, token, "cuenta")).toMatchObject({ id: admin.id });
  });
});

describe("mis datos y mis pedidos", () => {
  it("sin compras usa el nombre de Google; al guardar queda para el checkout", async () => {
    const id = await signIn();
    const user = { id, name: "Ana Pérez", email: "ana@example.com" };
    expect(await accounts.getAccountProfile(db, user)).toEqual({ name: "Ana Pérez", email: "ana@example.com", phone: "", documentType: "dni", documentNumber: "" });
    await accounts.saveAccountProfile(db, user, { name: "Ana María Pérez", phone: "987654321", documentType: "dni", documentNumber: "12345678" });
    expect(await accounts.getAccountProfile(db, user)).toMatchObject({ name: "Ana María Pérez", phone: "987654321", documentNumber: "12345678" });
    const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.email, "ana@example.com"));
    expect(customer.userId).toBe(id);
  });

  it("lista solo los pedidos hechos con el email de la cuenta, del más nuevo al más viejo", async () => {
    const [ana] = await db.insert(schema.customers).values({ name: "Ana", email: "ana@example.com", phone: "999111222" }).returning();
    const [otro] = await db.insert(schema.customers).values({ name: "Otro", email: "otro@example.com", phone: "999333444" }).returning();
    const order = (customerId: string, email: string, createdAt: Date) => ({
      customerId,
      email,
      customerName: "X",
      phone: "999111222",
      documentType: "dni" as const,
      documentNumber: "12345678",
      shippingMethodName: "Recojo en tienda",
      shippingKind: "store_pickup" as const,
      paymentMethod: "yape_plin" as const,
      subtotalCents: 9900,
      totalCents: 9900,
      createdAt,
    });
    const [viejo] = await db.insert(schema.orders).values(order(ana.id, "ana@example.com", new Date("2026-09-01"))).returning();
    const [nuevo] = await db.insert(schema.orders).values(order(ana.id, "ana@example.com", new Date("2026-09-20"))).returning();
    await db.insert(schema.orders).values(order(otro.id, "otro@example.com", new Date("2026-09-21")));
    await db.insert(schema.orderItems).values({
      orderId: nuevo.id,
      productName: "Mom Jean",
      productSlug: "mom-jean",
      sku: "TMW-1",
      colorName: "Negro",
      sizeLabel: "30",
      image: "item/TMW-1.webp",
      unitPriceCents: 4950,
      quantity: 2,
      totalCents: 9900,
    });

    const list = await accounts.listAccountOrders(db, "ana@example.com");
    expect(list.map((o) => o.id)).toEqual([nuevo.id, viejo.id]);
    expect(list[0]).toMatchObject({ units: 2, image: "item/TMW-1.webp" });
    expect(list[1]).toMatchObject({ units: 0, image: null });
  });
});

describe("direcciones", () => {
  it("la primera queda como principal; marcar otra como principal desmarca la anterior", async () => {
    const id = await signIn();
    const casa = await accounts.saveAddress(db, id, delivery());
    const trabajo = await accounts.saveAddress(db, id, delivery({ label: "Trabajo", address: "Jr. Lima 456", isDefault: true }));
    if (!casa.ok || !trabajo.ok) throw new Error("no se guardó");
    const list = await accounts.listAddresses(db, id);
    expect(list.map((a) => [a.label, a.isDefault])).toEqual([
      ["Trabajo", true],
      ["Casa", false],
    ]);
    expect(list[0]).toMatchObject({ district: "Santiago De Surco", department: "Lima" });
  });

  it("el delivery solo se guarda en distritos con delivery; en provincia se guarda la agencia", async () => {
    const id = await signIn();
    expect(await accounts.saveAddress(db, id, delivery({ ubigeo: AREQUIPA }))).toMatchObject({ ok: false, field: "ubigeo" });
    expect(await accounts.saveAddress(db, id, { ...delivery({ ubigeo: AREQUIPA, address: null }), kind: "agency", label: "Shalom", agencyName: "Shalom Av. Ejército" })).toMatchObject({ ok: true });
  });

  it("al borrar la principal pasa a serlo otra; nadie puede tocar las direcciones de otra cuenta", async () => {
    const id = await signIn();
    const intruso = await signIn(google({ uid: "uid-otro", email: "otro@example.com" }));
    const casa = await accounts.saveAddress(db, id, delivery());
    await accounts.saveAddress(db, id, delivery({ label: "Trabajo", address: "Jr. Lima 456" }));
    if (!casa.ok) throw new Error("no se guardó");

    await accounts.deleteAddress(db, intruso, casa.id);
    expect(await accounts.saveAddress(db, intruso, delivery({ label: "Mía" }), casa.id)).toMatchObject({ ok: false });
    expect(await accounts.listAddresses(db, id)).toHaveLength(2);

    await accounts.deleteAddress(db, id, casa.id);
    expect((await accounts.listAddresses(db, id)).map((a) => [a.label, a.isDefault])).toEqual([["Trabajo", true]]);
  });

  it(`hasta ${10} direcciones`, async () => {
    const id = await signIn();
    for (let i = 0; i < accounts.MAX_ADDRESSES; i++) await accounts.saveAddress(db, id, delivery({ label: `D${i}`, address: `Calle ${i}` }));
    expect(await accounts.saveAddress(db, id, delivery({ label: "Una más" }))).toMatchObject({ ok: false });
  });

  it("después de comprar guarda la dirección nueva y no repite una que ya estaba", async () => {
    const id = await signIn();
    await accounts.rememberCheckoutAddress(db, id, { kind: "delivery", ubigeo: LIMA, address: "Av. Primavera 123", reference: "Portón negro" });
    await accounts.rememberCheckoutAddress(db, id, { kind: "delivery", ubigeo: LIMA, address: "  av. primavera 123 ", reference: "Portón verde" });
    await accounts.rememberCheckoutAddress(db, id, { kind: "agency", ubigeo: AREQUIPA, agencyName: "Shalom Av. Ejército" });
    const list = await accounts.listAddresses(db, id);
    expect(list).toHaveLength(2);
    expect(list.find((a) => a.kind === "delivery")).toMatchObject({ label: "Santiago De Surco", reference: "Portón verde", isDefault: true });
    expect(list.find((a) => a.kind === "agency")).toMatchObject({ label: "Shalom Av. Ejército", isDefault: false });
  });
});
