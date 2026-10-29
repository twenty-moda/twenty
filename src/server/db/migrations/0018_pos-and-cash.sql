CREATE TYPE "public"."cash_movement_type" AS ENUM('ingreso', 'egreso');--> statement-breakpoint
CREATE TYPE "public"."pos_document_type" AS ENUM('nota_venta', 'boleta', 'factura');--> statement-breakpoint
CREATE TYPE "public"."pos_payment_method" AS ENUM('efectivo', 'yape', 'plin', 'tarjeta', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."pos_sale_status" AS ENUM('pagada', 'anulada');--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"type" "cash_movement_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_amount_positive" CHECK ("cash_movements"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "cash_sessions_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"warehouse_id" uuid NOT NULL,
	"opening_cents" integer NOT NULL,
	"opened_by" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_cash_cents" integer,
	"counted_cash_cents" integer,
	"closing_note" text,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	CONSTRAINT "cash_sessions_number_unique" UNIQUE("number"),
	CONSTRAINT "cash_sessions_opening_non_negative" CHECK ("cash_sessions"."opening_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "document_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"document_type" "pos_document_type" NOT NULL,
	"series" text NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_series_series_unique" UNIQUE("series")
);
--> statement-breakpoint
CREATE TABLE "pos_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"method" "pos_payment_method" NOT NULL,
	"amount_cents" integer NOT NULL,
	"received_cents" integer,
	"reference" text,
	CONSTRAINT "pos_payments_amount_positive" CHECK ("pos_payments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "pos_sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" uuid,
	"product_id" uuid,
	"sku" text NOT NULL,
	"product_name" text NOT NULL,
	"color_name" text NOT NULL,
	"size_label" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"promotion_name" text,
	CONSTRAINT "pos_sale_items_quantity_positive" CHECK ("pos_sale_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "pos_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" "pos_document_type" NOT NULL,
	"series" text NOT NULL,
	"number" integer NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"seller_id" uuid,
	"customer_document_type" "document_type",
	"customer_document_number" text,
	"customer_name" text,
	"subtotal_cents" integer NOT NULL,
	"promo_discount_cents" integer DEFAULT 0 NOT NULL,
	"manual_discount_cents" integer DEFAULT 0 NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"change_cents" integer DEFAULT 0 NOT NULL,
	"status" "pos_sale_status" DEFAULT 'pagada' NOT NULL,
	"note" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_sales_total_non_negative" CHECK ("pos_sales"."total_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "pos_sale_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_sale_id_pos_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_sale_id_pos_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_movements_session_idx" ON "cash_movements" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_sessions_one_open_uq" ON "cash_sessions" USING btree ("warehouse_id") WHERE "cash_sessions"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "cash_sessions_opened_idx" ON "cash_sessions" USING btree ("opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_series_warehouse_type_uq" ON "document_series" USING btree ("warehouse_id","document_type");--> statement-breakpoint
CREATE INDEX "pos_payments_sale_idx" ON "pos_payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "pos_sale_items_sale_idx" ON "pos_sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "pos_sale_items_variant_idx" ON "pos_sale_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_sales_series_number_uq" ON "pos_sales" USING btree ("series","number");--> statement-breakpoint
CREATE INDEX "pos_sales_session_idx" ON "pos_sales" USING btree ("cash_session_id");--> statement-breakpoint
CREATE INDEX "pos_sales_created_idx" ON "pos_sales" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_pos_sale_id_pos_sales_id_fk" FOREIGN KEY ("pos_sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE set null ON UPDATE no action;