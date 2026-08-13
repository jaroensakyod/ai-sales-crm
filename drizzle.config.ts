import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // We apply migrations via scripts/apply-migrations.ts (not drizzle push)
  // so tenant-isolation and pgvector setup stay explicit and reviewable.
  strict: true,
  verbose: true,
});
