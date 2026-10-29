/** Inventario desde el admin: almacenes, ingresos, traslados y salidas, y el kardex. El stock se mueve en `stock.ts`. */
import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { EXIT_REASONS, OPERATION_KINDS, type MovementType } from "@/lib/inventory";
import type { Db } from "../db/client";
import { colors, inventoryLevels, orders, products, productVariants, sizes, stockMovements, stockOperations, users, warehouses } from "../db/schema";
import type { ServiceResult } from "./admin-products";
import { InsufficientStockError, moveStock, type StockChange } from "./stock";

// ─── Almacenes ───────────────────────────────────────────────────────────────

const WAREHOUSES_ID = sql.raw(`"warehouses"."id"`);

export async function listWarehouses(db: Db) {
  return db
    .select({
      id: warehouses.id,
      name: warehouses.name,
      code: warehouses.code,
      address: warehouses.address,
      sellsOnline: warehouses.sellsOnline,
      isActive: warehouses.isActive,
      units: sql<number>`(select coalesce(sum(l.quantity), 0)::int from ${inventoryLevels} l where l.warehouse_id = ${WAREHOUSES_ID})`,
      variants: sql<number>`(select count(*)::int from ${inventoryLevels} l where l.warehouse_id = ${WAREHOUSES_ID} and l.quantity > 0)`,
    })
    .from(warehouses)
    .orderBy(asc(warehouses.position), asc(warehouses.name));
}

export const warehouseInputSchema = z.object({
  name: z.string().trim().min(2, "Falta el nombre").max(60),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, "El código lleva de 2 a 6 letras o números (ej. SJM)"),
  address: z.string().trim().max(160).nullable(),
  isActive: z.boolean(),
});

export async function saveWarehouse(db: Db, id: string | null, input: z.infer<typeof warehouseInputSchema>): Promise<ServiceResult> {
  const [clash] = await db
    .select({ name: warehouses.name, code: warehouses.code })
    .from(warehouses)
    .where(and(or(eq(warehouses.name, input.name), eq(warehouses.code, input.code)), id ? ne(warehouses.id, id) : undefined))
    .limit(1);
  if (clash) return { ok: false, message: clash.code === input.code ? `El código ${input.code} ya lo usa “${clash.name}”.` : `Ya hay un almacén “${input.name}”.` };

  const values = { ...input, address: input.address || null };
  if (id) {
    const [current] = await db.select({ sellsOnline: warehouses.sellsOnline }).from(warehouses).where(eq(warehouses.id, id));
    if (!current) return { ok: false, message: "El almacén no existe." };
    if (current.sellsOnline && !input.isActive) return { ok: false, message: "El almacén que vende en la web no se puede desactivar." };
    await db.update(warehouses).set(values).where(eq(warehouses.id, id));
  } else {
    const [{ position }] = await db.select({ position: sql<number>`coalesce(max(${warehouses.position}), -1)::int + 1` }).from(warehouses);
    await db.insert(warehouses).values({ ...values, position });
  }
  return { ok: true };
}

// ─── Prendas para elegir en una operación ────────────────────────────────────

export type PickerVariant = {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  priceCents: number;
  colorName: string;
  sizeLabel: string;
  isActive: boolean;
  /** Stock por almacén (id → unidades). */
  levels: Record<string, number>;
};

