import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import {
  createUser,
  deleteTenant,
  listUsers,
  removeUser,
  updateUserRole,
} from "@/db/repositories/tenants";
import { createStore } from "@/features/onboarding/service";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("team management (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createStore(db, {
      name: "Team Store",
      slug: `team-${suffix}`,
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("adds, re-roles, dedupes, and removes members", async () => {
    const u = await createUser(db, tenantId, {
      email: "sales@shop.com",
      name: "เซล",
      role: "SALES",
    });
    expect(u?.role).toBe("SALES");

    // Duplicate email for the same tenant is a no-op (onConflictDoNothing).
    const dup = await createUser(db, tenantId, {
      email: "sales@shop.com",
      role: "ADMIN",
    });
    expect(dup).toBeNull();

    await updateUserRole(db, tenantId, u!.id, "ADMIN");
    let members = await listUsers(db, tenantId);
    expect(members.find((m) => m.id === u!.id)?.role).toBe("ADMIN");

    await removeUser(db, tenantId, u!.id);
    members = await listUsers(db, tenantId);
    expect(members.some((m) => m.id === u!.id)).toBe(false);
  });
});
