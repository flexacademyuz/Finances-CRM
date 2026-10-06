/**
 * Content checks for grammar topics — run by the tests on every content file
 * so a broken sentence never reaches a student.
 */
import type { GrammarItemContent, GrammarTopicContent } from "./types";
import { canonicalWords, gradeBuild, gradeTyped, sentenceWords } from "./grade";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CURLY = /[‘’ʻʼ`´“”]/;
const CYRILLIC = /[Ѐ-ӿ]/;

/** Problems found in one topic (empty = fine). */
export function validateTopic(t: GrammarTopicContent): string[] {
  const errs: string[] = [];
  const where = (kind: string, i: number) => `${t.slug} ${kind}[${i}]`;
  if (!SLUG.test(t.slug)) errs.push(`${t.slug}: slug must be kebab-case`);
  if (!t.level) errs.push(`${t.slug}: missing level`);
  if (!(t.position >= 1)) errs.push(`${t.slug}: position must be >= 1`);
  if (!t.title.en || !t.title.uz) errs.push(`${t.slug}: title en/uz required`);
  if (!t.explanation.uz || !t.explanation.pattern) errs.push(`${t.slug}: explanation uz/pattern required`);
  if (t.explanation.examples.length < 2) errs.push(`${t.slug}: at least 2 examples`);
  if (t.build.length < 25) errs.push(`${t.slug}: needs ~30 build items (has ${t.build.length})`);
  if (t.test.length < 15) errs.push(`${t.slug}: needs ~20 test items (has ${t.test.length})`);

  const seen = new Map<string, string>();
  const check = (kind: "build" | "test", it: GrammarItemContent, i: number) => {
    const w = where(kind, i);
    if (!it.uz?.trim() || !it.en?.trim()) errs.push(`${w}: uz and en required`);
    if (CURLY.test(it.uz) || CURLY.test(it.en) || (it.alt ?? []).some((a) => CURLY.test(a)))
      errs.push(`${w}: use plain ' and " (no curly quotes/apostrophes)`);
    if (CYRILLIC.test(it.uz)) errs.push(`${w}: Uzbek must be Latin script`);
    if (!/^[A-Z0-9"]/.test(it.en)) errs.push(`${w}: en should start with a capital`);
    if (!/[.?!]$/.test(it.en)) errs.push(`${w}: en should end with . ? or !`);
    if (it.traps.length < 1 || it.traps.length > 2) errs.push(`${w}: needs 1-2 traps`);
    const words = sentenceWords(it.en).map((x) => x.toLowerCase());
    if (words.length < 3) errs.push(`${w}: sentence too short`);
    if (words.length > 14) errs.push(`${w}: sentence too long for bubbles (${words.length} words)`);
    for (const trap of it.traps) {
      if (!trap.trim() || /\s/.test(trap)) errs.push(`${w}: trap "${trap}" must be one word`);
      if (words.includes(trap.toLowerCase())) errs.push(`${w}: trap "${trap}" is already a word of the sentence`);
      // A trap must not produce another accepted sentence when swapped in for a word.
      for (let k = 0; k < words.length; k++) {
        const swapped = [...sentenceWords(it.en)];
        swapped[k] = trap;
        if (gradeBuild({ en: it.en, alt: it.alt }, swapped)) errs.push(`${w}: trap "${trap}" also makes a correct sentence`);
      }
    }
    if (!gradeBuild(it, sentenceWords(it.en))) errs.push(`${w}: model sentence does not grade as correct`);
    if (gradeTyped(it, it.en).score !== 1) errs.push(`${w}: typed model answer does not grade as correct`);
    for (const a of it.alt ?? []) if (gradeTyped(it, a).score !== 1) errs.push(`${w}: alt "${a}" does not grade`);
    const key = canonicalWords(it.en).join(" ");
    if (seen.has(key)) errs.push(`${w}: duplicate of ${seen.get(key)}`);
    seen.set(key, w);
  };
  t.build.forEach((it, i) => check("build", it, i));
  t.test.forEach((it, i) => check("test", it, i));
  return errs;
}

/** Problems across a whole level's topic list (positions unique and contiguous, slugs unique). */
export function validateTopics(ts: GrammarTopicContent[]): string[] {
  const errs = ts.flatMap(validateTopic);
  const slugs = new Set<string>();
  for (const t of ts) {
    if (slugs.has(t.slug)) errs.push(`duplicate slug ${t.slug}`);
    slugs.add(t.slug);
  }
  const byLevel = new Map<string, number[]>();
  for (const t of ts) (byLevel.get(t.level) ?? byLevel.set(t.level, []).get(t.level)!).push(t.position);
  for (const [lvl, ps] of byLevel) {
    const sorted = [...ps].sort((a, b) => a - b);
    sorted.forEach((p, i) => {
      if (p !== i + 1) errs.push(`${lvl}: positions must be 1..n without gaps/duplicates (got ${sorted.join(",")})`);
    });
  }
  return [...new Set(errs)];
}
