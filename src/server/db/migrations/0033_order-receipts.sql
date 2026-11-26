CREATE TABLE "order_document_series" (
	"document_type" "pos_document_type" PRIMARY KEY NOT NULL,
	"series" text NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_document_series_series_unique" UNIQUE("series")
);
--> statement-breakpoint
CREATE TABLE "order_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"document_type" "pos_document_type" NOT NULL,
	"series" text NOT NULL,
	"number" integer NOT NULL,
	"customer_document_type" "document_type",
	"customer_document_number" text,
	"customer_name" text,
	"customer_address" text,
	"items" jsonb NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"sunat_status" "pos_sunat_status",
	"sunat_code" text,
	"sunat_message" text,
	"sunat_hash" text,
	"sunat_ticket_url" text,
	"sunat_pdf_url" text,
	"sunat_xml_url" text,
	"sunat_cdr_url" text,
	"sunat_sent_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_receipts_orderId_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "receipt_type" "pos_document_type";--> statement-breakpoint
ALTER TABLE "order_receipts" ADD CONSTRAINT "order_receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_receipts_series_number_uq" ON "order_receipts" USING btree ("series","number");