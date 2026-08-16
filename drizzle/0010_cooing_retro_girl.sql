CREATE TABLE "scheduled_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"text" text,
	"image_url" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "followup_status" DEFAULT 'SCHEDULED' NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_broadcasts" ADD CONSTRAINT "scheduled_broadcasts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_broadcasts_due_idx" ON "scheduled_broadcasts" USING btree ("status","scheduled_at");