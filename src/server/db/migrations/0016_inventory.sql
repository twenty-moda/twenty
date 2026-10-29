CREATE TYPE "public"."stock_movement_type" AS ENUM('inicial', 'ingreso', 'venta_web', 'anulacion_web', 'venta_tienda', 'anulacion_tienda', 'traslado_salida', 'traslado_entrada', 'ajuste', 'conteo', 'devolucion_proveedor');--> statement-breakpoint
CREATE TABLE "inventory_levels" (
	"variant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_levels_variant_id_warehouse_id_pk" PRIMARY KEY("variant_id","warehouse_id"),
	CONSTRAINT "inventory_levels_quantity_non_negative" CHECK ("inventory_levels"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"unit_cost_cents" integer,
	"order_id" uuid,
	"user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_quantity_non_zero" CHECK ("stock_movements"."quantity" <> 0)
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text,
	"sells_online" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouses_name_unique" UNIQUE("name"),
	CONSTRAINT "warehouses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_levels_warehouse_idx" ON "inventory_levels" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "stock_movements_variant_idx" ON "stock_movements" USING btree ("variant_id","warehouse_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_created_idx" ON "stock_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_order_idx" ON "stock_movements" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_sells_online_uq" ON "warehouses" USING btree ("sells_online") WHERE "warehouses"."sells_online";--> statement-breakpoint
-- La tienda de Gamarra es la que vende en la web: su stock es el que ya tiene cada variante.
INSERT INTO "warehouses" ("name", "code", "address", "sells_online") VALUES ('Tienda Gamarra', 'GAM', 'Jr. Antonio Bazo 1288, La Victoria', true) ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "inventory_levels" ("variant_id", "warehouse_id", "quantity")
  SELECT v."id", w."id", v."stock" FROM "product_variants" v CROSS JOIN "warehouses" w WHERE w."sells_online"
  ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "stock_movements" ("variant_id", "warehouse_id", "type", "quantity", "balance_after", "note")
  SELECT v."id", w."id", 'inicial', v."stock", v."stock", 'Stock al crear el inventario por almacén'
  FROM "product_variants" v CROSS JOIN "warehouses" w WHERE w."sells_online" AND v."stock" > 0;
