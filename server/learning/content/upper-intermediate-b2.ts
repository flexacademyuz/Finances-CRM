/**
 * Upper-Intermediate (B2) vocabulary → normalized rows (see tsv-set.ts).
 *
 * Written for the academy: 1,500 words in 15 themed stages — character and
 * emotions, argument and persuasion, academic language, management, economics,
 * the arts and media, science, medicine and psychology, environment and
 * geography, law and ethics, politics and global issues, descriptive everyday
 * language, advanced verbs, advanced adjectives/adverbs, and phrasal verbs and
 * idioms. No word repeats an easier set (A1, A2, B1, B1+). Imported as a DRAFT.
 */
import type { BuiltItem } from "./beginner-900";
import { wordsBeforeB1Plus, buildIntermediateB1Plus } from "./intermediate-b1plus";
import { buildTsvSet, loadTsvRows, type TsvRow, type TsvSetReport } from "./tsv-set";

export const UPPER_INTERMEDIATE_B2_SLUG = "upper-intermediate-b2";
/** Bump when upper-intermediate-b2.tsv changes, so boot re-syncs existing databases. */
export const UPPER_INTERMEDIATE_B2_VERSION = 1;

/** Every word taught by the easier sets (A1 + A2 + B1 + B1+). */
export function wordsBeforeB2(): Set<string> {
  const words = wordsBeforeB1Plus();
  for (const it of buildIntermediateB1Plus().items) words.add(it.word.toLowerCase());
  return words;
}

export function buildUpperIntermediateB2(
  rows: TsvRow[] = loadTsvRows("upper-intermediate-b2.tsv"),
  earlier: Set<string> = wordsBeforeB2(),
): { items: BuiltItem[]; report: TsvSetReport } {
  return buildTsvSet({ slug: UPPER_INTERMEDIATE_B2_SLUG, rows, earlierWords: earlier, baseDifficulty: 4 });
}
