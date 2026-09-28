/**
 * Elementary (A2) vocabulary → normalized rows.
 *
 * Unlike beginner-900 there is no customer source file: the list in
 * elementary-a2.tsv was written for the academy (common CEFR A2 vocabulary,
 * excluding what the beginner set already teaches). It is imported as a DRAFT
 * set so a teacher can review the Uzbek translations before students see it
 * (publish from the staff Learning page).
 *
 * A word already in the beginner list is only allowed here when it teaches a
 * clearly different meaning — those are listed in NEW_SENSES; anything else
 * that overlaps is dropped and reported.
 */
import fs from "node:fs";
import path from "node:path";
import { contentDir, loadSource, STAGE_SIZE, type BuiltItem } from "./beginner-900";

export const ELEMENTARY_A2_SLUG = "elementary-a2";
/** Bump when elementary-a2.tsv changes, so boot re-syncs existing databases. */
export const ELEMENTARY_A2_VERSION = 1;

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

export type A2Report = {
  rows: number;
  droppedOverlap: string[];
  newSensesKept: string[];
  duplicatesDropped: string[];
  badExamples: string[];
  items: number;
  stages: number;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const norm = (s: string) => s.toLowerCase().replace(/[\s-]+/g, "");

export function loadElementaryRows(dir = contentDir()) {
  const text = fs.readFileSync(path.join(dir, "elementary-a2.tsv"), "utf8");
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l, i) => {
      const [word, translation, pos, ipa, example] = l.split("\t");
      return { line: i + 1, word: clean(word ?? ""), translation: clean(translation ?? ""), pos: pos?.trim() ?? "", ipa: ipa?.trim() ?? "", example: example?.trim() ?? "" };
    });
}

export function buildElementaryA2(
  rows = loadElementaryRows(),
  beginnerWords: Set<string> = new Set(loadSource().map((r) => r.word.trim().toLowerCase())),
): { items: BuiltItem[]; report: A2Report } {
  const report: A2Report = { rows: rows.length, droppedOverlap: [], newSensesKept: [], duplicatesDropped: [], badExamples: [], items: 0, stages: 0 };
  const items: BuiltItem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.word || !r.translation) throw new Error(`elementary-a2: line ${r.line} is missing a word or translation`);
    const key = r.word.toLowerCase();
    if (beginnerWords.has(key)) {
      if (!NEW_SENSES.has(key)) {
        report.droppedOverlap.push(r.word);
        continue;
      }
      report.newSensesKept.push(r.word);
    }
    const pair = `${key}|${r.translation.toLowerCase()}`;
    if (seen.has(pair)) {
      report.duplicatesDropped.push(r.word);
      continue;
    }
    seen.add(pair);
    const gap = /\{([^{}]+)\}/.exec(r.example)?.[1];
    const exampleOk = !!gap && norm(gap) === norm(r.word);
    if (!exampleOk) report.badExamples.push(r.word);
    const position = items.length + 1;
    const stage = Math.ceil(position / STAGE_SIZE);
    items.push({
      // The word itself is the stable key (the list has no source numbering);
      // two senses of one word get distinct refs via the translation.
      sourceRef: `${ELEMENTARY_A2_SLUG}#${key}${[...seen].filter((p) => p.startsWith(`${key}|`)).length > 1 ? `|${r.translation.toLowerCase()}` : ""}`,
      sourceNo: position,
      position,
      stage,
      word: r.word,
      translation: r.translation,
      partOfSpeech: r.pos || null,
      phonetic: r.ipa || null,
      example: exampleOk ? r.example : null,
      difficulty: Math.min(5, 2 + Math.floor((stage - 1) / 3)),
      note: null,
    });
  }
  report.items = items.length;
  report.stages = items.length ? items[items.length - 1].stage : 0;
  return { items, report };
}
