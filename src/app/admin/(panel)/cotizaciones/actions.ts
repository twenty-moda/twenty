"use server";

import { refresh } from "next/cache";
import { getDb } from "@/server/db/client";
import { saveQuote, voidQuote } from "@/server/services/quotes";
import { requireStaff } from "../../_lib/auth";
import { failure, success, type ActionState } from "../../_lib/action-state";

export async function saveQuoteAction(input: unknown, quoteId?: string): Promise<{ ok: true; number: number } | { ok: false; message: string }> {
  const user = await requireStaff();
  const result = await saveQuote(getDb(), input as Parameters<typeof saveQuote>[1], user.id, quoteId);
  if (result.ok) refresh();
  return result;
}

export async function voidQuoteAction(quoteId: string): Promise<ActionState> {
  await requireStaff();
  const result = await voidQuote(getDb(), quoteId);
  if (!result.ok) return failure(result.message);
  refresh();
  return success("Cotización anulada.");
}
