import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { recordPaymentSchema } from "@shared/schema";
import { verifyInitData } from "../server/auth/telegram";

/**
 * Payment-recording flow — input contract (spec §3.2). The Accountant supplies
 * only student/amount/method; date and teacher/class are derived server-side.
 */
describe("recordPaymentSchema", () => {
  const student = "11111111-1111-1111-1111-111111111111";

  it("accepts a valid cash payment and coerces the amount", () => {
    const parsed = recordPaymentSchema.parse({ studentId: student, amount: "250000", method: "cash" });
    expect(parsed.amount).toBe(250000);
    expect(parsed.method).toBe("cash");
  });

  it("rejects non-positive amounts", () => {
    expect(() => recordPaymentSchema.parse({ studentId: student, amount: 0, method: "cash" })).toThrow();
    expect(() => recordPaymentSchema.parse({ studentId: student, amount: -5, method: "online" })).toThrow();
  });

  it("rejects an invalid payment method", () => {
    expect(() =>
      recordPaymentSchema.parse({ studentId: student, amount: 10, method: "card" }),
    ).toThrow();
  });

  it("strips any client-supplied date — only student/amount/method/billingMonth survive", () => {
    const parsed = recordPaymentSchema.parse({
      studentId: student,
      amount: 10,
      method: "online",
      createdAt: "2020-01-01",
      date: "2020-01-01",
    });
    expect("createdAt" in parsed).toBe(false);
    expect("date" in parsed).toBe(false);
    expect(Object.keys(parsed).sort()).toEqual(["amount", "method", "studentId"]);
  });
});

/**
 * Telegram initData verification (spec §7) — every API call is authenticated
 * with a verified hash. Build a signed payload the same way Telegram does and
 * assert the verifier accepts it and rejects tampering/expiry.
 */
function signInitData(token: string, user: object, authDate: number): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("user", JSON.stringify(user));
  const dataCheckString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("verifyInitData", () => {
  const token = "123456:test-bot-token";
  const user = { id: 42, first_name: "Dana", username: "dana" };
  const now = Math.floor(Date.now() / 1000);

  it("accepts a correctly signed, fresh payload", () => {
    const initData = signInitData(token, user, now);
    const result = verifyInitData(initData, token, 86400);
    expect(result.user.id).toBe(42);
  });

  it("rejects a tampered payload", () => {
    const initData = signInitData(token, user, now);
    const tampered = initData.replace("Dana", "Mallory");
    expect(() => verifyInitData(tampered, token, 86400)).toThrow();
  });

  it("rejects a payload signed with the wrong token", () => {
    const initData = signInitData("999:other", user, now);
    expect(() => verifyInitData(initData, token, 86400)).toThrow();
  });

  it("rejects an expired payload", () => {
    const initData = signInitData(token, user, now - 100_000);
    expect(() => verifyInitData(initData, token, 86400)).toThrow(/expired/);
  });
});
