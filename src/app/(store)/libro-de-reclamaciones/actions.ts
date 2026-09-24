"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { failure, formValues, type ActionState } from "@/lib/action-state";
import { complaintSchema, formErrors } from "@/lib/public-forms";
import { getDb } from "@/server/db/client";
import { createComplaint } from "@/server/services/complaints";
import { getSiteSettings } from "@/server/services/content";
import { sendComplaintEmails } from "@/server/services/notifications";
import { absoluteUrl, allowRequest } from "../_lib/request";

export async function submitComplaintAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  if (values.website) return failure("No se pudo registrar. Inténtalo de nuevo.", undefined, values);
  const parsed = complaintSchema.safeParse({ ...values, isMinor: values.isMinor === "on", accepted: values.accepted === "on" });
  if (!parsed.success) return failure("Revisa los campos marcados en rojo.", formErrors(parsed.error), values);
  if (!(await allowRequest("complaint"))) {
    return failure("Registraste varias hojas seguidas. Inténtalo en una hora o escríbenos por WhatsApp.", undefined, values);
  }

  const db = getDb();
  const result = await createComplaint(db, parsed.data);
  if (!result.ok) return failure("Revisa los campos marcados en rojo.", { [result.field]: result.message }, values);

  const { complaint } = result;
  // La constancia se envía al correo del consumidor (lo exige la norma) y se avisa al equipo.
  after(async () => {
    try {
      await sendComplaintEmails(complaint, await getSiteSettings(db), {
        constancia: absoluteUrl(`/libro-de-reclamaciones/constancia/${complaint.id}`),
        admin: absoluteUrl(`/admin/reclamos/${complaint.number}`),
      });
    } catch (error) {
      console.error("[reclamos] No se pudo enviar la constancia por email", error instanceof Error ? error.message : error);
    }
  });
  redirect(`/libro-de-reclamaciones/constancia/${complaint.id}`);
}
