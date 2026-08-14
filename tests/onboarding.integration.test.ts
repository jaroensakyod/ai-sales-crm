import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { getLatestAgreement } from "@/db/repositories/agreements";
import { getLineChannelContext } from "@/db/repositories/line";
import { deleteTenant } from "@/db/repositories/tenants";
import { salesStages, tenantAiSettings } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import {
  connectLineChannel,
  createStore,
  DPA_VERSION,
} from "@/features/onboarding/service";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("onboarding service (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(() => {
    db = createDbClient();
  });
  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("createStore provisions settings, pipeline, and logs DPA (risk #3)", async () => {
    const tenant = await createStore(db, {
      name: "New Shop",
      slug: `onb-${suffix}`,
      businessTypes: ["CATALOG"],
      ip: "1.2.3.4",
    });
    tenantId = tenant.id;
    expect(tenant.status).toBe("ACTIVE");

    const settings = await db
      .select()
      .from(tenantAiSettings)
      .where(eq(tenantAiSettings.tenantId, tenantId));
    expect(settings).toHaveLength(1);
    expect(settings[0].discountAuthority).toBe("0.00"); // risk #5 default

    const stages = await db
      .select()
      .from(salesStages)
      .where(eq(salesStages.tenantId, tenantId));
    expect(stages).toHaveLength(6);

    const dpa = await getLatestAgreement(db, tenantId, "DPA");
    expect(dpa?.version).toBe(DPA_VERSION);
    expect(dpa?.ip).toBe("1.2.3.4");
  });

  it("rejects a duplicate slug", async () => {
    await expect(
      createStore(db, { name: "Dup", slug: `onb-${suffix}` }),
    ).rejects.toThrow();
  });

  it("connectLineChannel stores an encrypted, decryptable token (risk #7)", async () => {
    const channel = await connectLineChannel(db, tenantId, {
      displayName: "My OA",
      basicId: `@onb-${suffix}`,
      channelSecret: "secret-abc",
      accessToken: "token-xyz",
    });
    const ctx = await getLineChannelContext(db, channel.id);
    expect(ctx?.connection).toBeTruthy();
    // Stored ciphertext, not plaintext.
    expect(ctx!.connection!.accessTokenEncrypted).not.toBe("token-xyz");
    expect(decryptSecret(ctx!.connection!.channelSecretEncrypted)).toBe(
      "secret-abc",
    );
    expect(decryptSecret(ctx!.connection!.accessTokenEncrypted)).toBe(
      "token-xyz",
    );
  });
});
