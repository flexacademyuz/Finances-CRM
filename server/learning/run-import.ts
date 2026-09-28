/**
 * `npm run learning:import` — apply migrations, (re)import the beginner-900
 * vocabulary and print the discrepancy report. Safe to run any number of times.
 */
import "dotenv/config";
import { runMigrations } from "../migrate";
import { importBeginner900 } from "./import";
import { pool } from "../db";

async function main() {
  await runMigrations();
  const r = await importBeginner900();
  const rep = r.report;
  console.log(`[learning] beginner-900: ${rep.items} items in ${rep.stages} stages (inserted ${r.inserted}, updated ${r.updated})`);
  console.log(`  source rows: ${rep.sourceRows}; numbering gaps: ${rep.numberingGaps.join(", ") || "none"}`);
  for (const d of rep.duplicatesDropped) console.log(`  dropped #${d.no} ${d.word} (keeps #${d.keeps}): ${d.reason}`);
  for (const h of rep.homonymsKept) console.log(`  homonym kept: ${h.word} (#${h.nos.join(", #")})`);
  for (const c of rep.corrections) console.log(`  corrected #${c.no}: ${c.note}`);
  for (const f of rep.flagged) console.log(`  review #${f.no} ${f.word}: ${f.note}`);
  if (rep.missingEnrichment.length) console.log(`  missing enrichment: ${rep.missingEnrichment.join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
