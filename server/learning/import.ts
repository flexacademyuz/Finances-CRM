/**
 * Idempotent import of the bundled vocabulary sets into the database.
 *
 *  - resource: upserted by slug; its STATUS is only set on first insert
 *              (after that, publishing is a staff decision);
 *  - stages:   one learning_unit per 100 words, upserted by (resource, position);
 *  - items:    upserted by (resource, source_ref) — running it twice changes
 *              nothing and never duplicates. Fields an admin has edited
 *              (vocab_items.edited_fields) are never overwritten.
 *
 * Runs on boot for any set whose stored content version is behind
 * (ensureLearningContent), or by hand: `npm run learning:import`.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { learningResources, learningUnits, vocabItems } from "@shared/schema";
import {
  BEGINNER_900_SLUG,
  BEGINNER_900_VERSION,
  buildBeginner900,
  type BuildReport,
  type BuiltItem,
} from "./content/beginner-900";
import { ELEMENTARY_A2_SLUG, ELEMENTARY_A2_VERSION, buildElementaryA2, type A2Report } from "./content/elementary-a2";

export type VocabSetDef = {
  slug: string;
  version: number;
  level: string;
  title: string;
  titleUz: string;
  description: string;
  /** Status on FIRST import only. */
  initialStatus: "published" | "draft";
  position: number;
  build: () => { items: BuiltItem[]; report: BuildReport | A2Report };
};

/** Every vocabulary set that ships with the app, easiest first. */
export const VOCAB_SETS: VocabSetDef[] = [
  {
    slug: BEGINNER_900_SLUG,
    version: BEGINNER_900_VERSION,
    level: "A1",
    title: "Beginner Vocabulary (900 words)",
    titleUz: "Boshlang'ich lug'at (900 so'z)",
    description: "Core English words for beginners with Uzbek translations, in stages of 100.",
    initialStatus: "published",
    position: 1,
    build: buildBeginner900,
  },
  {
    slug: ELEMENTARY_A2_SLUG,
    version: ELEMENTARY_A2_VERSION,
    level: "A2",
    title: "Elementary Vocabulary (700 words)",
    titleUz: "Elementar lug'at (700 so'z)",
    description: "Everyday A2 words beyond the beginner list, with Uzbek translations, in stages of 100.",
    initialStatus: "draft",
    position: 2,
    build: buildElementaryA2,
  },
];

export type ImportResult = {
  slug: string;
  resourceId: string;
  inserted: number;
  updated: number;
  report: BuildReport | A2Report;
  stages: number;
  items: number;
};

/** Keep the admin's value for `col` if it's listed in edited_fields, else take the import's. */
const keepEdited = (field: string, col: string) =>
  sql.raw(`CASE WHEN vocab_items.edited_fields ? '${field}' THEN vocab_items.${col} ELSE excluded.${col} END`);

export async function importVocabSet(def: VocabSetDef): Promise<ImportResult> {
  const { items, report } = def.build();

  await db
    .insert(learningResources)
    .values({
      type: "vocabulary_set",
      slug: def.slug,
      title: def.title,
      titleUz: def.titleUz,
      description: def.description,
      level: def.level,
      status: def.initialStatus,
      position: def.position,
    })
    .onConflictDoNothing({ target: learningResources.slug });
  const [resource] = await db.select().from(learningResources).where(eq(learningResources.slug, def.slug));

  const stageNos = [...new Set(items.map((i) => i.stage))];
  if (stageNos.length) {
    await db
      .insert(learningUnits)
      .values(stageNos.map((n) => ({ resourceId: resource.id, position: n, title: `Stage ${n}`, titleUz: `${n}-bosqich` })))
      .onConflictDoNothing();
  }
  const units = await db.select().from(learningUnits).where(eq(learningUnits.resourceId, resource.id));
  const unitByPos = new Map(units.map((u) => [u.position, u.id]));

  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200).map((it) => ({
      resourceId: resource.id,
      unitId: unitByPos.get(it.stage)!,
      position: it.position,
      sourceRef: it.sourceRef,
      word: it.word,
      translation: it.translation,
      partOfSpeech: it.partOfSpeech,
      phonetic: it.phonetic,
      example: it.example,
      difficulty: it.difficulty,
      note: it.note,
    }));
    const rows = await db
      .insert(vocabItems)
      .values(chunk)
      .onConflictDoUpdate({
        target: [vocabItems.resourceId, vocabItems.sourceRef],
        set: {
          word: keepEdited("word", "word"),
          translation: keepEdited("translation", "translation"),
          partOfSpeech: keepEdited("partOfSpeech", "part_of_speech"),
          phonetic: keepEdited("phonetic", "phonetic"),
          example: keepEdited("example", "example"),
          difficulty: keepEdited("difficulty", "difficulty"),
          note: keepEdited("note", "note"),
          unitId: keepEdited("unitId", "unit_id"),
          position: keepEdited("unitId", "position"),
          updatedAt: new Date(),
        },
      })
      // xmax = 0 ⇔ the row was freshly inserted (not updated) in this statement.
      .returning({ fresh: sql<boolean>`(xmax = 0)` });
    for (const r of rows) (r.fresh ? inserted++ : updated++);
  }

  await db
    .update(learningResources)
    .set({
      level: def.level,
      settings: sql`${learningResources.settings} || ${JSON.stringify({ contentVersion: def.version })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(learningResources.id, resource.id));

  return {
    slug: def.slug,
    resourceId: resource.id,
    inserted,
    updated,
    report,
    items: items.length,
    stages: stageNos.length,
  };
}

/** Kept for callers/tests that import just the beginner list. */
export async function importBeginner900(): Promise<ImportResult & { report: BuildReport }> {
  return (await importVocabSet(VOCAB_SETS[0])) as ImportResult & { report: BuildReport };
}

/** Boot hook: import each set that is missing or older than the bundled content. */
export async function ensureLearningContent(): Promise<ImportResult[]> {
  const out: ImportResult[] = [];
  for (const def of VOCAB_SETS) {
    const [existing] = await db
      .select({ settings: learningResources.settings })
      .from(learningResources)
      .where(eq(learningResources.slug, def.slug));
    const version = Number(existing?.settings?.contentVersion ?? 0);
    if (existing && version >= def.version) continue;
    out.push(await importVocabSet(def));
  }
  return out;
}
