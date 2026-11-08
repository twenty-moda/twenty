CREATE TYPE "public"."pos_sale_channel" AS ENUM('tienda', 'virtual');--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "channel" "pos_sale_channel" DEFAULT 'tienda' NOT NULL;