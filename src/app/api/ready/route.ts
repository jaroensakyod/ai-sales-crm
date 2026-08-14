import { sql } from "drizzle-orm";

import { createDbClient } from "@/db/client";

// Readiness probe: verifies the DB is reachable. Use for deploy health gates.
// (Liveness stays at /api/health and never touches the DB.)
export async function GET() {
  try {
    const db = createDbClient();
    await db.execute(sql`select 1`);
    return Response.json({ status: "ready", db: "ok" });
  } catch (err) {
    return Response.json(
      { status: "degraded", db: err instanceof Error ? err.message : "error" },
      { status: 503 },
    );
  }
}
