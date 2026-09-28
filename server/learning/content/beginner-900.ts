/**
 * The "900 Words for Beginners" English–Uzbek list → normalized vocabulary rows.
 *
 * Inputs (both in this folder, both committed):
 *  - beginner-900.source.json     verbatim extraction of the source .docx table
 *                                 (No. / English Word / Uzbek Translation);
 *  - beginner-900.enrichment.tsv  GENERATED part of speech, IPA and one example
 *                                 sentence per word (not from the source file).
 *
 * Every change to the source is explicit and listed below — nothing is fixed
 * silently. Pure and deterministic: the importer (../import.ts) and the tests
 * both call `buildBeginner900()`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BEGINNER_900_SLUG = "beginner-900";
/** Bump when the content below changes, so boot re-syncs existing databases. */
export const BEGINNER_900_VERSION = 1;
export const STAGE_SIZE = 100;

/**
 * Source entries that repeat an earlier entry with the same word AND meaning.
 * The FIRST occurrence is kept (Blue #329 also has the fuller "ko'k, havorang").
 * Stop (#208 bekat / #266 to'xtamoq) and May (#254 mumkin / #398 the month) are
 * genuine homonyms with different meanings and are deliberately KEPT as two items.
 */
export const DUPLICATES: Record<number, { keeps: number; reason: string }> = {
  798: { keeps: 329, reason: "Blue repeated in the Colours section" },
  799: { keeps: 367, reason: "White repeated in the Colours section" },
  801: { keeps: 342, reason: "Green repeated in the Colours section" },
};

/** Clear spelling errors in the source, corrected on import and noted on the item. */
export const ERRATA: Record<number, { word?: string; translation?: string; note: string }> = {
  683: { word: "Price", note: "Source spelling 'Prise' corrected to 'Price'." },
  301: { translation: "yashamoq", note: "Source Uzbek 'yashabmoq' corrected to 'yashamoq'." },
};

/**
 * Translations that look questionable to a reviewer. Imported UNCHANGED (the
 * source is the source of truth) — surfaced in the report / admin UI so a
 * teacher can decide and edit.
 */
export const REVIEW_FLAGS: Record<number, string> = {
  49: "Chicken = 'jo'ja' (chick); 'tovuq' is the usual word.",
  55: "Corn = 'don' (grain); 'makkajo'xori' is maize.",
  62: "Spice = 'dorivor' (medicinal); 'ziravor' is the usual word.",
  121: "Woman = 'xotin'; 'ayol' is the neutral word.",
  231: "Become = 'aylanmoq'; 'bo'lmoq' is closer.",
  284: "Decide = 'yechmoq (qaror qilmoq)'; 'qaror qilmoq' is the meaning.",
  365: "Strange = 'notanish' (unfamiliar); 'g'alati' is closer.",
  384: "Afternoon = 'tushlik' (lunch); 'tushdan keyin' is the meaning.",
  641: "'Running nose' — standard English is 'runny nose'.",
  745: "Delivery = 'tug'ish (yetkazib berish)' — childbirth sense listed first.",
  806: "Purple = 'to'q qizil' (dark red); 'binafsha' is purple.",
  808: "Best = 'zo'r'; 'eng yaxshi' is the superlative.",
  870: "Up = 'teppa'; 'tepaga' is the direction.",
  882: "However = 'har qanday holatda'; 'biroq / ammo' is the usual meaning.",
};

export type SourceRow = { no: number; word: string; translation: string };
export type Enrichment = { pos: string; ipa: string; example: string };

export type BuiltItem = {
  sourceRef: string;
  sourceNo: number;
  position: number; // 1-based, after de-duplication
  stage: number; // 1-based
  word: string;
  translation: string;
  partOfSpeech: string | null;
  phonetic: string | null;
  example: string | null;
  difficulty: number;
  note: string | null;
};

export type BuildReport = {
  sourceRows: number;
  numberingGaps: number[];
  duplicatesDropped: { no: number; word: string; keeps: number; reason: string }[];
  homonymsKept: { word: string; nos: number[] }[];
  corrections: { no: number; note: string }[];
  flagged: { no: number; word: string; note: string }[];
  missingEnrichment: number[];
  items: number;
  stages: number;
};

