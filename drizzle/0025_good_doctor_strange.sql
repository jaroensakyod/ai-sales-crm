ALTER TYPE "public"."auth_provider" ADD VALUE 'EMAIL';--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "password_hash" text;