import { describe, expect, it } from "vitest";

import { roleCan } from "@/features/team/roles";

describe("roleCan", () => {
  it("OWNER can do everything incl. billing", () => {
    expect(roleCan("OWNER", "manage_billing")).toBe(true);
    expect(roleCan("OWNER", "manage_team")).toBe(true);
  });
  it("ADMIN manages team/settings but not billing", () => {
    expect(roleCan("ADMIN", "manage_team")).toBe(true);
    expect(roleCan("ADMIN", "manage_billing")).toBe(false);
  });
  it("SALES edits sales, not settings", () => {
    expect(roleCan("SALES", "edit_sales")).toBe(true);
    expect(roleCan("SALES", "manage_settings")).toBe(false);
  });
  it("SUPPORT replies but can't edit sales", () => {
    expect(roleCan("SUPPORT", "reply_chat")).toBe(true);
    expect(roleCan("SUPPORT", "edit_sales")).toBe(false);
  });
  it("VIEWER can only view", () => {
    expect(roleCan("VIEWER", "view")).toBe(true);
    expect(roleCan("VIEWER", "reply_chat")).toBe(false);
  });
});
