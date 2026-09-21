/**
 * Parent-facing SMS templates, in Uzbek.
 *
 * IMPORTANT — Eskiz moderation: every distinct message wording must be submitted
 * to Eskiz and approved before it will deliver on a branded sender. Register the
 * two `*_TEMPLATE` strings below verbatim (with the {placeholders}); the render
 * helpers only substitute values, they never change the surrounding wording, so
 * what we send always matches what was approved.
 *
 * Keep messages short (one SMS segment where possible), plain (no emoji — some
 * carriers mangle them and they cost extra segments), and free of internal
 * detail: a parent should learn only what concerns their own child.
 */

/** Payment received — a positive confirmation sent right after a payment. */
export const RECEIPT_TEMPLATE =
  "Hurmatli ota-ona! Farzandingiz {name} uchun {amount} so'm to'lov qabul qilindi. Rahmat! {academy}";

/** Overdue — a soft reminder that the monthly payment is past due. */
export const OVERDUE_TEMPLATE =
  "Hurmatli ota-ona! Farzandingiz {name} uchun oylik to'lov muddati o'tdi. Iltimos, to'lovni amalga oshirishingizni so'raymiz. {academy}";

/** Group a UZS amount with spaces, the local convention: 350000 -> "350 000". */
function formatAmount(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)).replace(/ /g, " ");
}

/** First name only, to keep the message short and personal. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim();
}

export function renderReceipt(args: {
  studentName: string;
  amount: number;
  academyName: string;
}): string {
  return RECEIPT_TEMPLATE.replace("{name}", firstName(args.studentName))
    .replace("{amount}", formatAmount(args.amount))
    .replace("{academy}", args.academyName);
}

export function renderOverdue(args: { studentName: string; academyName: string }): string {
  return OVERDUE_TEMPLATE.replace("{name}", firstName(args.studentName)).replace(
    "{academy}",
    args.academyName,
  );
}
