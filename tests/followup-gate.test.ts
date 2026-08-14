import { describe, expect, it } from "vitest";

import { evaluateFollowupGate } from "@/features/followup/gate";

describe("follow-up 24h window gate (risk #1)", () => {
  it("within the window, anything is allowed", () => {
    expect(
      evaluateFollowupGate({
        withinWindow: true,
        category: "PROMOTIONAL",
        channelType: "MESSENGER",
      }).allowed,
    ).toBe(true);
  });

  it("outside the window, transactional is allowed on any channel", () => {
    expect(
      evaluateFollowupGate({
        withinWindow: false,
        category: "TRANSACTIONAL",
        channelType: "MESSENGER",
      }).allowed,
    ).toBe(true);
  });

  it("outside the window, promotional is allowed on LINE (push)", () => {
    const g = evaluateFollowupGate({
      withinWindow: false,
      category: "PROMOTIONAL",
      channelType: "LINE",
    });
    expect(g.allowed).toBe(true);
    expect(g.reason).toBe("promotional_line_push");
  });

  it("outside the window, promotional is BLOCKED on Messenger", () => {
    const g = evaluateFollowupGate({
      withinWindow: false,
      category: "PROMOTIONAL",
      channelType: "MESSENGER",
    });
    expect(g.allowed).toBe(false);
    expect(g.reason).toBe("promotional_needs_optin");
  });

  it("outside the window, conversational re-engagement is blocked on Messenger", () => {
    expect(
      evaluateFollowupGate({
        withinWindow: false,
        category: "CONVERSATIONAL",
        channelType: "MESSENGER",
      }).allowed,
    ).toBe(false);
  });
});
