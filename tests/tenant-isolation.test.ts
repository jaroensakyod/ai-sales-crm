import { describe, expect, it } from "vitest";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";

/**
 * Structural guard for risk #8 (tenant isolation). Every table except `tenants`
 * MUST have a tenant_id column. This runs without a DB — it inspects the schema
 * definitions directly, so it fails the moment someone adds a table that forgets
 * tenant_id.
 */
describe("tenant isolation invariant", () => {
  const tables = Object.values(schema).filter((v) =>
    is(v, PgTable),
  ) as PgTable[];

  it("discovers the schema tables", () => {
    expect(tables.length).toBeGreaterThan(20);
  });

  for (const table of tables) {
    const { name, columns } = getTableConfig(table);
    const hasTenantId = columns.some((c) => c.name === "tenant_id");

    it(`${name} respects the tenant_id rule`, () => {
      if (name === "tenants") {
        expect(hasTenantId).toBe(false);
      } else {
        expect(hasTenantId).toBe(true);
      }
    });
  }
});
