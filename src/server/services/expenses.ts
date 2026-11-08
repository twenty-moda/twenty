/**
 * Gastos de la tienda (pedido de TWENTY, 08/11/2026: el «Listado de gastos» de Insaga y los gastos en el reporte de
 * caja). Un gasto pagado en efectivo de una caja sale de su arqueo; los demás (Yape, transferencia, efectivo que no
 * estaba en caja) solo quedan en el listado. No se borran: se anulan, y el de una caja solo mientras siga abierta.
 */
import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { EXPENSE_CATEGORY_KEYS, EXPENSE_DOCUMENT_KEYS } from "@/lib/expenses";
import { PAYMENT_METHODS } from "@/lib/pos";
import { todayInLima } from "@/lib/reports";
import type { Db } from "../db/client";
import { cashSessions, expenses, users, warehouses } from "../db/schema";

type Fail = { ok: false; message: string; field?: string };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const expenseInputSchema = z.object({
  warehouseId: z.uuid("Elige la tienda"),
  /** Caja de la que sale el efectivo (la del formulario de la caja); sin ella y con `fromCash`, la caja de quien registra. */
  cashSessionId: z.uuid().nullish(),
  fromCash: z.boolean(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  /** Día del gasto; vacío = hoy. Uno de una caja siempre es de hoy. */
  issuedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Revisa la fecha")
    .nullish(),
  category: z.enum(EXPENSE_CATEGORY_KEYS, "Elige el motivo"),
  description: z.string().trim().min(2, "Escribe qué se pagó").max(120),
  supplierName: optionalText(120),
  supplierDocument: optionalText(20),
  documentType: z.enum(EXPENSE_DOCUMENT_KEYS).default("ninguno"),
  documentNumber: optionalText(40),
  amountCents: z.number("Escribe el monto").int().positive("El monto debe ser mayor que S/ 0").max(10_000_000, "Revisa el monto"),
});
export type ExpenseInput = z.input<typeof expenseInputSchema>;

type Actor = { id: string; role: string };

export async function registerExpense(db: Db, raw: ExpenseInput | Record<string, unknown>, actor: Actor): Promise<{ ok: true; number: number; cashSessionNumber: number | null } | Fail> {
  const parsed = expenseInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message, field: String(parsed.error.issues[0].path[0] ?? "") };
  const input = parsed.data;
  const today = todayInLima();
  if (input.issuedOn && input.issuedOn > today) return { ok: false, message: "La fecha no puede ser de un día que no llega.", field: "issuedOn" };
  if (input.fromCash && input.paymentMethod !== "efectivo") return { ok: false, message: "Lo que sale de la caja es en efectivo." };

  return db.transaction(async (tx) => {
    let session: { id: string; number: number } | null = null;
    if (input.fromCash) {
      // FOR SHARE: la caja no se cierra mientras se anota el gasto (el cierre la toma con FOR UPDATE).
      const [found] = await tx
        .select({ id: cashSessions.id, number: cashSessions.number, warehouseId: cashSessions.warehouseId, openedBy: cashSessions.openedBy, closedAt: cashSessions.closedAt })
        .from(cashSessions)
        .where(
          input.cashSessionId
            ? eq(cashSessions.id, input.cashSessionId)
            : and(eq(cashSessions.warehouseId, input.warehouseId), eq(cashSessions.openedBy, actor.id), isNull(cashSessions.closedAt)),
        )
        .for("share");
      if (!found || found.closedAt) return { ok: false as const, message: input.cashSessionId ? "Esa caja ya está cerrada." : "No tienes una caja abierta en esta tienda: ábrela o anota el gasto sin caja." };
      if (found.warehouseId !== input.warehouseId) return { ok: false as const, message: "Esa caja es de otra tienda." };
      if (found.openedBy !== actor.id && actor.role !== "admin") return { ok: false as const, message: "Solo puedes anotar gastos en tu caja." };
      session = found;
    }
    const [created] = await tx
      .insert(expenses)
      .values({
        issuedOn: session ? today : (input.issuedOn ?? today),
        warehouseId: input.warehouseId,
        cashSessionId: session?.id ?? null,
        paymentMethod: input.paymentMethod,
        category: input.category,
        description: input.description,
        supplierName: input.supplierName,
        supplierDocument: input.supplierDocument,
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        amountCents: input.amountCents,
        userId: actor.id,
      })
      .returning({ number: expenses.number });
    return { ok: true as const, number: created.number, cashSessionNumber: session?.number ?? null };
  });
}

