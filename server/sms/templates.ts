/**
 * Parent-facing SMS templates, in Uzbek.
 *
 * IMPORTANT — Eskiz moderation: every distinct message wording must be submitted
 * to Eskiz and approved before it will deliver on a branded sender. Register the
 * two `*_TEMPLATE` strings below verbatim (with the {placeholders}); the render
 * helpers only substitute values, they never change the surrounding wording, so
 * what we send always matches what was approved.
 *
 * These two strings mirror the templates registered in the Eskiz cabinet
 * (my.eskiz.uz → СМС → Мои шаблоны): the overdue text carries the academy name
 * as a leading brand prefix, and the receipt text carries no brand and no
 * "Rahmat!". Keep them character-for-character identical to the approved
 * versions, or Eskiz will reject the send at moderation. Only {name}, {amount}
 * and {academy} are variable — everything else is fixed, matched wording.
 *
 * Keep messages short (one SMS segment where possible), plain (no emoji — some
 * carriers mangle them and they cost extra segments), and free of internal
 * detail: a parent should learn only what concerns their own child.
 */

/** Payment received — a positive confirmation sent right after a payment. */
export const RECEIPT_TEMPLATE =
  "Hurmatli ota-ona! Farzandingiz {name} uchun {amount} so'm to'lov qabul qilindi.";

/** Overdue — a soft reminder that the monthly payment is past due. */
export const OVERDUE_TEMPLATE =
  "{academy}: Hurmatli ota-ona! Farzandingiz {name} uchun oylik to'lov muddati o'tdi. Iltimos, to'lovni amalga oshirishingizni so'raymiz.";

/** Group a UZS amount with spaces, the local convention: 350000 -> "350 000". */
function formatAmount(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)).replace(/ /g, " ");
}

/**
 * The student's given name (Ism), to keep the message short and personal.
 *
 * Names are entered surname-first — "Familiya Ism [Otasining ismi]" — so the
 * given name is the SECOND word. Single-word entries have no surname yet, so we
 * use the one word as-is (staff add surnames later, and this keeps working when
 * they do). Never returns empty.
 */
function givenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[1] ?? parts[0] ?? fullName.trim();
}

export function renderReceipt(args: {
  studentName: string;
  amount: number;
  /** Kept for call-site compatibility; the approved receipt text carries no brand. */
  academyName?: string;
}): string {
  return RECEIPT_TEMPLATE.replace("{name}", givenName(args.studentName)).replace(
    "{amount}",
    formatAmount(args.amount),
  );
}

export function renderOverdue(args: { studentName: string; academyName: string }): string {
  return OVERDUE_TEMPLATE.replace("{name}", givenName(args.studentName)).replace(
    "{academy}",
    args.academyName,
  );
}
