ALTER TABLE "quick_replies" ADD COLUMN "keywords" text;--> statement-breakpoint
ALTER TABLE "quick_replies" ADD COLUMN "match_type" text DEFAULT 'exact' NOT NULL;