import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../server/auth/password";

/** Credential hashing used for account recovery / re-linking a new Telegram id. */
describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const stored = hashPassword("s3cret-pass");
    expect(stored).toContain(":");
    expect(verifyPassword("s3cret-pass", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("produces a different salt/hash each time", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("safely rejects empty / malformed stored hashes", () => {
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "nosalt")).toBe(false);
  });
});
