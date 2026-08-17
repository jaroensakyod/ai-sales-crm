import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDueDeliveries,
  markDeliveryRetry,
  markDeliverySent,
} from "@/db/repositories/webhooks";
import { processDueWebhooks } from "@/features/webhooks/engine";
import { computeWebhookSignature } from "@/features/webhooks/sign";

vi.mock("@/db/repositories/webhooks", () => ({
  getDueDeliveries: vi.fn(),
  markDeliverySent: vi.fn(async () => {}),
  markDeliveryRetry: vi.fn(async () => {}),
}));

const due = vi.mocked(getDueDeliveries);
const sent = vi.mocked(markDeliverySent);
const retry = vi.mocked(markDeliveryRetry);
const db = {} as never;
const now = new Date("2026-08-17T00:00:00Z");

function delivery(overrides = {}) {
  return {
    delivery: {
      id: "d1",
      event: "order.created",
      payload: { event: "order.created", data: { orderId: "o1" } },
      attempts: 0,
      ...overrides,
    },
    url: "https://shop.example.com/hook",
    secret: "whsec_abc",
    active: true,
  };
}

describe("computeWebhookSignature", () => {
  it("is sha256=<hmac of body> and verifiable by the receiver", () => {
    const body = JSON.stringify({ a: 1 });
    const sig = computeWebhookSignature("secret", body);
    const expected =
      "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
    expect(sig).toBe(expected);
  });
});

describe("processDueWebhooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs a signed body and marks SENT on 2xx", async () => {
    due.mockResolvedValue([delivery()] as never);
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200 } as Response;
    });

    const res = await processDueWebhooks(db, { now, fetchImpl: fetchImpl as never });

    expect(res.sent).toBe(1);
    expect(calls[0].url).toBe("https://shop.example.com/hook");
    const headers = calls[0].init.headers as Record<string, string>;
    const body = calls[0].init.body as string;
    expect(headers["x-webhook-signature"]).toBe(
      computeWebhookSignature("whsec_abc", body),
    );
    expect(headers["x-webhook-event"]).toBe("order.created");
    expect(sent).toHaveBeenCalledWith(db, "d1", 200, now);
  });

  it("schedules a retry on a non-2xx (still has attempts left)", async () => {
    due.mockResolvedValue([delivery({ attempts: 0 })] as never);
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }) as Response);

    const res = await processDueWebhooks(db, { now, fetchImpl: fetchImpl as never });

    expect(res.retried).toBe(1);
    expect(res.failed).toBe(0);
    const [, , attempts, opts] = retry.mock.calls[0];
    expect(attempts).toBe(0);
    expect(opts.nextAttemptAt).toBeInstanceOf(Date); // will retry
  });

  it("gives up (FAILED) after the last attempt", async () => {
    due.mockResolvedValue([delivery({ attempts: 3 })] as never);
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }) as Response);

    const res = await processDueWebhooks(db, { now, fetchImpl: fetchImpl as never });

    expect(res.failed).toBe(1);
    expect(res.retried).toBe(0);
    const [, , , opts] = retry.mock.calls[0];
    expect(opts.nextAttemptAt).toBeNull(); // no more retries → FAILED
  });
});
