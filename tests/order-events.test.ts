import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTenantAiSettings } from "@/db/repositories/ai";
import { scheduleFollowup } from "@/db/repositories/followups";
import { getOrderFollowupContext } from "@/db/repositories/orders";
import {
  CART_RECOVERY_DELAY_MS,
  REVIEW_DELAY_MS,
  scheduleCartRecovery,
  scheduleReviewRequest,
} from "@/features/reminders/order-events";

vi.mock("@/db/repositories/followups", () => ({
  scheduleFollowup: vi.fn(async () => ({ id: "f1" })),
}));
vi.mock("@/db/repositories/orders", () => ({
  getOrderFollowupContext: vi.fn(),
}));
// Follow-up toggles default ON (null settings). Individual tests override.
vi.mock("@/db/repositories/ai", () => ({
  getTenantAiSettings: vi.fn(async () => null),
}));

const schedule = vi.mocked(scheduleFollowup);
const orderCtx = vi.mocked(getOrderFollowupContext);
const settings = vi.mocked(getTenantAiSettings);
const db = {} as never;

describe("scheduleCartRecovery", () => {
  beforeEach(() => schedule.mockClear());

  it("queues a CONVERSATIONAL nudge carrying the orderId", async () => {
    const now = new Date("2026-08-17T03:00:00Z");
    await scheduleCartRecovery(db, {
      tenantId: "t1",
      customerId: "c1",
      conversationId: "conv1",
      channelId: "ch1",
      orderId: "o1",
      total: 1200,
      now,
    });

    expect(schedule).toHaveBeenCalledTimes(1);
    const [, tenantId, arg] = schedule.mock.calls[0];
    expect(tenantId).toBe("t1");
    expect(arg.category).toBe("CONVERSATIONAL");
    expect(arg.reason).toBe("cart_recovery");
    expect((arg.payload as { orderId: string }).orderId).toBe("o1");
    expect(arg.scheduledAt.getTime()).toBe(now.getTime() + CART_RECOVERY_DELAY_MS);
  });

  it("does nothing when the merchant turned cart recovery off", async () => {
    settings.mockResolvedValueOnce({ followupCartRecovery: false } as never);
    await scheduleCartRecovery(db, {
      tenantId: "t1",
      customerId: "c1",
      conversationId: "conv1",
      channelId: "ch1",
      orderId: "o1",
      total: 1200,
    });
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe("scheduleReviewRequest", () => {
  beforeEach(() => {
    schedule.mockClear();
    orderCtx.mockReset();
  });

  it("schedules a review a day out when the order is reachable", async () => {
    const now = new Date("2026-08-17T03:00:00Z");
    orderCtx.mockResolvedValue({
      status: "FULFILLED",
      total: 500,
      customerId: "c1",
      conversationId: "conv1",
      channelId: "ch1",
    });

    const ok = await scheduleReviewRequest(db, {
      tenantId: "t1",
      orderId: "o1",
      now,
    });

    expect(ok).toBe(true);
    const [, , arg] = schedule.mock.calls[0];
    expect(arg.reason).toBe("review_request");
    expect(arg.category).toBe("CONVERSATIONAL");
    expect(arg.scheduledAt.getTime()).toBe(now.getTime() + REVIEW_DELAY_MS);
    // Review requests are not order-status-gated → no orderId in payload.
    expect((arg.payload as { orderId?: string }).orderId).toBeUndefined();
  });

  it("no-ops when the order has no reachable channel", async () => {
    orderCtx.mockResolvedValue(null);
    const ok = await scheduleReviewRequest(db, { tenantId: "t1", orderId: "o1" });
    expect(ok).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
  });
});
