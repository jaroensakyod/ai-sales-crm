CREATE TABLE "payment_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shop_name" text,
	"bank_name" text,
	"bank_account_no" text,
	"bank_account_name" text,
	"promptpay_id" text,
	"shipping_note" text,
	"payment_window_hours" integer DEFAULT 12 NOT NULL,
	"instruction_extra" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_settings_tenant_uq" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;