/**
 * Libro de Reclamaciones virtual. Cada hoja recibe un número correlativo, se guarda con los datos
 * del proveedor vigentes y se responde desde el admin dentro de 15 días hábiles.
 */
import { and, count, desc, eq, ilike, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { addBusinessDays, businessDaysLeft, COMPLAINT_RESPONSE_DAYS } from "@/lib/business-days";
import { formatComplaintNumber, type ComplaintInput } from "@/lib/public-forms";
import type { Db } from "../db/client";
import { complaints, users } from "../db/schema";
import { getDistrict } from "./shipping";

export type Complaint = typeof complaints.$inferSelect;

export const complaintCode = (c: Pick<Complaint, "number" | "createdAt">) =>
  formatComplaintNumber(c.number, Number(new Intl.DateTimeFormat("en", { timeZone: "America/Lima", year: "numeric" }).format(c.createdAt)));

export const complaintDeadline = (c: Pick<Complaint, "createdAt">) => addBusinessDays(c.createdAt, COMPLAINT_RESPONSE_DAYS);

/** Código, fecha límite y días hábiles que quedan (null si ya se respondió). */
function withDeadline<T extends Complaint>(c: T, now: Date) {
  const deadline = complaintDeadline(c);
  return { ...c, code: complaintCode(c), deadline, daysLeft: c.respondedAt ? null : businessDaysLeft(deadline, now) };
}

export async function createComplaint(db: Db, input: ComplaintInput): Promise<{ ok: true; complaint: Complaint } | { ok: false; field: "ubigeo"; message: string }> {
  const district = await getDistrict(db, input.ubigeo);
  if (!district) return { ok: false, field: "ubigeo", message: "Elige tu distrito de la lista" };
  const { amount, accepted: _accepted, ...rest } = input;
  const [complaint] = await db
    .insert(complaints)
    .values({
      ...rest,
      amountCents: amount,
      guardianName: input.isMinor ? input.guardianName : null,
      guardianDocument: input.isMinor ? input.guardianDocument : null,
      district: district.name,
      province: district.province,
      department: district.department,
    })
    .returning();
  return { ok: true, complaint };
}

/** Para la constancia que ve el consumidor (el id es un UUID, no se adivina). */
export async function getComplaintById(db: Db, id: string) {
  const [row] = await db.select().from(complaints).where(eq(complaints.id, id)).limit(1);
  return row ?? null;
}

export type ComplaintFilter = "pendientes" | "respondidos" | "todos";

export async function listComplaints(
  db: Db,
  { filter = "pendientes", q, page = 1, pageSize = 30 }: { filter?: ComplaintFilter; q?: string; page?: number; pageSize?: number },
  now = new Date(),
) {
  const conditions: SQL[] = [];
  if (filter === "pendientes") conditions.push(isNull(complaints.respondedAt));
  if (filter === "respondidos") conditions.push(isNotNull(complaints.respondedAt));
  const term = q?.trim();
  if (term) {
    const number = Number(term.replace(/^LR-\d{4}-/i, ""));
    const like = `%${term}%`;
    conditions.push(
      or(
        Number.isInteger(number) && number > 0 ? eq(complaints.number, number) : undefined,
        ilike(complaints.name, like),
        ilike(complaints.email, like),
        ilike(complaints.documentNumber, like),
        ilike(complaints.orderNumber, like),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(complaints)
      .where(where)
      .orderBy(desc(complaints.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(complaints).where(where),
  ]);
  return { rows: rows.map((r) => withDeadline(r, now)), total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function countPendingComplaints(db: Db): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(complaints).where(isNull(complaints.respondedAt));
  return total;
}

export async function getComplaintByNumber(db: Db, number: number, now = new Date()) {
  const [row] = await db
    .select({ complaint: complaints, respondedByName: users.name })
    .from(complaints)
    .leftJoin(users, eq(users.id, complaints.respondedBy))
    .where(eq(complaints.number, number))
    .limit(1);
  return row ? { ...withDeadline(row.complaint, now), respondedByName: row.respondedByName } : null;
}

/** Guarda la respuesta. Se puede corregir, pero la fecha de respuesta es la primera (la que cuenta para el plazo). */
export async function respondComplaint(db: Db, number: number, response: string, userId: string, now = new Date()) {
  const [current] = await db.select({ respondedAt: complaints.respondedAt }).from(complaints).where(eq(complaints.number, number)).limit(1);
  if (!current) return null;
  const [row] = await db
    .update(complaints)
    .set({ response, respondedAt: current.respondedAt ?? now, respondedBy: userId })
    .where(eq(complaints.number, number))
    .returning();
  return { complaint: row, firstResponse: !current.respondedAt };
}
