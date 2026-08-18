ALTER TABLE "flex_cards" ALTER COLUMN "headline" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "flex_cards" ADD COLUMN "kind" text DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "flex_cards" ADD COLUMN "style" text DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE "flex_cards" ADD COLUMN "items" jsonb;