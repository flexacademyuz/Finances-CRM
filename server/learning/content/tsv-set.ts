/**
 * Shared builder for vocabulary sets written as TSV files in this folder
 * (Elementary A2, Pre-Intermediate B1, …):
 *
 *   word <TAB> Uzbek <TAB> part of speech <TAB> IPA <TAB> example with {word}
 *
 * Rules, applied the same way to every set:
 *  - a word already taught by an easier set is dropped (and reported), unless
 *    the set lists it in `newSenses` because it teaches a different meaning;
 *  - an exact repeat inside the file is dropped (and reported);
 *  - an example whose {gap} isn't the word is reported and not used for
 *    gap exercises;
 *  - stages of 100 in file order, so APPENDING words never moves existing
 *    words (or learners' progress) to another stage.
 */
import fs from "node:fs";
import path from "node:path";
import { contentDir, STAGE_SIZE, type BuiltItem } from "./beginner-900";

export type TsvSetReport = {
  rows: number;
  droppedOverlap: string[];
  newSensesKept: string[];
  duplicatesDropped: string[];
  badExamples: string[];
  items: number;
  stages: number;
};

export type TsvRow = { line: number; word: string; translation: string; pos: string; ipa: string; example: string };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const norm = (s: string) => s.toLowerCase().replace(/[\s-]+/g, "");

export function loadTsvRows(file: string, dir = contentDir()): TsvRow[] {
  const text = fs.readFileSync(path.join(dir, file), "utf8");
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l, i) => {
      const [word, translation, pos, ipa, example] = l.split("\t");
      return {
        line: i + 1,
        word: clean(word ?? ""),
        translation: clean(translation ?? ""),
        pos: pos?.trim() ?? "",
        ipa: ipa?.trim() ?? "",
        example: example?.trim() ?? "",
      };
    });
}

export function buildTsvSet(opts: {
  slug: string;
  rows: TsvRow[];
  /** Words (lower-case) already taught by easier sets. */
  earlierWords: Set<string>;
  /** Earlier words deliberately repeated with a new meaning. */
  newSenses?: Set<string>;
  /** Difficulty of the first stage (rises every 3 stages, max 5). */
  baseDifficulty: number;
}): { items: BuiltItem[]; report: TsvSetReport } {
  const { slug, rows, earlierWords } = opts;
  const newSenses = opts.newSenses ?? new Set<string>();
  const report: TsvSetReport = { rows: rows.length, droppedOverlap: [], newSensesKept: [], duplicatesDropped: [], badExamples: [], items: 0, stages: 0 };
  const items: BuiltItem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.word || !r.translation) throw new Error(`${slug}: line ${r.line} is missing a word or translation`);
    const key = r.word.toLowerCase();
    if (earlierWords.has(key)) {
      if (!newSenses.has(key)) {
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
    // The word is the stable key; a second sense of the same word adds its meaning.
    const senses = [...seen].filter((p) => p.startsWith(`${key}|`)).length;
    items.push({
      sourceRef: `${slug}#${key}${senses > 1 ? `|${r.translation.toLowerCase()}` : ""}`,
      sourceNo: position,
      position,
      stage,
      word: r.word,
      translation: r.translation,
      partOfSpeech: r.pos || null,
      phonetic: r.ipa || null,
      example: exampleOk ? r.example : null,
      difficulty: Math.min(5, opts.baseDifficulty + Math.floor((stage - 1) / 3)),
      note: null,
    });
  }
  report.items = items.length;
  report.stages = items.length ? items[items.length - 1].stage : 0;
  return { items, report };
}
