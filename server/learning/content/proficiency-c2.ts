/**
 * Proficiency (C2) vocabulary → normalized rows (see tsv-set.ts).
 *
 * Written for the academy: 1,500 words in 15 themed stages — literary
 * character and emotion, formal rhetoric, philosophy, legal/official register,
 * power and conflict, wealth, science and medicine, descriptive and literary
 * language, arts terminology, morality and deception, formal verbs,
 * adjectives/adverbs, and borrowed expressions (ad hoc, status quo …).
 * No word repeats an easier set (A1 … C1). Imported as a DRAFT.
 */
import type { BuiltItem } from "./beginner-900";
import { buildAdvancedC1, wordsBeforeC1 } from "./advanced-c1";
import { buildTsvSet, loadTsvRows, type TsvRow, type TsvSetReport } from "./tsv-set";

export const PROFICIENCY_C2_SLUG = "proficiency-c2";
/** Bump when proficiency-c2.tsv changes, so boot re-syncs existing databases. */
export const PROFICIENCY_C2_VERSION = 1;

/** Every word taught by the easier sets (A1 … C1). */
export function wordsBeforeC2(): Set<string> {
  const words = wordsBeforeC1();
  for (const it of buildAdvancedC1().items) words.add(it.word.toLowerCase());
  return words;
}

export function buildProficiencyC2(
  rows: TsvRow[] = loadTsvRows("proficiency-c2.tsv"),
  earlier: Set<string> = wordsBeforeC2(),
): { items: BuiltItem[]; report: TsvSetReport } {
  return buildTsvSet({ slug: PROFICIENCY_C2_SLUG, rows, earlierWords: earlier, baseDifficulty: 5 });
}
