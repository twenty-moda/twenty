import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { inventoryLevels, productVariants, stockMovements, stockMovementType, warehouses } from "../db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

export type StockMovementType = (typeof stockMovementType.enumValues)[number];

/** No alcanza el stock (o la variante está inactiva cuando se pide `requireActive`). Deshace la transacción entera. */
export class InsufficientStockError extends Error {
  constructor(
    readonly variantId: string,
    readonly warehouseId: string,
  ) {
    super("insufficient_stock");
  }
}

export type StockChange = {
  variantId: string;
  /** Vacío = el almacén que vende en la web. */
  warehouseId?: string;
  /** Positivo = entra, negativo = sale. */
  quantity: number;
};

export type MoveContext = {
  type: StockMovementType;
  orderId?: string | null;
  userId?: string | null;
  note?: string | null;
  unitCostCents?: number | null;
  /** Solo mueve variantes activas (las ventas de la web). */
  requireActive?: boolean;
};

export type StockBalance = { variantId: string; warehouseId: string; quantity: number; movementId: string };

/** El almacén que vende en la web. Siempre hay uno: lo crea la migración 0016. */
export async function getOnlineWarehouseId(db: Conn): Promise<string> {
  const [row] = await db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.sellsOnline, true)).limit(1);
  if (!row) throw new Error("No hay un almacén que venda en la web (warehouses.sells_online)");
  return row.id;
}

/** Junta los cambios repetidos y los ordena: dos operaciones a la vez bloquean las filas en el mismo orden. */
function normalize(changes: StockChange[], online: string) {
  const byKey = new Map<string, { variantId: string; warehouseId: string; quantity: number }>();
  for (const c of changes) {
    const warehouseId = c.warehouseId ?? online;
    const key = `${c.variantId}|${warehouseId}`;
    const prev = byKey.get(key);
    if (prev) prev.quantity += c.quantity;
    else byKey.set(key, { variantId: c.variantId, warehouseId, quantity: c.quantity });
  }
  return [...byKey.values()]
    .filter((c) => c.quantity !== 0)
    .sort((a, b) => a.variantId.localeCompare(b.variantId) || a.warehouseId.localeCompare(b.warehouseId));
}

/**
 * Suma `quantity` al stock de cada variante en su almacén y anota el movimiento en el kardex con el saldo que deja.
 * Si alguno no alcanza, lanza `InsufficientStockError`.
 *
 * En el almacén de la web el saldo es `product_variants.stock`, con la misma guarda de siempre
 * (`stock + n >= 0` en un solo UPDATE): la tienda lo sigue leyendo igual y la fila de `inventory_levels` lo copia.
 * Se bloquea primero la variante y después su fila de inventario, igual que al editar desde el panel.
 */
export async function moveStock(tx: Tx, changes: StockChange[], ctx: MoveContext): Promise<StockBalance[]> {
  const online = await getOnlineWarehouseId(tx);
  const balances: StockBalance[] = [];
  for (const c of normalize(changes, online)) {
    let quantity: number;
    if (c.warehouseId === online) {
      const [row] = await tx
        .update(productVariants)
        .set({ stock: sql`${productVariants.stock} + ${c.quantity}` })
        .where(
          and(
            eq(productVariants.id, c.variantId),
            gte(productVariants.stock, -c.quantity),
            ctx.requireActive ? eq(productVariants.isActive, true) : undefined,
          ),
        )
        .returning({ stock: productVariants.stock });
      if (!row) throw new InsufficientStockError(c.variantId, c.warehouseId);
      quantity = row.stock;
      await tx
        .insert(inventoryLevels)
        .values({ variantId: c.variantId, warehouseId: c.warehouseId, quantity })
        .onConflictDoUpdate({ target: [inventoryLevels.variantId, inventoryLevels.warehouseId], set: { quantity, updatedAt: new Date() } });
    } else if (c.quantity > 0) {
      const [row] = await tx
        .insert(inventoryLevels)
        .values({ variantId: c.variantId, warehouseId: c.warehouseId, quantity: c.quantity })
        .onConflictDoUpdate({
          target: [inventoryLevels.variantId, inventoryLevels.warehouseId],
          set: { quantity: sql`"inventory_levels"."quantity" + excluded."quantity"`, updatedAt: new Date() },
        })
        .returning({ quantity: inventoryLevels.quantity });
      quantity = row.quantity;
    } else {
      const [row] = await tx
        .update(inventoryLevels)
        .set({ quantity: sql`${inventoryLevels.quantity} + ${c.quantity}`, updatedAt: new Date() })
        .where(and(eq(inventoryLevels.variantId, c.variantId), eq(inventoryLevels.warehouseId, c.warehouseId), gte(inventoryLevels.quantity, -c.quantity)))
        .returning({ quantity: inventoryLevels.quantity });
      if (!row) throw new InsufficientStockError(c.variantId, c.warehouseId);
      quantity = row.quantity;
    }
    const [movement] = await tx
      .insert(stockMovements)
      .values({
        variantId: c.variantId,
        warehouseId: c.warehouseId,
        type: ctx.type,
        quantity: c.quantity,
        balanceAfter: quantity,
        unitCostCents: ctx.unitCostCents ?? null,
        orderId: ctx.orderId ?? null,
        userId: ctx.userId ?? null,
        note: ctx.note?.trim() || null,
      })
      .returning({ id: stockMovements.id });
    balances.push({ variantId: c.variantId, warehouseId: c.warehouseId, quantity, movementId: movement.id });
  }
  return balances;
}

