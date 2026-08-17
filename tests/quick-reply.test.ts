import { afterEach, describe, expect, it, vi } from "vitest";

import { sendFacebookText } from "@/features/facebook/client";
import { replyText } from "@/features/line/client";

const QR = [{ label: "คุยกับแอดมิน", text: "คุยกับแอดมิน" }];

type LineReq = { replyToken: string; messages: Record<string, unknown>[] };

describe("LINE replyText quick replies", () => {
  it("attaches quickReply items when provided", async () => {
    const calls: LineReq[] = [];
    const client = { replyMessage: async (req: LineReq) => void calls.push(req) };
    await replyText(client as never, "tok", "สวัสดีค่ะ", QR);
    const msg = calls[0].messages[0] as {
      type: string;
      quickReply: { items: unknown[] };
    };
    expect(msg.type).toBe("text");
    expect(msg.quickReply.items[0]).toEqual({
      type: "action",
      action: { type: "message", label: "คุยกับแอดมิน", text: "คุยกับแอดมิน" },
    });
  });

  it("omits quickReply when none given", async () => {
    const calls: LineReq[] = [];
    const client = { replyMessage: async (req: LineReq) => void calls.push(req) };
    await replyText(client as never, "tok", "สวัสดีค่ะ");
    expect(calls[0].messages[0].quickReply).toBeUndefined();
  });
});

describe("Facebook sendFacebookText quick replies", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends quick_replies of content_type text", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      bodies.push(init.body);
      return { ok: true, text: async () => "" };
    });
    await sendFacebookText("token", "PSID", "hi", QR);
    const body = JSON.parse(bodies[0]) as {
      message: { quick_replies: unknown[] };
    };
    expect(body.message.quick_replies[0]).toEqual({
      content_type: "text",
      title: "คุยกับแอดมิน",
      payload: "คุยกับแอดมิน",
    });
  });
});
