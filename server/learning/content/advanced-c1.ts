/**
 * Advanced (C1) vocabulary → normalized rows (see tsv-set.ts).
 *
 * Written for the academy: 1,500 words in 15 themed stages — character,
 * rhetoric, academic language, business strategy, economics, politics and
 * international relations, law, science and technology, medicine, the natural
 * world, arts and literature, society, advanced verbs, adjectives/adverbs,
 * and idioms. No word repeats an easier set (A1 … B2). Imported as a DRAFT.
 */
import type { BuiltItem } from "./beginner-900";
import { buildUpperIntermediateB2, wordsBeforeB2 } from "./upper-intermediate-b2";
import { buildTsvSet, loadTsvRows, type TsvRow, type TsvSetReport } from "./tsv-set";

export const ADVANCED_C1_SLUG = "advanced-c1";
/** Bump when advanced-c1.tsv changes, so boot re-syncs existing databases. */
export const ADVANCED_C1_VERSION = 1;

/** Every word taught by the easier sets (A1 … B2). */
export function wordsBeforeC1(): Set<string> {
  const words = wordsBeforeB2();
  for (const it of buildUpperIntermediateB2().items) words.add(it.word.toLowerCase());
  return words;
}

export function buildAdvancedC1(
  rows: TsvRow[] = loadTsvRows("advanced-c1.tsv"),
  earlier: Set<string> = wordsBeforeC1(),
): { items: BuiltItem[]; report: TsvSetReport } {
  return buildTsvSet({ slug: ADVANCED_C1_SLUG, rows, earlierWords: earlier, baseDifficulty: 4 });
}
