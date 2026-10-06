/**
 * Idempotent sync of the bundled grammar topics (content/index.ts) into the DB.
 *
 *  - topics: upserted by slug. A NEW topic is inserted as a DRAFT; an existing
 *            topic's status is never touched (publishing is a staff decision).
 *  - items:  upserted by (topic, kind, position). Fields a staff member edited
 *            (grammar_items.edited_fields) are never overwritten — including
 *            "active" when staff switched an item off.
 *  - items no longer in the content are set inactive (never deleted).
 *
 * Runs on boot when the stored content version is behind GRAMMAR_CONTENT_VERSION
 * (ensureGrammarContent), and from `npm run learning:import`.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { grammarItems, grammarTopics } from "@shared/schema";
import type { GrammarTopicContent } from "@shared/grammar/types";
import { GRAMMAR_CONTENT_VERSION, GRAMMAR_TOPICS } from "./content";

export type GrammarImportResult = {
  topics: number;
  topicsInserted: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsDeactivated: number;
};

/** Keep the staff value for `col` if `field` is in edited_fields, else take the import's. */
const keepEdited = (field: string, col: string) =>
  sql.raw(`CASE WHEN grammar_items.edited_fields ? '${field}' THEN grammar_items.${col} ELSE excluded.${col} END`);

export async function importGrammarTopics(
  topics: GrammarTopicContent[] = GRAMMAR_TOPICS,
  version: number = GRAMMAR_CONTENT_VERSION,
): Promise<GrammarImportResult> {
  const out: GrammarImportResult = { topics: topics.length, topicsInserted: 0, itemsInserted: 0, itemsUpdated: 0, itemsDeactivated: 0 };
  for (const t of topics) {
    const fields = {
      level: t.level,
      position: t.position,
      titleEn: t.title.en,
      titleUz: t.title.uz,
      explanation: t.explanation,
      contentVersion: version,
    };
    const ins = await db
      .insert(grammarTopics)
      .values({ slug: t.slug, status: "draft", ...fields })
      .onConflictDoNothing({ target: grammarTopics.slug })
      .returning({ id: grammarTopics.id });
    if (ins.length) out.topicsInserted++;
    const [topic] = await db
      .update(grammarTopics)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(grammarTopics.slug, t.slug))
      .returning({ id: grammarTopics.id });

    const rows = [
      ...t.build.map((it, i) => ({ kind: "build", position: i + 1, it })),
      ...t.test.map((it, i) => ({ kind: "test", position: i + 1, it })),
    ].map(({ kind, position, it }) => ({
      topicId: topic.id,
      kind,
      position,
      uz: it.uz,
      en: it.en,
      alt: it.alt ?? [],
      traps: it.traps,
      active: true,
    }));
    if (rows.length) {
      const res = await db
        .insert(grammarItems)
        .values(rows)
        .onConflictDoUpdate({
          target: [grammarItems.topicId, grammarItems.kind, grammarItems.position],
          set: {
            uz: keepEdited("uz", "uz"),
            en: keepEdited("en", "en"),
            alt: keepEdited("alt", "alt"),
            traps: keepEdited("traps", "traps"),
            active: keepEdited("active", "active"),
            updatedAt: new Date(),
          },
        })
        // xmax = 0 ⇔ freshly inserted in this statement.
        .returning({ fresh: sql<boolean>`(xmax = 0)` });
      for (const r of res) (r.fresh ? out.itemsInserted++ : out.itemsUpdated++);
    }

    // Anything beyond the content's current length is gone from the content.
    for (const [kind, count] of [["build", t.build.length], ["test", t.test.length]] as const) {
      const gone = await db
        .update(grammarItems)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(grammarItems.topicId, topic.id),
            eq(grammarItems.kind, kind),
            sql`${grammarItems.position} > ${count}`,
            eq(grammarItems.active, true),
          ),
        )
        .returning({ id: grammarItems.id });
      out.itemsDeactivated += gone.length;
    }
  }
  return out;
}

/** Boot hook: sync when a bundled topic is missing or its stored version is behind. */
export async function ensureGrammarContent(
  topics: GrammarTopicContent[] = GRAMMAR_TOPICS,
  version: number = GRAMMAR_CONTENT_VERSION,
): Promise<GrammarImportResult | null> {
  if (topics.length === 0) return null;
  const slugs = topics.map((t) => t.slug);
  const have = await db
    .select({ slug: grammarTopics.slug, v: grammarTopics.contentVersion })
    .from(grammarTopics)
    .where(inArray(grammarTopics.slug, slugs));
  const behind = have.length < slugs.length || have.some((r) => r.v < version);
  if (!behind) return null;
  return importGrammarTopics(topics, version);
}
