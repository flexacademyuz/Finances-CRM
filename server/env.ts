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
  // Secret for signing web session tokens (browser login, outside Telegram).
  // Falls back to the bot token, then a dev-only constant.
  sessionSecret: optional("SESSION_SECRET", process.env.TELEGRAM_BOT_TOKEN || "flex-insecure-dev-secret"),
  // How long a web session token stays valid, in days.
  sessionTtlDays: Number(optional("SESSION_TTL_DAYS", "30")),
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
  // Website login for the first CEO (so a browser-only deployment can bootstrap).
  seedCeoUsername: process.env.SEED_CEO_USERNAME || "",
  seedCeoPassword: process.env.SEED_CEO_PASSWORD || "",

  defaultGracePeriodDays: Number(optional("DEFAULT_GRACE_PERIOD_DAYS", "5")),
  defaultCurrency: optional("DEFAULT_CURRENCY", "UZS"),

  // ─── Parent SMS (Eskiz.uz) ──────────────────────────────────────────────
  // Master switch. Off by default: nothing is sent, and no SMS row is written,
  // until this is "1". Flip on only after the Eskiz contract + templates exist.
  smsEnabled: optional("SMS_ENABLED", "0") === "1",
  // Log-only / dry run. When "1" (the default even after enabling), every
  // message is RECORDED in sms_messages with status "logged" but the provider is
  // never called — so real traffic can be reviewed before spending on live SMS.
  // Set to "0" to actually deliver.
  smsDryRun: optional("SMS_DRY_RUN", "1") === "1",
  // Note: the per-scenario toggles (receipt / overdue on-off) and the overdue-day
  // threshold are now CEO-editable in-app (settings table), not env vars.
  // Name shown to parents in the message body / as the branded sender context.
  smsAcademyName: optional("SMS_ACADEMY_NAME", "Flex Academy"),

  // Eskiz gateway credentials + endpoint. Supplied once the contract is signed.
  eskizEmail: process.env.ESKIZ_EMAIL ?? "",
  eskizPassword: process.env.ESKIZ_PASSWORD ?? "",
  eskizBaseUrl: optional("ESKIZ_BASE_URL", "https://notify.eskiz.uz/api"),
  // Approved alphanumeric sender, or the shared test sender "4546" for sandbox.
  eskizSender: optional("ESKIZ_SENDER", "4546"),
};

if (env.devAuthBypass && env.isProd) {
  throw new Error("DEV_AUTH_BYPASS must never be enabled in production.");
}
