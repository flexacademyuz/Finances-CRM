/**
 * `npm run learning:import` — apply migrations, (re)import every bundled
 * vocabulary set and print its discrepancy report. Safe to run any number of
 * times; never changes a set's published/draft status after its first import.
 */
import "dotenv/config";
import { runMigrations } from "../migrate";
import { VOCAB_SETS, importVocabSet } from "./import";
import { pool } from "../db";
import { importGrammarTopics } from "./grammar/import";
import { validateTopics } from "@shared/grammar/validate";
import { GRAMMAR_TOPICS } from "./grammar/content";

async function main() {
  await runMigrations();
  for (const def of VOCAB_SETS) {
    const r = await importVocabSet(def);
    const rep = r.report as unknown as Record<string, unknown>;
    console.log(`[learning] ${def.slug} (${def.level}): ${r.items} items in ${r.stages} stages (inserted ${r.inserted}, updated ${r.updated})`);
    for (const [k, v] of Object.entries(rep)) {
      if (Array.isArray(v) && v.length) {
        console.log(`  ${k}: ${v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ")}`);
      }
    }
  }
  const problems = validateTopics(GRAMMAR_TOPICS);
  if (problems.length) console.log(`[learning] grammar content problems:\n  ${problems.join("\n  ")}`);
  const g = await importGrammarTopics();
  console.log(
    `[learning] grammar: ${g.topics} topics (+${g.topicsInserted} new, as drafts), items +${g.itemsInserted} ~${g.itemsUpdated} -${g.itemsDeactivated}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
