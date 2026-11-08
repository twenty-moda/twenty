ALTER TYPE "public"."pos_document_type" ADD VALUE 'guia_remision';--> statement-breakpoint
CREATE TABLE "dispatch_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series" text NOT NULL,
	"number" integer NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"sale_id" uuid,
	"reason_code" text DEFAULT '01' NOT NULL,
	"transport_mode" text NOT NULL,
	"transfer_date" date NOT NULL,
	"carrier_ruc" text,
	"carrier_name" text,
	"vehicle_m_1_l" boolean DEFAULT false NOT NULL,
	"vehicle_plate" text,
	"driver_document_number" text,
	"driver_first_name" text,
	"driver_last_name" text,
	"driver_license" text,
	"recipient_document_type" "document_type" NOT NULL,
	"recipient_document_number" text NOT NULL,
	"recipient_name" text NOT NULL,
	"origin_ubigeo" text NOT NULL,
	"origin_address" text NOT NULL,
	"destination_ubigeo" text NOT NULL,
	"destination_address" text NOT NULL,
	"weight_grams" integer NOT NULL,
	"packages" integer DEFAULT 1 NOT NULL,
	"note" text,
	"items" jsonb NOT NULL,
	"sunat_status" "pos_sunat_status" DEFAULT 'pendiente' NOT NULL,
	"sunat_submitted" boolean DEFAULT false NOT NULL,
	"sunat_code" text,
	"sunat_message" text,
	"sunat_pdf_url" text,
	"sunat_xml_url" text,
	"sunat_cdr_url" text,
	"sunat_sent_at" timestamp with time zone,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispatch_guides_weight_positive" CHECK ("dispatch_guides"."weight_grams" > 0)
);
--> statement-breakpoint
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_sale_id_pos_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_guides_series_number_uq" ON "dispatch_guides" USING btree ("series","number");--> statement-breakpoint
CREATE INDEX "dispatch_guides_sale_idx" ON "dispatch_guides" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "dispatch_guides_created_idx" ON "dispatch_guides" USING btree ("created_at");