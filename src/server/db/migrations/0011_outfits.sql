CREATE TYPE "public"."product_kind" AS ENUM('single', 'outfit');--> statement-breakpoint
CREATE TABLE "outfit_pieces" (
	"outfit_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"label" text,
	CONSTRAINT "outfit_pieces_outfit_id_position_pk" PRIMARY KEY("outfit_id","position")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "outfit_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "outfit_name" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "outfit_line" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "kind" "product_kind" DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "outfit_price_cents" integer;--> statement-breakpoint
ALTER TABLE "outfit_pieces" ADD CONSTRAINT "outfit_pieces_outfit_id_products_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_pieces" ADD CONSTRAINT "outfit_pieces_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outfit_pieces_product_idx" ON "outfit_pieces" USING btree ("product_id");--> statement-breakpoint
-- Categoría para los conjuntos. En el menú de la tienda solo aparece cuando tiene alguno publicado.
INSERT INTO "categories" ("slug", "name", "position") VALUES ('conjuntos', 'Conjuntos', 10) ON CONFLICT ("slug") DO NOTHING;
