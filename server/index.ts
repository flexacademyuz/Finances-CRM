import express from "express";
import path from "node:path";
import fs from "node:fs";
import { env } from "./env";
import api from "./routes";
import { errorHandler } from "./routes/helpers";
import { ensureSettings } from "./storage";
import { startJobs } from "./jobs";
import { configureBot, configureMenuButton } from "./bot/bot";
import { bot } from "./bot/client";

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

  // Ensure settings row + start background jobs.
  await ensureSettings({
    gracePeriodDays: env.defaultGracePeriodDays,
    currency: env.defaultCurrency,
  });
  startJobs();

  // Run the bot in-process via long polling when a token is present. For
  // production webhook setups, run `npm run bot` separately instead.
  if (bot && !env.isProd) {
    configureBot();
    void configureMenuButton();
    void bot.start();
    console.log("🤖 Bot started (long polling, dev).");
  }

  app.listen(env.port, () => {
    console.log(`🚀 Flex Academy Finances API listening on :${env.port}`);
    if (env.devAuthBypass) {
      console.warn(`⚠️  DEV_AUTH_BYPASS enabled — authenticating as ${env.devTelegramId}`);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
