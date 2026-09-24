"use server";

import { refresh, updateTag } from "next/cache";
import { ZodError } from "zod";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import { deleteSlide, getSiteSettings, saveSetting, saveSlide, slideInputSchema, type SettingKey } from "@/server/services/content";
import { InvalidImageError, saveImage } from "@/server/storage";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, success, zodFailure, type ActionState } from "../../_lib/action-state";

const lines = (value: string) =>
  value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

async function upload(fd: FormData, field: string, folder: string, name: string): Promise<string | null> {
  const file = fd.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  return saveImage(await file.arrayBuffer(), folder, `${name}-${crypto.randomUUID().slice(0, 8)}`);
}

/** Cada sección del formulario guarda una clave de `settings`. */
export async function saveSettingAction(key: SettingKey, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const db = getDb();
  let value: unknown;
  try {
    switch (key) {
      case "announcements":
        value = lines(form.text(fd, "messages"));
        break;
      case "contact":
        value = {
          whatsapp: form.text(fd, "whatsapp").replace(/[^\d+]/g, ""),
          whatsappMessage: form.text(fd, "whatsappMessage"),
          whatsappFloat: form.bool(fd, "whatsappFloat"),
          phone: form.text(fd, "phone"),
          email: form.text(fd, "email"),
          address: form.text(fd, "address"),
          openingHours: form.text(fd, "openingHours"),
        };
        break;
      case "socials":
        value = lines(form.text(fd, "socials")).map((line) => {
          const [name, url] = line.split("|").map((x) => x.trim());
          return { name, url };
        });
        break;
      case "seo":
        value = { title: form.text(fd, "title"), description: form.text(fd, "description") };
        break;
      case "productInfo":
        value = { shipping: lines(form.text(fd, "shipping")), returns: lines(form.text(fd, "returns")) };
        break;
      case "payments": {
        const current = (await getSiteSettings(db)).payments;
        const qr = await upload(fd, "qr", "pagos", "qr");
        value = {
          culqiEnabled: form.bool(fd, "culqiEnabled"),
          walletEnabled: form.bool(fd, "walletEnabled"),
          walletName: form.text(fd, "walletName"),
          walletDescription: form.text(fd, "walletDescription"),
          walletQr: qr ?? current.walletQr,
        };
        break;
      }
      case "company":
        value = {
          legalName: form.text(fd, "legalName"),
          ruc: form.text(fd, "ruc").replace(/\D/g, ""),
          address: form.text(fd, "address"),
          notificationEmail: form.text(fd, "notificationEmail").toLowerCase(),
        };
        break;
      case "about": {
        const current = (await getSiteSettings(db)).about;
        const image = await upload(fd, "image", "aboutus", "nosotros");
        const icons = new Map(current.strengths.map((s) => [s.title.toLowerCase(), s.icon]));
        value = {
          title: form.text(fd, "title") || "Nosotros",
          body: form.text(fd, "body"),
          image: image ?? current.image,
          quote: form.text(fd, "quote"),
          mission: form.text(fd, "mission"),
          vision: form.text(fd, "vision"),
          strengthsTitle: form.text(fd, "strengthsTitle"),
          strengths: lines(form.text(fd, "strengths")).map((line) => {
            const [title, ...rest] = line.split("|").map((x) => x.trim());
            return { title, description: rest.join(" | "), icon: icons.get(title.toLowerCase()) ?? null };
          }),
        };
        break;
      }
      case "faqs": {
        const questions = fd.getAll("question").map((q) => String(q).trim());
        const answers = fd.getAll("answer").map((a) => String(a).trim());
        value = questions.map((question, i) => ({ question, answer: answers[i] ?? "" })).filter((f) => f.question || f.answer);
        break;
      }
      case "legal": {
        const page = form.text(fd, "page");
        const current = (await getSiteSettings(db)).legal;
        if (!(page in current)) return failure("Página no válida.");
        value = { ...current, [page]: { body: form.text(fd, "body"), updatedAt: new Date().toISOString() } };
        break;
      }
      default:
        return failure("Sección no editable.");
    }
    await saveSetting(db, key, value);
  } catch (error) {
    if (error instanceof ZodError) {
      const first = error.issues[0];
      if (key === "socials") return failure("Cada red va en una línea: Nombre | https://…");
      if (key === "faqs") return failure("Cada pregunta necesita su respuesta (y al revés).");
      return failure(first.message);
    }
    if (error instanceof InvalidImageError) return failure(error.message);
    throw error;
  }
  updateTag(cacheTags.content);
  refresh();
  return success("Guardado. La tienda ya lo muestra.");
}

export async function saveSlideAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  let image: string | null;
  let imageMobile: string | null;
  try {
    image = await upload(fd, "image", "slider", "banner");
    imageMobile = await upload(fd, "imageMobile", "slider", "banner-movil");
  } catch (error) {
    if (error instanceof InvalidImageError) return failure(error.message);
    throw error;
  }
  const parsed = slideInputSchema.safeParse({
    title: form.text(fd, "title"),
    description: form.optional(fd, "description"),
    href: form.optional(fd, "href"),
    ctaLabel: form.optional(fd, "ctaLabel"),
    seoHeading: form.optional(fd, "seoHeading"),
    isVisible: form.bool(fd, "isVisible"),
    position: form.int(fd, "position") ?? 0,
    image,
    imageMobile,
  });
  if (!parsed.success) return zodFailure(parsed.error);
  const result = await saveSlide(getDb(), id, parsed.data);
  if (!result.ok) return failure(result.message);
  updateTag(cacheTags.content);
  refresh();
  return success(id ? "Banner guardado." : "Banner creado.");
}

export async function deleteSlideAction(id: string) {
  await requireAdmin();
  await deleteSlide(getDb(), id);
  updateTag(cacheTags.content);
  refresh();
}
