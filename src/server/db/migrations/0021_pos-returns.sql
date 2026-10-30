ALTER TYPE "public"."pos_document_type" ADD VALUE 'nota_credito_boleta';--> statement-breakpoint
ALTER TYPE "public"."pos_document_type" ADD VALUE 'nota_credito_factura';--> statement-breakpoint
ALTER TYPE "public"."stock_movement_type" ADD VALUE 'devolucion_cliente';--> statement-breakpoint
CREATE TABLE "pos_return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"sale_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	CONSTRAINT "pos_return_items_quantity_positive" CHECK ("pos_return_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "pos_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "pos_returns_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sale_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"user_id" uuid,
	"reason_code" text NOT NULL,
	"reason" text NOT NULL,
	"refund_method" "pos_payment_method" NOT NULL,
	"refund_cents" integer NOT NULL,
	"credit_note_series" text,
	"credit_note_number" integer,
	"sunat_status" "pos_sunat_status",
	"sunat_code" text,
	"sunat_message" text,
	"sunat_hash" text,
	"sunat_ticket_url" text,
	"sunat_pdf_url" text,
	"sunat_xml_url" text,
	"sunat_cdr_url" text,
	"sunat_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_returns_number_unique" UNIQUE("number"),
	CONSTRAINT "pos_returns_refund_non_negative" CHECK ("pos_returns"."refund_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pos_return_items" ADD CONSTRAINT "pos_return_items_return_id_pos_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."pos_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_return_items" ADD CONSTRAINT "pos_return_items_sale_item_id_pos_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."pos_sale_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_returns" ADD CONSTRAINT "pos_returns_sale_id_pos_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_returns" ADD CONSTRAINT "pos_returns_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_returns" ADD CONSTRAINT "pos_returns_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_returns" ADD CONSTRAINT "pos_returns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pos_return_items_return_idx" ON "pos_return_items" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "pos_return_items_sale_item_idx" ON "pos_return_items" USING btree ("sale_item_id");--> statement-breakpoint
CREATE INDEX "pos_returns_sale_idx" ON "pos_returns" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "pos_returns_session_idx" ON "pos_returns" USING btree ("cash_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_returns_credit_note_uq" ON "pos_returns" USING btree ("credit_note_series","credit_note_number");