/**
 * Pure helpers for linking a Telegram account to a student (bot flow + tests).
 */

/** Unambiguous alphabet (no 0/O, 1/I/L) — 31 symbols; 8 chars ≈ 40 bits. */
export const LINK_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const LINK_CODE_LENGTH = 8;

/** Canonical form of a typed code: upper-case, separators/spaces removed. */
export function normalizeLinkCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-_.]/g, "");
}

export function looksLikeLinkCode(raw: string): boolean {
  const c = normalizeLinkCode(raw);
  return c.length === LINK_CODE_LENGTH && [...c].every((ch) => LINK_CODE_ALPHABET.includes(ch));
}

/** "K7M2Q9XP" → "K7M2-Q9XP" for display. */
export function formatLinkCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Do two phone numbers refer to the same line? Compares the national
 * significant digits (last 9, the Uzbek length) so "+998 90 123-45-67",
 * "998901234567" and "901234567" all match. Numbers with fewer than 9 digits
 * never match (too ambiguous to trust for verification).
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = (a ?? "").replace(/\D/g, "");
  const dbb = (b ?? "").replace(/\D/g, "");
  if (da.length < 9 || dbb.length < 9) return false;
  return da.slice(-9) === dbb.slice(-9);
}

/**
 * Privacy-reduced name for the bot's public pick-list: first word in full, the
 * rest as initials ("Rahimov Abdulloh Karimovich" → "Rahimov A. K."). Enough
 * for a student to recognise themselves without broadcasting full names to
 * anyone who opens the bot.
 */
export function maskStudentName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return [parts[0], ...parts.slice(1).map((p) => `${p[0].toUpperCase()}.`)].join(" ");
}
