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
  it("receipt uses the given name (2nd word, surname-first) + grouped amount, no brand", () => {
    // Entered surname-first: "Familiya Ism [Otasining ismi]".
    const body = renderReceipt({
      studentName: "Abdullajonova Muattar Karimovna",
      amount: 350000,
    });
    expect(body).toContain("Muattar");
    expect(body).not.toContain("Abdullajonova"); // surname dropped
    expect(body).not.toContain("Karimovna"); // patronymic dropped
    expect(body).toContain("350 000");
    // The approved receipt text carries no academy prefix/suffix.
    expect(body).not.toContain("Flex Academy");
    expect(body).toContain("to'lov qabul qilindi.");
    // No leftover placeholders.
    expect(body).not.toMatch(/\{.*?\}/);
  });

  it("falls back to the single word when no surname was entered yet", () => {
    const body = renderReceipt({ studentName: "Muhammad", amount: 1000 });
    expect(body).toContain("Muhammad");
    expect(body).not.toMatch(/\{.*?\}/);
  });

  it("overdue leads with the academy brand + given name, no leftover placeholders", () => {
    const body = renderOverdue({ studentName: "Valiyev Ali", academyName: "Flex Academy" });
    expect(body.startsWith("Flex Academy: ")).toBe(true);
    expect(body).toContain("Ali");
    expect(body).not.toContain("Valiyev"); // surname dropped
    expect(body).toContain("so'raymiz.");
    expect(body).not.toMatch(/\{.*?\}/);
  });

  it("rendered text preserves the surrounding template wording", () => {
    // The fixed wording around each placeholder must be identical to the
    // template's, so what we send still matches what Eskiz approved.
    const prefix = RECEIPT_TEMPLATE.slice(0, RECEIPT_TEMPLATE.indexOf("{"));
    expect(renderReceipt({ studentName: "X", amount: 1 })).toContain(prefix);
    // The overdue template opens with {academy}; the fixed segment follows it.
    const oFixed = OVERDUE_TEMPLATE.slice(OVERDUE_TEMPLATE.indexOf("}") + 1, OVERDUE_TEMPLATE.indexOf("{name}"));
    expect(renderOverdue({ studentName: "X", academyName: "A" })).toContain(oFixed);
  });
});
