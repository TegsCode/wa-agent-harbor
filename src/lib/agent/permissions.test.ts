import { describe, expect, it } from "vitest";
import { checkAccess, normalizeChatId } from "./permissions";

const base = { actions: ["read"], account_ids: [], allowed_chats: [], revoked_at: null };

describe("agent key permissions", () => {
  it("rejects send without the 'send' permission", () => {
    expect(checkAccess(base, { action: "send" })).toMatch(/send/);
  });
  it("allows read with the 'read' permission", () => {
    expect(checkAccess(base, { action: "read" })).toBeNull();
  });
  it("empty account list means all accounts", () => {
    expect(checkAccess(base, { accountId: "abc" })).toBeNull();
  });
  it("restricts to listed accounts", () => {
    expect(checkAccess({ ...base, account_ids: ["a"] }, { accountId: "b" })).not.toBeNull();
  });
  it("chat allowlist matches phone formats", () => {
    const key = { ...base, allowed_chats: ["+1 (555) 010-2000"] };
    expect(checkAccess(key, { chatId: "15550102000" })).toBeNull();
    expect(checkAccess(key, { chatId: "15550109999" })).not.toBeNull();
  });
  it("revoked keys are rejected", () => {
    expect(checkAccess({ ...base, revoked_at: "2026-01-01" }, { action: "read" })).toMatch(/revoked/);
  });
  it("normalizes group jids untouched", () => {
    expect(normalizeChatId("1203@g.us")).toBe("1203@g.us");
  });
});
