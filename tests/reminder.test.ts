import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTenantAiSettings } from "@/db/repositories/ai";
import { scheduleFollowup } from "@/db/repositories/followups";
import { REMINDER_LEAD_MS, scheduleReminder } from "@/features/reminders/schedule";

vi.mock("@/db/repositories/followups", () => ({
  scheduleFollowup: vi.fn(async () => "followup-id"),
}));
// Reminder toggle defaults ON (null settings). Individual tests override.
vi.mock("@/db/repositories/ai", () => ({
  getTenantAiSettings: vi.fn(async () => null),
}));

const mocked = vi.mocked(scheduleFollowup);
const settings = vi.mocked(getTenantAiSettings);
// A stand-in db — scheduleReminder never touches it directly, it hands it to
// the (mocked) repository call.
const db = {} as never;

const base = {
  tenantId: "t1",
  customerId: "c1",
  conversationId: "conv1",
  channelId: "ch1",
  text: "แจ้งเตือน",
};

describe("scheduleReminder", () => {
  beforeEach(() => mocked.mockClear());

  it("queues a TRANSACTIONAL follow-up one lead-time before the event", async () => {
    const now = new Date("2026-08-17T03:00:00Z");
    const at = new Date("2026-08-20T07:00:00Z"); // 3 days out
    const ok = await scheduleReminder(db, { ...base, at, now });

    expect(ok).toBe(true);
    expect(mocked).toHaveBeenCalledTimes(1);
    const [, tenantId, arg] = mocked.mock.calls[0];
    expect(tenantId).toBe("t1");
    expect(arg.category).toBe("TRANSACTIONAL");
    expect(arg.reason).toBe("reminder");
    expect(arg.payload).toEqual({ text: "แจ้งเตือน" });
    expect(arg.scheduledAt.getTime()).toBe(at.getTime() - REMINDER_LEAD_MS);
  });

  it("skips when the event is already within the lead window", async () => {
    const now = new Date("2026-08-17T03:00:00Z");
    const at = new Date("2026-08-17T18:00:00Z"); // later today, < 24h away
    const ok = await scheduleReminder(db, { ...base, at, now });

    expect(ok).toBe(false);
    expect(mocked).not.toHaveBeenCalled();
  });

  it("skips when the event is in the past", async () => {
    const now = new Date("2026-08-17T03:00:00Z");
    const at = new Date("2026-08-16T03:00:00Z");
    const ok = await scheduleReminder(db, { ...base, at, now });

    expect(ok).toBe(false);
    expect(mocked).not.toHaveBeenCalled();
  });

  it("skips when the merchant turned reminders off", async () => {
    settings.mockResolvedValueOnce({ followupReminder: false } as never);
    const now = new Date("2026-08-17T03:00:00Z");
    const at = new Date("2026-08-20T07:00:00Z");
    const ok = await scheduleReminder(db, { ...base, at, now });

    expect(ok).toBe(false);
    expect(mocked).not.toHaveBeenCalled();
  });
});
