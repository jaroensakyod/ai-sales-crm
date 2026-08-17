import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getConversationSendContext,
  recordOutboundMessage,
} from "@/db/repositories/conversations";
import { getFacebookChannelContext } from "@/db/repositories/facebook";
import { getLineChannelContext } from "@/db/repositories/line";
import { sendFacebookText } from "@/features/facebook/client";
import { pushText } from "@/features/line/client";
import { sendManualReply } from "@/features/messaging/manual-reply";

vi.mock("@/db/repositories/conversations", () => ({
  getConversationSendContext: vi.fn(),
  recordOutboundMessage: vi.fn(async () => ({})),
}));
vi.mock("@/db/repositories/line", () => ({
  getLineChannelContext: vi.fn(async () => ({
    connection: { accessTokenEncrypted: "enc" },
  })),
}));
vi.mock("@/db/repositories/facebook", () => ({
  getFacebookChannelContext: vi.fn(async () => ({
    connection: { accessTokenEncrypted: "enc" },
  })),
}));
vi.mock("@/features/line/client", () => ({
  createLineClient: vi.fn(() => ({})),
  pushText: vi.fn(async () => {}),
}));
vi.mock("@/features/facebook/client", () => ({
  sendFacebookText: vi.fn(async () => {}),
}));
vi.mock("@/lib/crypto", () => ({ decryptSecret: vi.fn(() => "token") }));

const sendCtx = vi.mocked(getConversationSendContext);
const record = vi.mocked(recordOutboundMessage);
const linePush = vi.mocked(pushText);
const fbSend = vi.mocked(sendFacebookText);
const db = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getLineChannelContext).mockResolvedValue({
    connection: { accessTokenEncrypted: "enc" },
  } as never);
  vi.mocked(getFacebookChannelContext).mockResolvedValue({
    connection: { accessTokenEncrypted: "enc" },
  } as never);
});

describe("sendManualReply", () => {
  it("rejects empty text without sending", async () => {
    const r = await sendManualReply(db, "t1", "c1", "   ");
    expect(r).toEqual({ ok: false, reason: "empty" });
    expect(linePush).not.toHaveBeenCalled();
    expect(fbSend).not.toHaveBeenCalled();
  });

  it("fails when the customer can't be reached on the channel", async () => {
    sendCtx.mockResolvedValue(null);
    const r = await sendManualReply(db, "t1", "c1", "สวัสดีค่ะ");
    expect(r).toEqual({ ok: false, reason: "no_recipient" });
  });

  it("sends via LINE push and records the outbound", async () => {
    sendCtx.mockResolvedValue({
      channelId: "ch1",
      channelType: "LINE",
      externalId: "U123",
    });
    const r = await sendManualReply(db, "t1", "c1", "รับทราบค่ะ");
    expect(r).toEqual({ ok: true });
    expect(linePush).toHaveBeenCalledWith(expect.anything(), "U123", "รับทราบค่ะ");
    expect(fbSend).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("sends via Messenger for MESSENGER channels", async () => {
    sendCtx.mockResolvedValue({
      channelId: "ch2",
      channelType: "MESSENGER",
      externalId: "PSID9",
    });
    const r = await sendManualReply(db, "t1", "c1", "hello");
    expect(r).toEqual({ ok: true });
    expect(fbSend).toHaveBeenCalledWith("token", "PSID9", "hello");
    expect(linePush).not.toHaveBeenCalled();
  });
});