export async function listPickerVariants(db: Db): Promise<PickerVariant[]> {
  const [rows, levels] = await Promise.all([
    db
      .select({
        variantId: productVariants.id,
        sku: productVariants.sku,
        productId: products.id,
        productName: products.name,
        priceCents: productVariants.priceCents,
        colorName: colors.name,
        sizeLabel: sizes.label,
        isActive: productVariants.isActive,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(colors, eq(colors.id, productVariants.colorId))
      .innerJoin(sizes, eq(sizes.id, productVariants.sizeId))
      .orderBy(asc(products.name), asc(colors.name), asc(sizes.position)),
    db.select({ variantId: inventoryLevels.variantId, warehouseId: inventoryLevels.warehouseId, quantity: inventoryLevels.quantity }).from(inventoryLevels),
  ]);
  const byVariant = new Map<string, Record<string, number>>();
  for (const l of levels) {
    const entry = byVariant.get(l.variantId) ?? {};
    entry[l.warehouseId] = l.quantity;
    byVariant.set(l.variantId, entry);
  }
  return rows.map((r) => ({ ...r, levels: byVariant.get(r.variantId) ?? {} }));
}

// ─── Operaciones: ingreso, traslado y salida ─────────────────────────────────

export const operationInputSchema = z
  .object({
    kind: z.enum(OPERATION_KINDS),
    fromWarehouseId: z.uuid().nullable(),
    toWarehouseId: z.uuid().nullable(),
    reason: z.enum(EXIT_REASONS).nullable(),
    note: z.string().trim().max(300).nullable(),
    lines: z
      .array(
        z.object({
          variantId: z.uuid(),
          quantity: z.number().int().positive("La cantidad debe ser mayor que 0").max(100_000),
          unitCostCents: z.number().int().positive().nullable(),
        }),
      )
      .min(1, "Agrega al menos una prenda.")
      .max(500),
  })
  .superRefine((v, ctx) => {
    if (v.kind !== "ingreso" && !v.fromWarehouseId) ctx.addIssue({ code: "custom", path: ["fromWarehouseId"], message: "Elige de qué almacén sale." });
    if (v.kind !== "salida" && !v.toWarehouseId) ctx.addIssue({ code: "custom", path: ["toWarehouseId"], message: "Elige a qué almacén entra." });
    if (v.kind === "traslado" && v.fromWarehouseId === v.toWarehouseId) ctx.addIssue({ code: "custom", path: ["toWarehouseId"], message: "El origen y el destino son el mismo almacén." });
    if (v.kind === "salida" && !v.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "Elige el motivo de la salida." });
  });
export type OperationInput = z.infer<typeof operationInputSchema>;

/**
 * Registra la operación y mueve el stock de todas sus prendas en una sola transacción: si una no alcanza, no se mueve
 * ninguna. El número se asigna al final, así una operación que falla no gasta uno. Devuelve las fichas a refrescar
 * cuando toca el almacén de la web.
 */
export async function registerOperation(db: Db, input: OperationInput, userId: string | null): Promise<ServiceResult<{ number: number; productSlugs: string[] }>> {
  const from = input.kind === "ingreso" ? null : input.fromWarehouseId;
  const to = input.kind === "salida" ? null : input.toWarehouseId;
  const warehouseIds = [from, to].filter((id): id is string => !!id);
  const found = await db.select({ id: warehouses.id, name: warehouses.name, isActive: warehouses.isActive, sellsOnline: warehouses.sellsOnline }).from(warehouses).where(inArray(warehouses.id, warehouseIds));
  if (found.length !== warehouseIds.length || found.some((w) => !w.isActive)) return { ok: false, message: "Ese almacén no existe o está desactivado." };

  const variantIds = [...new Set(input.lines.map((l) => l.variantId))];
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(productVariants).where(inArray(productVariants.id, variantIds));
  if (count !== variantIds.length) return { ok: false, message: "Una de las prendas ya no existe. Recarga la página." };

  const changes: StockChange[] = input.lines.flatMap((l) => {
    const out: StockChange[] = [];
    if (from) out.push({ variantId: l.variantId, warehouseId: from, quantity: -l.quantity, type: input.kind === "traslado" ? "traslado_salida" : input.reason! });
    if (to) {
      out.push({
        variantId: l.variantId,
        warehouseId: to,
        quantity: l.quantity,
        type: input.kind === "traslado" ? "traslado_entrada" : "ingreso",
        unitCostCents: input.kind === "ingreso" ? l.unitCostCents : null,
      });
    }
    return out;
  });
  const note = input.note?.trim() || null;

  try {
    return await db.transaction(async (tx) => {
      const balances = await moveStock(tx, changes, { type: "ajuste", userId, note });
      const [operation] = await tx
        .insert(stockOperations)
        .values({ kind: input.kind, fromWarehouseId: from, toWarehouseId: to, note, userId })
        .returning({ id: stockOperations.id, number: stockOperations.number });
      await tx.update(stockMovements).set({ operationId: operation.id }).where(inArray(stockMovements.id, balances.map((b) => b.movementId)));
      const touchesWeb = found.some((w) => w.sellsOnline);
      const slugs = touchesWeb
        ? await tx
            .selectDistinct({ slug: products.slug })
            .from(productVariants)
            .innerJoin(products, eq(products.id, productVariants.productId))
            .where(inArray(productVariants.id, variantIds))
        : [];
      return { ok: true as const, number: operation.number, productSlugs: slugs.map((s) => s.slug) };
    });
  } catch (error) {
    if (!(error instanceof InsufficientStockError)) throw error;
    const [variant] = await db.select({ sku: productVariants.sku }).from(productVariants).where(eq(productVariants.id, error.variantId));
    const warehouse = found.find((w) => w.id === error.warehouseId);
    return { ok: false, message: `No alcanza el stock de ${variant?.sku ?? "una prenda"} en ${warehouse?.name ?? "el almacén"}.` };
  }
}

export const OPERATIONS_PAGE_SIZE = 30;
const OPERATIONS_ID = sql.raw(`"stock_operations"."id"`);
const fromWarehouse = alias(warehouses, "from_warehouse");
const toWarehouse = alias(warehouses, "to_warehouse");

export async function listOperations(db: Db, { page = 1 }: { page?: number } = {}) {
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stockOperations.id,
        number: stockOperations.number,
        kind: stockOperations.kind,
        note: stockOperations.note,
        createdAt: stockOperations.createdAt,
        fromName: fromWarehouse.name,
        toName: toWarehouse.name,
        userName: users.name,
        reason: sql<MovementType | null>`(select m.type from ${stockMovements} m where m.operation_id = ${OPERATIONS_ID} and m.quantity < 0 limit 1)`,
        // Lo que se movió: lo que entró (ingreso, traslado) o lo que salió (salida).
        units: sql<number>`(select coalesce(sum(abs(m.quantity)), 0)::int from ${stockMovements} m where m.operation_id = ${OPERATIONS_ID} and (m.quantity > 0 or ${stockOperations.kind} = 'salida'))`,
        lines: sql<number>`(select count(distinct m.variant_id)::int from ${stockMovements} m where m.operation_id = ${OPERATIONS_ID})`,
      })
      .from(stockOperations)
      .leftJoin(fromWarehouse, eq(fromWarehouse.id, stockOperations.fromWarehouseId))
      .leftJoin(toWarehouse, eq(toWarehouse.id, stockOperations.toWarehouseId))
      .leftJoin(users, eq(users.id, stockOperations.userId))
      .orderBy(desc(stockOperations.number))
      .limit(OPERATIONS_PAGE_SIZE)
      .offset((page - 1) * OPERATIONS_PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(stockOperations),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / OPERATIONS_PAGE_SIZE)) };
}

