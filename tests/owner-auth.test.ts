import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { listOwnerTenants, upsertOwner } from "@/db/repositories/owners";
import { deleteTenant } from "@/db/repositories/tenants";
import { owners } from "@/db/schema";
import { createStore } from "@/features/onboarding/service";
import { signOwnerSession, verifyOwnerSession } from "@/lib/session";

describe("owner session token", () => {
  it("round-trips and rejects tampering / expiry", () => {
    const token = signOwnerSession({ ownerId: "o1", name: "ร้านเอ", provider: "LINE" });
    const s = verifyOwnerSession(token);
    expect(s?.ownerId).toBe("o1");
    expect(s?.provider).toBe("LINE");
    expect(verifyOwnerSession(token + "x")).toBeNull(); // tampered mac
    expect(verifyOwnerSession(token, Date.now() + 8 * 24 * 3600_000)).toBeNull(); // expired
  });
});

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("owner accounts (integration)", () => {
  const db: DbClient = createDbClient();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const providerId = `U-${suffix}`;
  const madeTenants: string[] = [];

  afterAll(async () => {
    for (const id of madeTenants) await deleteTenant(db, id);
    await db.delete(owners).where(eq(owners.providerId, providerId));
    await createDbSqlClient().end();
  });

  it("upsert is idempotent per (provider, providerId) and refreshes name", async () => {
    const a = await upsertOwner(db, { provider: "LINE", providerId, displayName: "เอ" });
    const b = await upsertOwner(db, { provider: "LINE", providerId, displayName: "เอ (ใหม่)" });
    expect(b.id).toBe(a.id); // same owner
    const [row] = await db.select().from(owners).where(eq(owners.id, a.id));
    expect(row.displayName).toBe("เอ (ใหม่)");
  });

  it("a store created by an owner shows up in their store list", async () => {
    const owner = await upsertOwner(db, { provider: "LINE", providerId });
    const store = await createStore(db, {
      name: "ร้านของเอ",
      slug: `owner-store-${suffix}`,
      ownerId: owner.id,
    });
    madeTenants.push(store.id);

    const mine = await listOwnerTenants(db, owner.id);
    expect(mine.map((t) => t.id)).toContain(store.id);
    expect(mine.every((t) => t.ownerId === owner.id)).toBe(true);
  });
});
