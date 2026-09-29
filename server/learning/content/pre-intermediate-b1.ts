/**
 * Pre-Intermediate (B1) vocabulary → normalized rows (see tsv-set.ts).
 *
 * Written for the academy: 1,200 words in 12 stages covering personality and
 * relationships, study and work, society and media, law, environment and
 * science, technology, health and sport, travel and housing, money and
 * business, core B1 verbs and adjectives, linking words and phrasal verbs.
 * No word repeats the Beginner (A1) or Elementary (A2) sets. Imported as a
 * DRAFT so a teacher can review the Uzbek translations before publishing.
 */
import type { BuiltItem } from "./beginner-900";
import { beginnerWords, buildElementaryA2 } from "./elementary-a2";
import { buildTsvSet, loadTsvRows, type TsvRow, type TsvSetReport } from "./tsv-set";

export const PRE_INTERMEDIATE_B1_SLUG = "pre-intermediate-b1";
/** Bump when pre-intermediate-b1.tsv changes, so boot re-syncs existing databases. */
export const PRE_INTERMEDIATE_B1_VERSION = 1;

/** Every word taught by the easier sets (A1 + A2). */
export function wordsBeforeB1(): Set<string> {
  const words = beginnerWords();
  for (const it of buildElementaryA2().items) words.add(it.word.toLowerCase());
  return words;
}

export function buildPreIntermediateB1(
  rows: TsvRow[] = loadTsvRows("pre-intermediate-b1.tsv"),
  earlier: Set<string> = wordsBeforeB1(),
): { items: BuiltItem[]; report: TsvSetReport } {
  return buildTsvSet({ slug: PRE_INTERMEDIATE_B1_SLUG, rows, earlierWords: earlier, baseDifficulty: 3 });
}
