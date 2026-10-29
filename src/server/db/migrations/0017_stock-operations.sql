CREATE TYPE "public"."stock_operation_kind" AS ENUM('ingreso', 'traslado', 'salida');--> statement-breakpoint
CREATE TABLE "stock_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "stock_operations_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "stock_operation_kind" NOT NULL,
	"from_warehouse_id" uuid,
	"to_warehouse_id" uuid,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_operations_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "operation_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_operations" ADD CONSTRAINT "stock_operations_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_operations" ADD CONSTRAINT "stock_operations_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_operations" ADD CONSTRAINT "stock_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_operations_created_idx" ON "stock_operations" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_operation_id_stock_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."stock_operations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_operation_idx" ON "stock_movements" USING btree ("operation_id");