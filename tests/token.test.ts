import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "../server/auth/token";

/** Web session tokens for browser logins (outside Telegram). */
describe("session tokens", () => {
  it("round-trips a user id", () => {
    const t = signToken("user-123");
    expect(verifyToken(t)).toBe("user-123");
  });

  it("rejects a tampered token", () => {
    const t = signToken("user-123");
    expect(verifyToken(t + "x")).toBeNull();
    expect(verifyToken("garbage")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });

  it("rejects an expired token", () => {
    const t = signToken("user-123", -1); // already expired
    expect(verifyToken(t)).toBeNull();
  });
});
