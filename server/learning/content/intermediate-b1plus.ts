/**
 * Intermediate (B1+) vocabulary → normalized rows (see tsv-set.ts).
 *
 * Written for the academy: 1,500 words in 15 themed stages — personality and
 * feelings, relationships, education, work, business, media and the internet,
 * science and technology, health, environment, crime and law, politics and
 * society, travel and housing, arts and sport, core verbs/adjectives, and
 * linking words / phrasal verbs. No word repeats an easier set (A1, A2, B1).
 * Imported as a DRAFT so a teacher can review the Uzbek before publishing.
 */
import type { BuiltItem } from "./beginner-900";
import { wordsBeforeB1, buildPreIntermediateB1 } from "./pre-intermediate-b1";
import { buildTsvSet, loadTsvRows, type TsvRow, type TsvSetReport } from "./tsv-set";

export const INTERMEDIATE_B1PLUS_SLUG = "intermediate-b1plus";
/** Bump when intermediate-b1plus.tsv changes, so boot re-syncs existing databases. */
export const INTERMEDIATE_B1PLUS_VERSION = 1;

/** Every word taught by the easier sets (A1 + A2 + B1). */
export function wordsBeforeB1Plus(): Set<string> {
  const words = wordsBeforeB1();
  for (const it of buildPreIntermediateB1().items) words.add(it.word.toLowerCase());
  return words;
}

export function buildIntermediateB1Plus(
  rows: TsvRow[] = loadTsvRows("intermediate-b1plus.tsv"),
  earlier: Set<string> = wordsBeforeB1Plus(),
): { items: BuiltItem[]; report: TsvSetReport } {
  return buildTsvSet({ slug: INTERMEDIATE_B1PLUS_SLUG, rows, earlierWords: earlier, baseDifficulty: 3 });
}
