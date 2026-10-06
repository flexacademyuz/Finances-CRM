import express from "express";
import path from "node:path";
import fs from "node:fs";
import { env } from "./env";
import api from "./routes";
import { errorHandler } from "./routes/helpers";
import { startJobs } from "./jobs";
import { waitForDatabase } from "./db";
import { runMigrations } from "./migrate";
import { bootstrap } from "./bootstrap";
import { ensureLearningContent } from "./learning/import";
import { ensureGrammarContent } from "./learning/grammar/import";
import { configureBot, configureMenuButton } from "./bot/bot";
import { bot } from "./bot/client";
import { registerNotificationListeners } from "./notifications/listeners";
import { startNotificationWorker } from "./notifications/queue";
import { startStudentScheduler } from "./notifications/scheduler";

async function main() {
  const app = express();
  app.use(express.json());

  // Request logging (compact) for API calls.
  app.use((req, _res, next) => {
    if (req.path.startsWith("/api")) {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    }
    next();
  });

  app.use("/api", api);
  app.use("/api", errorHandler);

  // Serve the built Mini App in production.
  if (env.isProd) {
    const clientDir = path.resolve(import.meta.dirname, "../public");
    if (fs.existsSync(clientDir)) {
      app.use(express.static(clientDir));
      app.get("*", (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
    }
  }

  // Wait for the database (Railway's private network can lag a few seconds
  // after deploy), then create/upgrade the schema and ensure settings + first
  // CEO exist. This makes a fresh deploy self-provisioning: set the env vars
  // and it just works — no manual `db:push` / `seed` step required.
  await waitForDatabase();
  await runMigrations();
  const boot = await bootstrap();
  if (boot.ceoCreated)
    console.log(
      `Seeded first CEO (${env.seedCeoUsername ? `login "${env.seedCeoUsername}"` : `Telegram ID ${env.seedCeoTelegramId}`}).`,
    );
  else console.log(`• CEO seed skipped: ${boot.ceoSkipped}.`);

  // Learning content (vocabulary): imported once, re-synced only when the
  // bundled content version changes. Never blocks the CRM from starting.
  try {
    for (const imp of await ensureLearningContent()) {
      console.log(
        `[learning] vocabulary "${imp.slug}" imported: ${imp.items} words / ${imp.stages} stages (+${imp.inserted}, ~${imp.updated}).`,
      );
    }
  } catch (err) {
    console.error("[learning] vocabulary import failed:", (err as Error).message);
  }
  // Grammar topics: same rule (new topics arrive as drafts; staff edits kept).
  try {
    const g = await ensureGrammarContent();
    if (g) {
      console.log(
        `[learning] grammar synced: ${g.topics} topics (+${g.topicsInserted} new), items +${g.itemsInserted} ~${g.itemsUpdated} -${g.itemsDeactivated}.`,
      );
    }
  } catch (err) {
    console.error("[learning] grammar import failed:", (err as Error).message);
  }

  startJobs();

  // Student notification engine: event → notification wiring, the Telegram
  // delivery queue (retries/backoff), and time-based reminders.
  registerNotificationListeners();
  startNotificationWorker();
  startStudentScheduler();

  // Run the companion bot in-process via long polling when a token is present,
  // so a single deployed service handles both the API and the bot. Set
  // RUN_BOT_IN_PROCESS=0 if you run `npm run bot` as a separate process (only
  // one long-polling consumer may be active per bot). A bad/expired token must
  // never take down the finance API, so bot startup is fully isolated.
  if (bot && env.runBotInProcess) {
    try {
      configureBot();
      void configureMenuButton().catch(() => undefined);
      bot.start().catch((err) => {
        console.error("[bot] failed to start (API keeps running):", (err as Error).message);
      });
      console.log("Bot started (long polling).");
    } catch (err) {
      console.error("[bot] startup error (API keeps running):", (err as Error).message);
    }
  }

  app.listen(env.port, () => {
    console.log(`Flex Academy Finances API v2.0.0 listening on :${env.port}`);
    if (env.devAuthBypass) {
      console.warn(`WARNING: DEV_AUTH_BYPASS enabled — authenticating as ${env.devTelegramId}`);
    }
  });
}

// A rejected promise somewhere in the app (e.g. a dropped bot connection)
// should be logged, not crash the whole service.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
