import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";

// El cliente de BD lee DATABASE_URL: se apunta a la BD de tests antes de importarlo.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { getOnlineWarehouseId } = await import("./stock");
const { getOperation, listOperations, registerOperation, saveWarehouse } = await import("./inventory");

let db: Db;
let online: string;
const ids = {
  category: randomUUID(),
  product: randomUUID(),
  color: randomUUID(),
  size: randomUUID(),
  variant: randomUUID(),
  depot: randomUUID(),
};

async function level(warehouseId: string) {
  const [row] = await db
    .select({ quantity: schema.inventoryLevels.quantity })
    .from(schema.inventoryLevels)
    .where(and(eq(schema.inventoryLevels.variantId, ids.variant), eq(schema.inventoryLevels.warehouseId, warehouseId)));
  return row?.quantity ?? 0;
}
async function webStock() {
  const [v] = await db.select({ stock: schema.productVariants.stock }).from(schema.productVariants).where(eq(schema.productVariants.id, ids.variant));
  return v.stock;
}
const line = (quantity: number, unitCostCents: number | null = null) => ({ variantId: ids.variant, quantity, unitCostCents });

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE order_status_history, order_items, orders, customers, product_images, product_redirects, product_variants,
    products, category_fits, categories, fits, colors, sizes CASCADE`);
  online = await getOnlineWarehouseId(db);
  await db.insert(schema.warehouses).values({ id: ids.depot, name: "Depósito de prueba", code: "TST" });
  await db.insert(schema.categories).values({ id: ids.category, slug: "pantalones", name: "Pantalones" });
  await db.insert(schema.colors).values({ id: ids.color, slug: "negro", name: "Negro" });
  await db.insert(schema.sizes).values({ id: ids.size, label: "30" });
  await db.insert(schema.products).values({ id: ids.product, slug: "mom-jean", name: "Mom Jean", categoryId: ids.category, status: "active" });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE stock_operations, product_variants RESTART IDENTITY CASCADE`);
  await db.insert(schema.productVariants).values({ id: ids.variant, productId: ids.product, sku: "TMW-TEST", colorId: ids.color, sizeId: ids.size, priceCents: 7000, stock: 2 });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE stock_operations, product_variants RESTART IDENTITY CASCADE`);
  await db.delete(schema.warehouses).where(eq(schema.warehouses.id, ids.depot));
  await closeDb();
});

describe("registerOperation", () => {
  it("ingreso al depósito: suma, guarda el costo y no refresca la tienda", async () => {
    const result = await registerOperation(db, { kind: "ingreso", fromWarehouseId: null, toWarehouseId: ids.depot, reason: null, note: "Lote del taller", lines: [line(10, 3500)] }, null);
    expect(result).toEqual({ ok: true, number: 1, productSlugs: [] });
    expect(await level(ids.depot)).toBe(10);
    const op = await getOperation(db, 1);
    expect(op?.lines.map((l) => [l.type, l.quantity, l.balanceAfter, l.unitCostCents])).toEqual([["ingreso", 10, 10, 3500]]);
    expect(op?.note).toBe("Lote del taller");
  });

  it("traslado al almacén de la web: mueve las dos puntas y la tienda lo ve", async () => {
    await registerOperation(db, { kind: "ingreso", fromWarehouseId: null, toWarehouseId: ids.depot, reason: null, note: null, lines: [line(5)] }, null);
    const result = await registerOperation(db, { kind: "traslado", fromWarehouseId: ids.depot, toWarehouseId: online, reason: null, note: null, lines: [line(3)] }, null);
    expect(result).toEqual({ ok: true, number: 2, productSlugs: ["mom-jean"] });
    expect([await level(ids.depot), await webStock(), await level(online)]).toEqual([2, 5, 5]);
    const op = await getOperation(db, 2);
    expect(op?.lines.map((l) => [l.type, l.quantity])).toEqual([
      ["traslado_salida", -3],
      ["traslado_entrada", 3],
    ]);
  });

  it("si no alcanza, no mueve nada ni gasta un número", async () => {
    const failed = await registerOperation(db, { kind: "traslado", fromWarehouseId: online, toWarehouseId: ids.depot, reason: null, note: null, lines: [line(3)] }, null);
    expect(failed).toEqual({ ok: false, message: "No alcanza el stock de TMW-TEST en Tienda Gamarra." });
    expect([await webStock(), await level(ids.depot)]).toEqual([2, 0]);
    const ok = await registerOperation(db, { kind: "salida", fromWarehouseId: online, toWarehouseId: null, reason: "devolucion_proveedor", note: "Fallas", lines: [line(2)] }, null);
    expect(ok).toMatchObject({ ok: true, number: 1 });
    expect(await webStock()).toBe(0);
    const { rows } = await listOperations(db);
    expect(rows.map((r) => [r.number, r.kind, r.units, r.reason])).toEqual([[1, "salida", 2, "devolucion_proveedor"]]);
  });

  it("no deja usar un almacén desactivado", async () => {
    const saved = await saveWarehouse(db, ids.depot, { name: "Depósito de prueba", code: "TST", address: null, isActive: false });
    expect(saved.ok).toBe(true);
    const result = await registerOperation(db, { kind: "ingreso", fromWarehouseId: null, toWarehouseId: ids.depot, reason: null, note: null, lines: [line(1)] }, null);
    expect(result).toEqual({ ok: false, message: "Ese almacén no existe o está desactivado." });
    await saveWarehouse(db, ids.depot, { name: "Depósito de prueba", code: "TST", address: null, isActive: true });
  });
});

describe("saveWarehouse", () => {
  it("no repite códigos ni deja desactivar el almacén de la web", async () => {
    expect(await saveWarehouse(db, null, { name: "Otro", code: "TST", address: null, isActive: true })).toEqual({ ok: false, message: "El código TST ya lo usa “Depósito de prueba”." });
    const [web] = await db.select().from(schema.warehouses).where(eq(schema.warehouses.id, online)).orderBy(asc(schema.warehouses.name));
    expect(await saveWarehouse(db, online, { name: web.name, code: web.code, address: web.address, isActive: false })).toEqual({
      ok: false,
      message: "El almacén que vende en la web no se puede desactivar.",
    });
  });
});