/**
 * Anula un gasto (no se borra). El de una caja solo mientras siga abierta: cerrada, su arqueo ya quedó. Quien lo
 * anotó puede anularlo; el admin, cualquiera.
 */
export async function voidExpense(db: Db, input: { expenseId: string; reason: string }, actor: Actor): Promise<{ ok: true } | Fail> {
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, message: "Escribe por qué se anula." };
  return db.transaction(async (tx) => {
    const [expense] = await tx.select().from(expenses).where(eq(expenses.id, input.expenseId)).for("update");
    if (!expense) return { ok: false as const, message: "Ese gasto no existe." };
    if (expense.voidedAt) return { ok: false as const, message: "Ese gasto ya está anulado." };
    if (expense.userId !== actor.id && actor.role !== "admin") return { ok: false as const, message: "Solo el admin anula gastos de otra persona." };
    if (expense.cashSessionId) {
      const [session] = await tx.select({ closedAt: cashSessions.closedAt }).from(cashSessions).where(eq(cashSessions.id, expense.cashSessionId)).for("share");
      if (session?.closedAt) return { ok: false as const, message: "La caja de ese gasto ya se cerró: su arqueo no cambia." };
    }
    await tx.update(expenses).set({ voidedAt: new Date(), voidedBy: actor.id, voidReason: reason.slice(0, 200) }).where(eq(expenses.id, expense.id));
    return { ok: true as const };
  });
}

// ─── Listado ─────────────────────────────────────────────────────────────────

const registeredBy = alias(users, "registered_by");

export type ExpenseFilter = { from: string; to: string; q?: string; userId?: string; category?: string };

function expenseWhere({ from, to, q, userId, category }: ExpenseFilter): SQL {
  const conditions: SQL[] = [gte(expenses.issuedOn, from), lte(expenses.issuedOn, to)];
  if (userId) conditions.push(eq(expenses.userId, userId));
  if (category) conditions.push(eq(expenses.category, category));
  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    conditions.push(or(ilike(expenses.description, like), ilike(expenses.supplierName, like), ilike(expenses.supplierDocument, like), ilike(expenses.documentNumber, like))!);
  }
  return and(...conditions)!;
}

/** Gastos de las fechas (del más nuevo al más viejo), con el total y lo gastado por motivo (sin los anulados). */
export async function listExpenses(db: Db, filter: ExpenseFilter) {
  const where = expenseWhere(filter);
  const [rows, byCategory] = await Promise.all([
    db
      .select({
        id: expenses.id,
        number: expenses.number,
        issuedOn: expenses.issuedOn,
        category: expenses.category,
        description: expenses.description,
        supplierName: expenses.supplierName,
        supplierDocument: expenses.supplierDocument,
        documentType: expenses.documentType,
        documentNumber: expenses.documentNumber,
        paymentMethod: expenses.paymentMethod,
        amountCents: expenses.amountCents,
        createdAt: expenses.createdAt,
        voidedAt: expenses.voidedAt,
        voidReason: expenses.voidReason,
        userId: expenses.userId,
        userName: registeredBy.name,
        warehouseCode: warehouses.code,
        cashSessionNumber: cashSessions.number,
        cashSessionClosedAt: cashSessions.closedAt,
      })
      .from(expenses)
      .innerJoin(warehouses, eq(warehouses.id, expenses.warehouseId))
      .leftJoin(cashSessions, eq(cashSessions.id, expenses.cashSessionId))
      .leftJoin(registeredBy, eq(registeredBy.id, expenses.userId))
      .where(where)
      .orderBy(desc(expenses.issuedOn), desc(expenses.createdAt))
      .limit(1000),
    db
      .select({ category: expenses.category, count: sql<number>`count(*)::int`, cents: sql<number>`coalesce(sum(${expenses.amountCents}), 0)::int` })
      .from(expenses)
      .where(and(where, isNull(expenses.voidedAt)))
      .groupBy(expenses.category)
      .orderBy(desc(sql`sum(${expenses.amountCents})`), asc(expenses.category)),
  ]);
  return {
    rows,
    byCategory,
    totalCents: byCategory.reduce((s, c) => s + c.cents, 0),
    count: byCategory.reduce((s, c) => s + c.count, 0),
  };
}
export type ExpenseRow = Awaited<ReturnType<typeof listExpenses>>["rows"][number];
