ALTER TABLE "payments" ADD COLUMN "verified_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verify_status" text DEFAULT 'UNVERIFIED';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "slip_data" jsonb;