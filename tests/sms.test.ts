import { describe, it, expect } from "vitest";
import { normalizeUzPhone } from "../server/sms/eskiz";
import {
  renderReceipt,
  renderOverdue,
  RECEIPT_TEMPLATE,
  OVERDUE_TEMPLATE,
} from "../server/sms/templates";

/** Uzbek MSISDN normalization — the shape Eskiz requires (998XXXXXXXXX). */
describe("normalizeUzPhone", () => {
  it("prefixes the country code to a bare 9-digit number", () => {
    expect(normalizeUzPhone("901234567")).toBe("998901234567");
  });

  it("strips spaces, plus and punctuation", () => {
    expect(normalizeUzPhone("+998 90 123 45 67")).toBe("998901234567");
    expect(normalizeUzPhone("(90) 123-45-67")).toBe("998901234567");
  });

  it("keeps an already-full number", () => {
    expect(normalizeUzPhone("998901234567")).toBe("998901234567");
  });

  it("rejects clearly invalid input", () => {
    expect(normalizeUzPhone("")).toBeNull();
    expect(normalizeUzPhone(null)).toBeNull();
    expect(normalizeUzPhone("12345")).toBeNull();
    expect(normalizeUzPhone("hello")).toBeNull();
  });
});

/** Templates must substitute values without altering the moderated wording. */
describe("SMS templates", () => {
  it("receipt fills name (first only), grouped amount, academy", () => {
    const body = renderReceipt({
      studentName: "Muattar Abdullajonova",
      amount: 350000,
      academyName: "Flex Academy",
    });
    expect(body).toContain("Muattar");
    expect(body).not.toContain("Abdullajonova");
    expect(body).toContain("350 000");
    expect(body).toContain("Flex Academy");
    // No leftover placeholders.
    expect(body).not.toMatch(/\{.*?\}/);
  });

  it("overdue fills name + academy, no leftover placeholders", () => {
    const body = renderOverdue({ studentName: "Ali Valiyev", academyName: "Flex Academy" });
    expect(body).toContain("Ali");
    expect(body).toContain("Flex Academy");
    expect(body).not.toMatch(/\{.*?\}/);
  });

  it("rendered text preserves the surrounding template wording", () => {
    // The prefix before the first placeholder must be identical to the template's,
    // so what we send still matches what Eskiz approved.
    const prefix = RECEIPT_TEMPLATE.slice(0, RECEIPT_TEMPLATE.indexOf("{"));
    expect(renderReceipt({ studentName: "X", amount: 1, academyName: "A" })).toContain(prefix);
    const oPrefix = OVERDUE_TEMPLATE.slice(0, OVERDUE_TEMPLATE.indexOf("{"));
    expect(renderOverdue({ studentName: "X", academyName: "A" })).toContain(oPrefix);
  });
});
