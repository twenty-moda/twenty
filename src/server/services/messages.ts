/** Mensajes del formulario de contacto y suscriptores del boletín. */
import { and, count, desc, eq, ilike, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import type { ContactInput } from "@/lib/public-forms";
import type { Db } from "../db/client";
import { contactMessages, subscribers } from "../db/schema";

export async function createContactMessage(db: Db, input: ContactInput) {
  const [row] = await db.insert(contactMessages).values(input).returning({ id: contactMessages.id, createdAt: contactMessages.createdAt });
  return row;
}

export type MessageFilter = "nuevos" | "atendidos" | "todos";

export async function listContactMessages(db: Db, { filter = "nuevos", q, page = 1, pageSize = 30 }: { filter?: MessageFilter; q?: string; page?: number; pageSize?: number }) {
  const conditions: SQL[] = [];
  if (filter === "nuevos") conditions.push(isNull(contactMessages.handledAt));
  if (filter === "atendidos") conditions.push(isNotNull(contactMessages.handledAt));
  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    conditions.push(or(ilike(contactMessages.name, like), ilike(contactMessages.email, like), ilike(contactMessages.phone, like), ilike(contactMessages.message, like))!);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(contactMessages)
      .where(where)
      .orderBy(desc(contactMessages.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(contactMessages).where(where),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function countNewMessages(db: Db): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(contactMessages).where(isNull(contactMessages.handledAt));
  return total;
}

export async function setMessageHandled(db: Db, id: string, handled: boolean, now = new Date()) {
  await db
    .update(contactMessages)
    .set({ handledAt: handled ? now : null })
    .where(eq(contactMessages.id, id));
}

/** Suscribe un email. Si ya estaba, no pasa nada (no se revela si existía). */
export async function subscribe(db: Db, email: string) {
  await db.insert(subscribers).values({ email: email.toLowerCase() }).onConflictDoNothing({ target: subscribers.email });
}

export async function listSubscribers(db: Db) {
  return db.select().from(subscribers).orderBy(desc(subscribers.createdAt));
}

export async function deleteSubscriber(db: Db, id: string) {
  await db.delete(subscribers).where(eq(subscribers.id, id));
}
