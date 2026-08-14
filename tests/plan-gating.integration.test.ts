import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { getSubscription, setPlan } from "@/db/repositories/subscriptions";
import { deleteTenant } from "@/db/repositories/tenants";
import { getEntitlements } from "@/features/billing/entitlements";
import {
  connectLineChannel,
  createStore,
} from "@/features/onboarding/service";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("plan gating (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createStore(db, {
      name: "Plan Store",
      slug: `plan-${suffix}`,
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("createStore starts on FREE", async () => {
    const sub = await getSubscription(db, tenantId);
    expect(sub?.plan).toBe("FREE");
    const ent = await getEntitlements(db, tenantId);
    expect(ent.maxChannels).toBe(1);
  });

  it("FREE allows one channel but blocks the second", async () => {
    await connectLineChannel(db, tenantId, {
      displayName: "OA 1",
      basicId: `@plan1-${suffix}`,
      channelSecret: "s1",
      accessToken: "t1",
    });
    await expect(
      connectLineChannel(db, tenantId, {
        displayName: "OA 2",
        basicId: `@plan2-${suffix}`,
        channelSecret: "s2",
        accessToken: "t2",
      }),
    ).rejects.toThrow(/plan_limit_channels/);
  });

  it("upgrading to PRO unlocks more channels", async () => {
    await setPlan(db, tenantId, "PRO");
    const ent = await getEntitlements(db, tenantId);
    expect(ent.maxChannels).toBeGreaterThan(1);
    expect(ent.followupAutomation).toBe(true);

    const channel = await connectLineChannel(db, tenantId, {
      displayName: "OA 2",
      basicId: `@plan2-${suffix}`,
      channelSecret: "s2",
      accessToken: "t2",
    });
    expect(channel.id).toBeTruthy();
  });
});
