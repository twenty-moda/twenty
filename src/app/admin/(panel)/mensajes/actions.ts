"use server";

import { refresh } from "next/cache";
import { getDb } from "@/server/db/client";
import { deleteSubscriber, setMessageHandled } from "@/server/services/messages";
import { requireAdmin } from "../../_lib/auth";

export async function setMessageHandledAction(id: string, handled: boolean) {
  await requireAdmin();
  await setMessageHandled(getDb(), id, handled);
  refresh();
}

export async function deleteSubscriberAction(id: string) {
  await requireAdmin();
  await deleteSubscriber(getDb(), id);
  refresh();
}
