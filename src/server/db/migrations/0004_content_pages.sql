CREATE TYPE "public"."complaint_item_type" AS ENUM('producto', 'servicio');--> statement-breakpoint
CREATE TYPE "public"."complaint_type" AS ENUM('reclamo', 'queja');--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "complaints_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "complaint_type" NOT NULL,
	"name" text NOT NULL,
	"document_type" "document_type" NOT NULL,
	"document_number" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"address" text NOT NULL,
	"ubigeo" text,
	"district" text,
	"province" text,
	"department" text,
	"is_minor" boolean DEFAULT false NOT NULL,
	"guardian_name" text,
	"guardian_document" text,
	"item_type" "complaint_item_type" NOT NULL,
	"amount_cents" integer,
	"item_description" text NOT NULL,
	"order_number" text,
	"incident_date" text,
	"detail" text NOT NULL,
	"request" text NOT NULL,
	"response" text,
	"responded_at" timestamp with time zone,
	"responded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaints_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"message" text NOT NULL,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text DEFAULT '' NOT NULL,
	"image" text,
	"category" text,
	"author" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "complaints_created_idx" ON "complaints" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_messages_created_idx" ON "contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "posts_published_idx" ON "posts" USING btree ("is_published","published_at");--> statement-breakpoint
CREATE INDEX "rate_limit_hits_key_idx" ON "rate_limit_hits" USING btree ("key","created_at");