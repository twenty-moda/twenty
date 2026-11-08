CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "expenses_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"issued_on" date NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"cash_session_id" uuid,
	"payment_method" "pos_payment_method" NOT NULL,
	"category" text DEFAULT 'varios' NOT NULL,
	"description" text NOT NULL,
	"supplier_name" text,
	"supplier_document" text,
	"document_type" text DEFAULT 'ninguno' NOT NULL,
	"document_number" text,
	"amount_cents" integer NOT NULL,
	"user_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_number_unique" UNIQUE("number"),
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount_cents" > 0)
);
--> statement-breakpoint
DROP INDEX "cash_sessions_one_open_uq";--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_issued_idx" ON "expenses" USING btree ("issued_on");--> statement-breakpoint
CREATE INDEX "expenses_session_idx" ON "expenses" USING btree ("cash_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_sessions_one_open_per_user_uq" ON "cash_sessions" USING btree ("warehouse_id",coalesce("opened_by", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "cash_sessions"."closed_at" is null;