/**
 * Deja el stock en el valor indicado (ediciones del panel, carga por Excel, conteos) y anota la diferencia.
 * Lee el saldo actual con la fila bloqueada, así un pedido que entra a la vez no se pierde.
 */
export async function setStock(
  tx: Tx,
  targets: { variantId: string; warehouseId?: string; quantity: number }[],
  ctx: Omit<MoveContext, "type" | "requireActive" | "unitCostCents"> & { type?: "ajuste" | "conteo" | "inicial" },
): Promise<StockBalance[]> {
  if (targets.length === 0) return [];
  const online = await getOnlineWarehouseId(tx);
  const sorted = [...targets]
    .map((t) => ({ ...t, warehouseId: t.warehouseId ?? online }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId) || a.warehouseId.localeCompare(b.warehouseId));
  const changes: StockChange[] = [];
  for (const t of sorted) {
    if (t.quantity < 0) throw new InsufficientStockError(t.variantId, t.warehouseId);
    const current =
      t.warehouseId === online
        ? (await tx.select({ q: productVariants.stock }).from(productVariants).where(eq(productVariants.id, t.variantId)).for("update"))[0]?.q
        : (
            await tx
              .select({ q: inventoryLevels.quantity })
              .from(inventoryLevels)
              .where(and(eq(inventoryLevels.variantId, t.variantId), eq(inventoryLevels.warehouseId, t.warehouseId)))
              .for("update")
          )[0]?.q;
    changes.push({ variantId: t.variantId, warehouseId: t.warehouseId, quantity: t.quantity - (current ?? 0) });
  }
  return moveStock(tx, changes, { ...ctx, type: ctx.type ?? "ajuste" });
}

/**
 * Variantes sin fila en el almacén de la web (las que carga el seed directo en `product_variants`): copia su stock
 * como saldo inicial del kardex. Es lo mismo que hizo la migración 0016 con el catálogo que ya existía.
 */
export async function recordInitialStock(db: Conn) {
  const online = await getOnlineWarehouseId(db);
  await db.execute(sql`
    INSERT INTO ${stockMovements} (variant_id, warehouse_id, type, quantity, balance_after, note)
    SELECT v.id, ${online}, 'inicial', v.stock, v.stock, 'Stock inicial'
    FROM ${productVariants} v
    WHERE v.stock > 0 AND NOT EXISTS (SELECT 1 FROM ${inventoryLevels} l WHERE l.variant_id = v.id AND l.warehouse_id = ${online})
  `);
  await db.execute(sql`
    INSERT INTO ${inventoryLevels} (variant_id, warehouse_id, quantity)
    SELECT v.id, ${online}, v.stock FROM ${productVariants} v
    ON CONFLICT DO NOTHING
  `);
}

/** Stock de las variantes en cada almacén activo (las que no tienen fila cuentan 0). */
export async function getStockLevels(db: Conn, variantIds: string[]) {
  if (variantIds.length === 0) return [];
  return db
    .select({ variantId: inventoryLevels.variantId, warehouseId: inventoryLevels.warehouseId, quantity: inventoryLevels.quantity })
    .from(inventoryLevels)
    .innerJoin(warehouses, eq(warehouses.id, inventoryLevels.warehouseId))
    .where(and(inArray(inventoryLevels.variantId, variantIds), eq(warehouses.isActive, true)))
    .orderBy(asc(warehouses.position), asc(warehouses.name));
}
