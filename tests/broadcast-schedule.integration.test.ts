import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import {
  createScheduledBroadcast,
  listScheduledBroadcasts,
} from "@/db/repositories/broadcasts";
import { upsertLineConnection } from "@/db/repositories/line";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { channels, scheduledBroadcasts } from "@/db/schema";
import { processDueBroadcasts } from "@/features/broadcast/engine";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("scheduled broadcasts (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Bcast Store",
      slug: `bcast-${suffix}`,
    });
    tenantId = tenant.id;
    const [channel] = await db
      .insert(channels)
      .values({
        tenantId,
        type: "LINE",
        displayName: "OA",
        externalId: `@bc-${suffix}`,
      })
      .returning();
    await upsertLineConnection(db, tenantId, channel.id, {
      channelSecret: "sec",
      accessToken: "line-token",
      basicId: `@bc-${suffix}`,
    });
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("fires a due broadcast and marks it SENT (once)", async () => {
    const past = new Date(Date.now() - 60_000);
    const b = await createScheduledBroadcast(db, tenantId, {
      text: "โปรลด 20%",
      imageUrl: "https://x/y.png",
      scheduledAt: past,
    });

    const sent: { token: string; text?: string | null; imageUrl?: string | null }[] = [];
    const res = await processDueBroadcasts(db, {
      now: new Date(),
      send: async ({ accessToken, text, imageUrl }) => {
        sent.push({ token: accessToken, text, imageUrl });
      },
    });
    expect(res.sent).toBe(1);
    expect(sent[0].token).toBe("line-token"); // decrypted per-tenant token
    expect(sent[0].text).toBe("โปรลด 20%");
    expect(sent[0].imageUrl).toBe("https://x/y.png");

    const [row] = await db
      .select()
      .from(scheduledBroadcasts)
      .where(eq(scheduledBroadcasts.id, b.id));
    expect(row.status).toBe("SENT");

    // Second run does not re-send (only SCHEDULED rows are due).
    const again = await processDueBroadcasts(db, { now: new Date(), send: async () => {} });
    expect(again.sent).toBe(0);
  });

  it("does not fire a future broadcast", async () => {
    const future = new Date(Date.now() + 60 * 60_000);
    await createScheduledBroadcast(db, tenantId, {
      text: "พรุ่งนี้",
      scheduledAt: future,
    });
    const res = await processDueBroadcasts(db, {
      now: new Date(),
      send: async () => {},
    });
    expect(res.sent).toBe(0);
    const rows = await listScheduledBroadcasts(db, tenantId);
    expect(rows.some((r) => r.text === "พรุ่งนี้" && r.status === "SCHEDULED")).toBe(true);
  });
});
