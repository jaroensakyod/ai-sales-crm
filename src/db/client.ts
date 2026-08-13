import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseUrl } from "@/lib/env";
import * as schema from "@/db/schema";

// Runtime: Supabase TRANSACTION pooler (:6543) for serverless API routes.
// `prepare: false` is REQUIRED for the transaction pooler (no prepared statements).
// ssl 'require' = use SSL without strict CA verify (Supabase self-signed chain).
// Pattern reused from bazi-sft-dataset (see docs/01-summary.md).
const globalForDb = globalThis as unknown as {
  _pgByUrl?: Map<string, ReturnType<typeof postgres>>;
};

export function createDbSqlClient(databaseUrl = getDatabaseUrl()) {
  const clients =
    globalForDb._pgByUrl ?? new Map<string, ReturnType<typeof postgres>>();
  globalForDb._pgByUrl = clients;

  const key = `${databaseUrl}#v1`;
  const existing = clients.get(key);
  if (existing) return existing;

  const client = postgres(databaseUrl, {
    prepare: false,
    ssl: "require",
    max: 10,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });
  clients.set(key, client);
  return client;
}

export function createDbClient(databaseUrl = getDatabaseUrl()) {
  const client = createDbSqlClient(databaseUrl);
  return drizzle(client, { schema });
}

export type DbClient = ReturnType<typeof createDbClient>;