export async function getOperation(db: Db, number: number) {
  const [operation] = await db
    .select({
      id: stockOperations.id,
      number: stockOperations.number,
      kind: stockOperations.kind,
      note: stockOperations.note,
      createdAt: stockOperations.createdAt,
      fromName: fromWarehouse.name,
      toName: toWarehouse.name,
      userName: users.name,
    })
    .from(stockOperations)
    .leftJoin(fromWarehouse, eq(fromWarehouse.id, stockOperations.fromWarehouseId))
    .leftJoin(toWarehouse, eq(toWarehouse.id, stockOperations.toWarehouseId))
    .leftJoin(users, eq(users.id, stockOperations.userId))
    .where(eq(stockOperations.number, number))
    .limit(1);
  if (!operation) return null;
  const lines = await db
    .select({
      id: stockMovements.id,
      variantId: stockMovements.variantId,
      sku: productVariants.sku,
      productId: products.id,
      productName: products.name,
      colorName: colors.name,
      sizeLabel: sizes.label,
      warehouseName: warehouses.name,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      balanceAfter: stockMovements.balanceAfter,
      unitCostCents: stockMovements.unitCostCents,
    })
    .from(stockMovements)
    .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(colors, eq(colors.id, productVariants.colorId))
    .innerJoin(sizes, eq(sizes.id, productVariants.sizeId))
    .innerJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
    .where(eq(stockMovements.operationId, operation.id))
    .orderBy(asc(products.name), asc(colors.name), asc(sizes.position), asc(stockMovements.quantity));
  return { ...operation, lines };
}

// ─── Kardex ──────────────────────────────────────────────────────────────────

export const MOVEMENTS_PAGE_SIZE = 50;

export async function listMovements(db: Db, { q, warehouseId, page = 1 }: { q?: string; warehouseId?: string; page?: number } = {}) {
  const conditions: SQL[] = [];
  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    conditions.push(or(ilike(productVariants.sku, like), ilike(products.name, like))!);
  }
  if (warehouseId) conditions.push(eq(stockMovements.warehouseId, warehouseId));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stockMovements.id,
        createdAt: stockMovements.createdAt,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        balanceAfter: stockMovements.balanceAfter,
        unitCostCents: stockMovements.unitCostCents,
        note: stockMovements.note,
        sku: productVariants.sku,
        productId: products.id,
        productName: products.name,
        colorName: colors.name,
        sizeLabel: sizes.label,
        warehouseCode: warehouses.code,
        warehouseName: warehouses.name,
        userName: users.name,
        orderNumber: orders.number,
        operationNumber: stockOperations.number,
      })
      .from(stockMovements)
      .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(colors, eq(colors.id, productVariants.colorId))
      .innerJoin(sizes, eq(sizes.id, productVariants.sizeId))
      .innerJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
      .leftJoin(users, eq(users.id, stockMovements.userId))
      .leftJoin(orders, eq(orders.id, stockMovements.orderId))
      .leftJoin(stockOperations, eq(stockOperations.id, stockMovements.operationId))
      .where(where)
      .orderBy(desc(stockMovements.createdAt), asc(stockMovements.quantity))
      .limit(MOVEMENTS_PAGE_SIZE)
      .offset((page - 1) * MOVEMENTS_PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(stockMovements)
      .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / MOVEMENTS_PAGE_SIZE)) };
}
