# Flex Academy — Financial Telegram Mini-App

A Telegram Mini-App for managing the finances of Flex Academy: student
payments, teacher salaries, class enrollment, and automatic "Awaiting Payment"
flagging. Role-based (CEO / Accountant / Teacher), authenticated through
Telegram, bilingual (English + Uzbek).

See [`SPEC.md`](SPEC.md) for the full product specification.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + TypeScript + Vite, Telegram WebApp SDK, Tailwind |
| Backend | Node.js + Express (REST), TypeScript ESM |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Telegram `initData` HMAC verification |
| Bot | grammY companion bot |

```
shared/    Drizzle schema, enums, zod validators, date helpers (shared client+server)
server/    Express API, Telegram auth, storage layer, billing/salary services, bot
client/    React Mini App (role-based screens)
tests/     Vitest unit tests (billing transitions, salary rules, payment/auth)
```

## Prerequisites

- Node.js 20+
- A PostgreSQL database
- A Telegram bot (create one with [@BotFather](https://t.me/BotFather))

## Setup

### 1. Install & configure

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | What it is |
|----------|------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather (used for the bot **and** to verify Mini-App `initData`) |
| `WEB_APP_URL` | Public HTTPS URL where the Mini App is hosted |
| `INIT_DATA_MAX_AGE_SECONDS` | Max age of an accepted `initData` payload (default 86400) |
| `DEFAULT_GRACE_PERIOD_DAYS` | Days before an unpaid student becomes Overdue (default 5, CEO-configurable in-app) |
| `DEFAULT_CURRENCY` | Stored currency (default `UZS`) |
| `SEED_CEO_TELEGRAM_ID` | Telegram ID of the first CEO (for the seed script) |
| `DEV_AUTH_BYPASS` / `DEV_TELEGRAM_ID` | Local-only: skip `initData` verification and act as a given Telegram ID. **Never enable in production.** |

### 2. Database schema + first CEO — automatic on startup

**You normally don't need to run anything by hand.** On boot the server:
1. applies the SQL migrations in [`drizzle/`](drizzle/) (creating all tables), and
2. creates the first CEO from `SEED_CEO_TELEGRAM_ID` if that user doesn't exist.

So a fresh deploy is self-provisioning: set the environment variables and start
it. To find your Telegram ID, message [@userinfobot](https://t.me/userinfobot)
(or your bot with `/whoami` once it's running) and put it in
`SEED_CEO_TELEGRAM_ID`. From then on the CEO invites everyone else in-app.

If you prefer to do it explicitly (or run it locally before starting), you can:

```bash
npm run db:push   # push schema directly (dev convenience), OR
npm run seed      # apply migrations + create the first CEO
```

### 4. Configure the bot in BotFather

1. **Set the Mini App URL:** in @BotFather → your bot → *Bot Settings → Menu
   Button → Configure menu button* → paste your `WEB_APP_URL`. (The bot also sets
   this automatically on startup.)
2. Optionally register `/start` and `/whoami` via *Edit Commands*.
3. Ensure your host serves the app over **HTTPS** — Telegram requires it.

## Running

### Development

```bash
npm run dev          # API on :5000 (+ bot via long polling if token set)
npm run dev:client   # Vite dev server for the Mini App (proxies /api to :5000)
```

Open the Vite URL in a browser with `DEV_AUTH_BYPASS=1` + `DEV_TELEGRAM_ID=<your
seeded CEO id>` to work without Telegram, or open the Mini App from your bot.

### Production

```bash
npm run build        # builds client → dist/public and server → dist/server
npm run start        # serves the API + static Mini App on $PORT
```

The single Node process serves both the REST API (`/api/*`) and the built Mini
App. Run the bot in-process (dev) or separately in production:

```bash
npm run bot          # standalone bot (long polling)
```

For a webhook-based bot or multi-instance deployment, run the bot separately and
move the scheduled jobs (see `server/jobs.ts`) to an external cron hitting
`POST /api/billing/recompute`.

### Deployment (Railway / Render / VPS)

1. Provision a PostgreSQL instance and set `DATABASE_URL`.
2. Set all `.env` variables in the host's environment.
3. Build command: `npm run build` · Start command: `npm run start`.
4. Ensure the public URL is HTTPS and matches `WEB_APP_URL`.
5. That's it — the server migrates the schema and seeds the first CEO on boot.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | API + bot (dev, hot reload) |
| `npm run dev:client` | Vite dev server for the client |
| `npm run build` | Production build (client + server) |
| `npm run start` | Run the production server |
| `npm run bot` | Standalone bot runner |
| `npm run seed` | Create the first CEO + settings |
| `npm run db:push` | Push Drizzle schema to Postgres |
| `npm run check` | TypeScript type-check |
| `npm test` | Run the Vitest suite |

## Testing

```bash
npm test
```

Covers the monthly status-transition logic (`decideStatus`), teacher salary
rules (`applySalaryRule`), the payment-recording input contract, and Telegram
`initData` verification (valid / tampered / wrong-token / expired).

## Security notes

- Every `/api/*` request (except `/api/health`) requires a valid, unexpired,
  HMAC-verified Telegram `initData`; unknown Telegram users get `403`.
- Role checks are enforced server-side on every mutating route.
- Payments are never hard-deleted — corrections are CEO-only, soft-void or edit
  with a reason and a JSON audit trail.
