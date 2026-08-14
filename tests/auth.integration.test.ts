import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import {
  createUser,
  deleteTenant,
  setUserPassword,
} from "@/db/repositories/tenants";
import { createStore } from "@/features/onboarding/service";
import { authenticate } from "@/features/auth/service";
import { hashPassword } from "@/lib/password";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("authenticate (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const slug = `auth-${suffix}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createStore(db, { name: "Auth Store", slug });
    tenantId = tenant.id;
    const user = await createUser(db, tenantId, {
      email: "staff@shop.com",
      role: "SALES",
    });
    await setUserPassword(db, tenantId, user!.id, hashPassword("hunter2"));
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("succeeds with correct credentials and returns role", async () => {
    const session = await authenticate(db, slug, "staff@shop.com", "hunter2");
    expect(session?.role).toBe("SALES");
    expect(session?.tenantSlug).toBe(slug);
  });

  it("fails on wrong password", async () => {
    expect(await authenticate(db, slug, "staff@shop.com", "nope")).toBeNull();
  });

  it("fails for a user without a password set", async () => {
    await createUser(db, tenantId, { email: "nopass@shop.com", role: "VIEWER" });
    expect(
      await authenticate(db, slug, "nopass@shop.com", "anything"),
    ).toBeNull();
  });

  it("fails for unknown tenant/user", async () => {
    expect(await authenticate(db, "no-such-shop", "x@y.com", "z")).toBeNull();
    expect(await authenticate(db, slug, "ghost@shop.com", "z")).toBeNull();
  });
});
