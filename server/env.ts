import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(optional("PORT", "5000")),
  isProd: process.env.NODE_ENV === "production",

  botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  webAppUrl: optional("WEB_APP_URL", ""),
  // Run the bot inside the API process (default). Disable if you run the bot
  // as a separate service to avoid two long-polling consumers.
  runBotInProcess: optional("RUN_BOT_IN_PROCESS", "1") !== "0",

  initDataMaxAgeSeconds: Number(optional("INIT_DATA_MAX_AGE_SECONDS", "86400")),
  devAuthBypass: optional("DEV_AUTH_BYPASS", "0") === "1",
  devTelegramId: process.env.DEV_TELEGRAM_ID
    ? Number(process.env.DEV_TELEGRAM_ID)
    : undefined,

  seedCeoTelegramId: process.env.SEED_CEO_TELEGRAM_ID
    ? Number(process.env.SEED_CEO_TELEGRAM_ID)
    : undefined,
  seedCeoName: optional("SEED_CEO_NAME", "Flex Academy CEO"),

  defaultGracePeriodDays: Number(optional("DEFAULT_GRACE_PERIOD_DAYS", "5")),
  defaultCurrency: optional("DEFAULT_CURRENCY", "UZS"),
};

if (env.devAuthBypass && env.isProd) {
  throw new Error("DEV_AUTH_BYPASS must never be enabled in production.");
}
