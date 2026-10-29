CREATE TYPE "public"."pos_sunat_status" AS ENUM('pendiente', 'aceptado', 'rechazado');--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "customer_address" text;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "sunat_status" "pos_sunat_status";--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "sunat_code" text;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "sunat_message" text;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "sunat_hash" text;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "sunat_ticket_url" text;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "sunat_pdf_url" text;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "sunat_xml_url" text;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "sunat_cdr_url" text;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "sunat_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "sunat_void_status" text;