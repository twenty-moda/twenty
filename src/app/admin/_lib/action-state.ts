export { failure, idle, success, zodFailure, type ActionState } from "@/lib/action-state";

/** Lectura de FormData con conversiones comunes. */
export const form = {
  text: (fd: FormData, key: string) => String(fd.get(key) ?? "").trim(),
  optional: (fd: FormData, key: string) => String(fd.get(key) ?? "").trim() || null,
  bool: (fd: FormData, key: string) => fd.get(key) === "on" || fd.get(key) === "true",
  /** "70", "69.90", "S/ 70" → céntimos; vacío → null. */
  cents: (fd: FormData, key: string) => {
    const raw = String(fd.get(key) ?? "").replace(/s\/\.?/i, "").replace(/\s/g, "").replace(",", ".");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
  },
  int: (fd: FormData, key: string) => {
    const raw = String(fd.get(key) ?? "").trim();
    return raw === "" ? null : Number(raw);
  },
};
