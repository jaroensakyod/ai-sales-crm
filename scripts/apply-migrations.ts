/**
 * Apply generated SQL migrations against the Supabase DB.
 *
 * We deliberately apply migrations with an explicit script rather than
 * `drizzle-kit push`, so schema changes (tenant isolation, pgvector, indexes)
 * are reviewable SQL and run predictably in CI/deploy.
 *
 * Usage: npm run db:migrate   (loads .env via --env-file)
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDbClient, createDbSqlClient } from "@/db/client";

async function main() {
  const db = createDbClient();
  console.log("Applying migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await createDbSqlClient().end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
