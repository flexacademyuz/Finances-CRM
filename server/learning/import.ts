/**
 * Idempotent import of the beginner-900 vocabulary into the database.
 *
 *  - resource: upserted by slug;
 *  - stages:   one learning_unit per 100 words, upserted by (resource, position);
 *  - items:    upserted by (resource, source_ref) — running it twice changes
 *              nothing and never duplicates. Fields an admin has edited
 *              (vocab_items.edited_fields) are never overwritten.
 *
 * Runs on boot when the stored content version is behind (ensureLearningContent),
 * or by hand: `npm run learning:import`.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { learningResources, learningUnits, vocabItems } from "@shared/schema";
import {
  BEGINNER_900_SLUG,
  BEGINNER_900_VERSION,
  buildBeginner900,
  type BuildReport,
} from "./content/beginner-900";

export type ImportResult = { resourceId: string; inserted: number; updated: number; report: BuildReport };

/** Keep the admin's value for `col` if it's listed in edited_fields, else take the import's. */
const keepEdited = (field: string, col: string) =>
  sql.raw(`CASE WHEN vocab_items.edited_fields ? '${field}' THEN vocab_items.${col} ELSE excluded.${col} END`);

export async function importBeginner900(): Promise<ImportResult> {
  const { items, report } = buildBeginner900();

  await db
    .insert(learningResources)
    .values({
      type: "vocabulary_set",
      slug: BEGINNER_900_SLUG,
      title: "Beginner Vocabulary (900 words)",
      titleUz: "Boshlang'ich lug'at (900 so'z)",
      description: "Core English words for beginners with Uzbek translations, in stages of 100.",
      level: "A1",
      status: "published",
      position: 1,
    })
    .onConflictDoNothing({ target: learningResources.slug });
  const [resource] = await db.select().from(learningResources).where(eq(learningResources.slug, BEGINNER_900_SLUG));

  const stageNos = [...new Set(items.map((i) => i.stage))];
  await db
    .insert(learningUnits)
    .values(
      stageNos.map((n) => ({
        resourceId: resource.id,
        position: n,
        title: `Stage ${n}`,
        titleUz: `${n}-bosqich`,
      })),
    )
    .onConflictDoNothing();
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
      settings: sql`${learningResources.settings} || ${JSON.stringify({ contentVersion: BEGINNER_900_VERSION })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(learningResources.id, resource.id));

  return { resourceId: resource.id, inserted, updated, report };
}

/** Boot hook: import only when missing or the bundled content is newer. */
export async function ensureLearningContent(): Promise<ImportResult | null> {
  const [existing] = await db
    .select({ settings: learningResources.settings })
    .from(learningResources)
    .where(and(eq(learningResources.slug, BEGINNER_900_SLUG)));
  const version = Number(existing?.settings?.contentVersion ?? 0);
  if (existing && version >= BEGINNER_900_VERSION) return null;
  return importBeginner900();
}
