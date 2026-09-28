/**
 * Text helpers for vocabulary: answer normalization (typed answers), meaning
 * ("sense") parsing for choosing safe distractors, and example-sentence gaps.
 */

/** Uzbek apostrophe look-alikes (o‘, g’, ʻ, ʼ, `) → plain ASCII '. */
const APOS = /[‘’ʻʼ`´]/g;

/**
 * Canonical form of a typed English answer: case-, accent- and
 * spacing-insensitive, and hyphens/spaces are interchangeable
 * ("Ice-cream" = "ice cream" = "icecream", "Café" = "cafe", "Good bye" = "goodbye").
 */
export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(APOS, "'")
    .toLowerCase()
    .replace(/[.!?,;:"]/g, "")
    .replace(/[\s\-]+/g, "")
    .trim();
}

/** Is a typed answer equal to the expected word (after normalization)? */
export function answerMatches(typed: string, expected: string): boolean {
  const t = normalizeAnswer(typed);
  return t.length > 0 && t === normalizeAnswer(expected);
}

/**
 * The individual meanings in a translation, for overlap checks:
 * "qarz olmoq" → ["qarz olmoq"]; "sen, siz" → ["sen", "siz"];
 * "uy (bino)" → ["uy"]; "tushlik" → ["tushlik"].
 * Parenthesised glosses are dropped, apostrophes unified, case folded.
 */
export function senses(translation: string): string[] {
  return translation
    .replace(APOS, "'")
    .replace(/\([^)]*\)/g, " ")
    .split(/[,;/]/)
    .map((x) => x.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
}

/**
 * Could these two translations be confused — i.e. would offering one as a
 * WRONG option for the other be unfair? True if any meaning is shared
 * ("gapirmoq" for both speak/talk; "u" for he/she/it).
 */
export function meaningsOverlap(a: string, b: string): boolean {
  const sa = new Set(senses(a));
  if (sa.size === 0) return false;
  return senses(b).some((x) => sa.has(x));
}

/** Are two English headwords the same word (ignoring case/spacing)? */
export function sameWord(a: string, b: string): boolean {
  return normalizeAnswer(a) === normalizeAnswer(b);
}

const PROPER =
  /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)$/i;

/**
 * How to show a headword. Source lists capitalise every entry ("Apple"); we
 * show "apple" but keep real capitals: all-caps ("TV"), "I", weekdays/months
 * (when the item is the month, not the modal "may"), and anything its example
 * sentence capitalises mid-sentence ("Russia", "Great Britain").
 */
export function displayWord(word: string, example?: string | null, partOfSpeech?: string | null): string {
  const w = word.trim();
  if (w.length <= 1 || w === w.toUpperCase()) return w;
  const p = parseExample(example);
  if (p && p.before.trim() !== "" && !/["-]\s*$/.test(p.before) && /^[A-Z]/.test(p.gap)) return w;
  if (PROPER.test(w) && partOfSpeech !== "modal") return w;
  return w[0].toLowerCase() + w.slice(1);
}

/** Split an example "I {go} to school." into parts around the gap. */
export function parseExample(example: string | null | undefined): { before: string; gap: string; after: string } | null {
  if (!example) return null;
  const m = /^(.*?)\{([^{}]+)\}(.*)$/.exec(example);
  if (!m) return null;
  return { before: m[1], gap: m[2], after: m[3] };
}

/** The example with the braces removed ("I go to school."). */
export function plainExample(example: string | null | undefined): string {
  return (example ?? "").replace(/[{}]/g, "");
}

/** The example with the gap blanked ("I ___ to school."). */
export function blankedExample(example: string | null | undefined): string | null {
  const p = parseExample(example);
  return p ? `${p.before}___${p.after}` : null;
}

/** Is `example` usable for gap exercises for this headword? */
export function exampleFitsWord(example: string | null | undefined, word: string): boolean {
  const p = parseExample(example);
  return !!p && sameWord(p.gap, word);
}