const here = path.dirname(fileURLToPath(import.meta.url));

/** Content folder — works from source (tsx) and from the esbuild bundle (cwd). */
export function contentDir(): string {
  const candidates = [here, path.resolve(process.cwd(), "server/learning/content")];
  return candidates.find((p) => fs.existsSync(path.join(p, "beginner-900.source.json"))) ?? here;
}

export function loadSource(dir = contentDir()): SourceRow[] {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, "beginner-900.source.json"), "utf8"));
  return raw.rows as SourceRow[];
}

export function loadEnrichment(dir = contentDir()): Map<number, Enrichment> {
  const text = fs.readFileSync(path.join(dir, "beginner-900.enrichment.tsv"), "utf8");
  const map = new Map<number, Enrichment>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [no, pos, ipa, example] = line.split("\t");
    map.set(Number(no), { pos: pos?.trim() ?? "", ipa: ipa?.trim() ?? "", example: example?.trim() ?? "" });
  }
  return map;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Normalize the source into ordered, staged items plus a discrepancy report. */
export function buildBeginner900(
  source: SourceRow[] = loadSource(),
  enrichment: Map<number, Enrichment> = loadEnrichment(),
): { items: BuiltItem[]; report: BuildReport } {
  const report: BuildReport = {
    sourceRows: source.length,
    numberingGaps: [],
    duplicatesDropped: [],
    homonymsKept: [],
    corrections: [],
    flagged: [],
    missingEnrichment: [],
    items: 0,
    stages: 0,
  };

  let prev = 0;
  for (const r of source) {
    for (let n = prev + 1; n < r.no; n++) report.numberingGaps.push(n);
    prev = r.no;
  }

  const items: BuiltItem[] = [];
  const seenPair = new Map<string, number>(); // word|translation → no
  const byWord = new Map<string, number[]>();
  for (const r of source) {
    const word = clean(r.word);
    const translation = clean(r.translation);
    if (!word || !translation) throw new Error(`beginner-900: row ${r.no} is missing a word or translation`);

    const dup = DUPLICATES[r.no];
    if (dup) {
      report.duplicatesDropped.push({ no: r.no, word, keeps: dup.keeps, reason: dup.reason });
      continue;
    }
    const fix = ERRATA[r.no];
    const finalWord = fix?.word ?? word;
    const finalTranslation = fix?.translation ?? translation;
    if (fix) report.corrections.push({ no: r.no, note: fix.note });

    // Any unlisted exact repeat is a bug in the lists above — fail loudly.
    const key = `${finalWord.toLowerCase()}|${finalTranslation.toLowerCase()}`;
    if (seenPair.has(key)) throw new Error(`beginner-900: unlisted duplicate #${r.no} of #${seenPair.get(key)}`);
    seenPair.set(key, r.no);
    const wk = finalWord.toLowerCase();
    byWord.set(wk, [...(byWord.get(wk) ?? []), r.no]);

    const e = enrichment.get(r.no);
    if (!e) report.missingEnrichment.push(r.no);
    if (REVIEW_FLAGS[r.no]) report.flagged.push({ no: r.no, word: finalWord, note: REVIEW_FLAGS[r.no] });

    const position = items.length + 1;
    const stage = Math.ceil(position / STAGE_SIZE);
    items.push({
      sourceRef: `${BEGINNER_900_SLUG}#${r.no}`,
      sourceNo: r.no,
      position,
      stage,
      word: finalWord,
      translation: finalTranslation,
      partOfSpeech: e?.pos || null,
      phonetic: e?.ipa || null,
      example: e?.example || null,
      // Rises gently with the stage (1…5); later stages hold rarer words.
      difficulty: Math.min(5, Math.ceil(stage / 2)),
      note: fix?.note ?? null,
    });
  }

  report.homonymsKept = [...byWord].filter(([, nos]) => nos.length > 1).map(([w, nos]) => ({ word: w, nos }));
  report.items = items.length;
  report.stages = items.length ? items[items.length - 1].stage : 0;
  return { items, report };
}
