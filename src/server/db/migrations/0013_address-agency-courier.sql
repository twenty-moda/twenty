ALTER TABLE "addresses" ADD COLUMN "agency_courier" text;--> statement-breakpoint
-- Hasta hoy solo Shalom tenía lista de agencias: las guardadas con id son de Shalom.
UPDATE "addresses" SET "agency_courier" = 'shalom' WHERE "agency_id" IS NOT NULL;
