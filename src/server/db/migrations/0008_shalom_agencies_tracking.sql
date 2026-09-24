ALTER TABLE "addresses" ADD COLUMN "agency_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "agency_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_code" text;