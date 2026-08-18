ALTER TABLE "tenant_ai_settings" ADD COLUMN "followup_cart_recovery" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_ai_settings" ADD COLUMN "followup_review_request" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_ai_settings" ADD COLUMN "followup_reminder" boolean DEFAULT true NOT NULL;