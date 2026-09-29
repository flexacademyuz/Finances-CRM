/**
 * Elementary (A2) vocabulary → normalized rows (see tsv-set.ts for the rules).
 *
 * There is no customer source file: elementary-a2.tsv was written for the
 * academy (common CEFR A2 vocabulary, excluding what the beginner set already
 * teaches). v1 = 700 words (stages 1–7); v2 appended 500 more (stages 8–12).
 * The set was first imported as a DRAFT so a teacher could review the Uzbek.
 */
import { loadSource, type BuiltItem } from "./beginner-900";
import { buildTsvSet, loadTsvRows, type TsvRow, type TsvSetReport } from "./tsv-set";

export const ELEMENTARY_A2_SLUG = "elementary-a2";
/** Bump when elementary-a2.tsv changes, so boot re-syncs existing databases. */
export const ELEMENTARY_A2_VERSION = 2;

/** Beginner-list words deliberately repeated with a NEW meaning (A1 sense → A2 sense). */
export const NEW_SENSES = new Set([
  "sweet", // A1 sweet (noun) → adjective
  "flat", // A1 flat (apartment) → flat (level)
  "single", // A1 single (unmarried) → single (only one)
  "measure", // A1 noun → verb
  "iron", // A1 iron (appliance) → to iron
  "dish", // A1 dish (plate) → dish (food)
  "can", // A1 can (modal) → a can
  "change", // A1 to change → change (money back)
  "watch", // A1 to watch → a watch
  "glass", // A1 a glass (cup) → glass (material)
  "cold", // A1 cold (adj) → a cold (illness)
  "opposite", // A1 adjective → preposition
  "land", // A1 land (earth) → to land (plane)
  "take off", // A1 take off (clothes) → take off (plane)
  "book", // A1 book → to book
  "park", // A1 park → to park
  "fly", // A1 to fly → a fly
  "answer", // A1 to answer → an answer
  "mouse", // A1 animal → computer mouse
  "goal", // A1 aim → sports goal
  "train", // A1 train → to train
  "secret", // A1 adjective → noun
]);

export type A2Report = TsvSetReport;

export function loadElementaryRows(): TsvRow[] {
  return loadTsvRows("elementary-a2.tsv");
}

export function beginnerWords(): Set<string> {
  return new Set(loadSource().map((r) => r.word.trim().toLowerCase()));
}

export function buildElementaryA2(
  rows: TsvRow[] = loadElementaryRows(),
  earlier: Set<string> = beginnerWords(),
): { items: BuiltItem[]; report: A2Report } {
  return buildTsvSet({ slug: ELEMENTARY_A2_SLUG, rows, earlierWords: earlier, newSenses: NEW_SENSES, baseDifficulty: 2 });
}
