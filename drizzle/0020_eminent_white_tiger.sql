CREATE TABLE "flex_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"headline" text NOT NULL,
	"body" text,
	"price_label" text,
	"image_url" text,
	"button_label" text,
	"button_kind" text DEFAULT 'message' NOT NULL,
	"button_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flex_cards" ADD CONSTRAINT "flex_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flex_cards_tenant_idx" ON "flex_cards" USING btree ("tenant_id");