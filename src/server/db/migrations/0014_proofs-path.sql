-- Las capturas pasan de la BD al bucket con el nombre comprobantes/<id>.webp (ya copiadas antes de esta migración).
ALTER TABLE "payment_proofs" ADD COLUMN "path" text;--> statement-breakpoint
UPDATE "payment_proofs" SET "path" = 'comprobantes/' || "id" || '.webp';--> statement-breakpoint
ALTER TABLE "payment_proofs" ALTER COLUMN "path" SET NOT NULL;
