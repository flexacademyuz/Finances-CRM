/**
 * Grammar grading — pure, shared by server (the only grader) and tests.
 *
 * Bubbles: the model sentence's words + traps, shuffled. A built sentence is
 * right when it equals the model or any alternative, ignoring case and end
 * punctuation.
 *
 * Typed test answers (Uzbek → English):
 *  - capitals, punctuation, extra spaces and apostrophe style don't matter;
 *  - contractions are equivalent to their long form (it's = it is, don't = do not);
 *  - a small spelling slip in a CONTENT word ("becuase", "techer") = half credit;
 *  - anything else — a wrong grammar word ("She have"), a missing or extra
 *    word, wrong order — is wrong.
 */
import type { GrammarItemContent } from "./types";

const APOS = /[‘’ʻʼ`´]/g;

/** The words of a sentence as bubbles: split on spaces, end punctuation dropped. */
export function sentenceWords(en: string): string[] {
  return en
    .replace(APOS, "'")
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^["(]+|[.,!?;:")]+$/g, ""))
    .filter(Boolean);
}

/**
 * Bubble text for a word: the first word of the sentence is lower-cased so its
 * capital doesn't give the start away — unless it's "I" or a name/proper noun
 * (anything still capitalised mid-sentence somewhere in the language: we keep
 * the capital when the word is "I"/"I'm"/... or appears in `properNouns`).
 */
export function bubbleText(word: string, isFirst: boolean, properNouns: ReadonlySet<string> = PROPER): string {
  if (!isFirst) return word;
  if (/^I('|$)/.test(word) || properNouns.has(word)) return word;
  return word.charAt(0).toLowerCase() + word.slice(1);
}

/** Common names/places used in beginner content; extend as content grows. */
const PROPER = new Set([
  "Tashkent", "Samarkand", "Bukhara", "Uzbekistan", "London", "England", "English", "Uzbek",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
  "Ali", "Aziz", "Bekzod", "Dilnoza", "Jasur", "Kamola", "Madina", "Malika", "Nilufar", "Sardor", "Sevara", "Timur", "Zarina",
  "Anna", "Ben", "John", "Kate", "Mr", "Mrs", "Ms", "Tom",
]);

/** The bubbles for an item: its words + traps, in a seeded shuffle (stable per seed). */
export function bubblesFor(item: Pick<GrammarItemContent, "en" | "traps">, seed: number): string[] {
  const words = sentenceWords(item.en).map((w, i) => bubbleText(w, i === 0));
  return seededShuffle([...words, ...item.traps], seed);
}

/** Deterministic Fisher–Yates; never returns the words in their original order when avoidable. */
export function seededShuffle<T>(xs: T[], seed: number): T[] {
  let s = (seed >>> 0) || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const out = [...xs];
  for (let tries = 0; tries < 5; tries++) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.length < 3 || out.some((x, i) => x !== xs[i])) break;
  }
  return out;
}

/* ─────────────────────────── normalization ─────────────────────────── */

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, "cannot"],
  [/\bcan not\b/g, "cannot"],
  [/\bwon't\b/g, "will not"],
  [/\bshan't\b/g, "shall not"],
  [/\bain't\b/g, "is not"],
  [/\b(\w+)n't\b/g, "$1 not"],
  [/\bi'm\b/g, "i am"],
  [/\b(\w+)'re\b/g, "$1 are"],
  [/\b(\w+)'ve\b/g, "$1 have"],
  [/\b(\w+)'ll\b/g, "$1 will"],
  [/\b(\w+)'d\b/g, "$1 would"],
  // "'s got" is always "has got" — so "She is got" never matches "She's got".
  [/\b(he|she|it|that|there|what|who)'s got\b/g, "$1 has got"],
  // Otherwise 's is "is" or "has" (or possessive): expanded the same way on both sides,
  // so "He's" only matches "He's"/"He is"; content lists "He has got" as an alt.
  [/\b(he|she|it|that|there|what|where|who|how|here)'s\b/g, "$1 is"],
];

/** Canonical words of an English sentence for comparison. */
export function canonicalWords(s: string): string[] {
  let t = s.normalize("NFKC").replace(APOS, "'").toLowerCase();
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  return t
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Every accepted sentence for an item. */
export function acceptedSentences(item: Pick<GrammarItemContent, "en" | "alt">): string[] {
  return [item.en, ...(item.alt ?? [])];
}

/** Bubble answer: the tapped words, in order. */
export function gradeBuild(item: Pick<GrammarItemContent, "en" | "alt">, tokens: string[]): boolean {
  const built = canonicalWords(tokens.join(" "));
  return acceptedSentences(item).some((s) => same(canonicalWords(s), built));
}

/**
 * Grammar words: getting one of these wrong is a grammar mistake, never a
 * typo — even if it's one letter away ("has"/"have", "is"/"in", "a"/"an").
 */
const GRAMMAR_WORDS = new Set(
  (
    "a an the am is are was were be been being have has had having do does did done can could will would shall should may might must " +
    "not no i me my mine you your yours he him his she her hers it its we us our ours they them their theirs this that these those " +
    "there here some any much many few little more most less than then too very to of in on at by for from with about into onto under over " +
    "up down out off and or but so because if when while who whom whose which what where why how got get gets going go goes went gone " +
    "one ones each every all both either neither own"
  ).split(" "),
);

/** Damerau-free Levenshtein distance, capped (returns cap+1 once exceeded). */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Is `typed` a plausible misspelling of the content word `expected`? */
function isTypo(typed: string, expected: string): boolean {
  if (GRAMMAR_WORDS.has(expected) || GRAMMAR_WORDS.has(typed)) return false;
  if (expected.length < 4) return false;
  const limit = expected.length >= 8 ? 2 : 1;
  return editDistance(typed, expected, limit) <= limit;
}

export type TypedGrade = { score: 0 | 0.5 | 1; expected: string };

/**
 * Grade a typed answer against every accepted sentence; the best match wins.
 * Full credit for an exact (canonical) match; half credit when the words line
 * up one-to-one and the only differences are 1 (or, in a long sentence, 2)
 * small spelling slips in content words.
 */
export function gradeTyped(item: Pick<GrammarItemContent, "en" | "alt">, typed: string): TypedGrade {
  const t = canonicalWords(typed);
  let best: TypedGrade = { score: 0, expected: item.en };
  if (t.length === 0) return best;
  for (const s of acceptedSentences(item)) {
    const e = canonicalWords(s);
    if (same(e, t)) return { score: 1, expected: s };
    if (e.length !== t.length) continue;
    let slips = 0;
    let ok = true;
    for (let i = 0; i < e.length && ok; i++) {
      if (e[i] === t[i]) continue;
      if (isTypo(t[i], e[i])) slips++;
      else ok = false;
    }
    const maxSlips = e.length >= 8 ? 2 : 1;
    if (ok && slips > 0 && slips <= maxSlips && best.score < 0.5) best = { score: 0.5, expected: s };
  }
  return best;
}
