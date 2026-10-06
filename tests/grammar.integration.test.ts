/**
 * End-to-end tests of grammar "sentence building" against a REAL Postgres
 * (PGlite) and the real Express routes: idempotent import that keeps staff
 * edits, strict topic order, bubble rounds (re-queue, resume, XP), the gate
 * test (pass unlocks, fail → review round), learner isolation, and the staff
 * routes' validation + authorisation. Uses its own small fixture topics.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { GrammarTopicContent } from "@shared/grammar/types";
import { sentenceWords } from "@shared/grammar/grade";

const BOT_TOKEN = "123456:TEST-TOKEN";

vi.mock("../server/bot/client", async () => ({
  bot: { api: { sendMessage: async () => ({ message_id: 1 }), setChatMenuButton: async () => true, getMe: async () => ({ username: "t" }) } },
  sendMessage: async () => undefined,
  getChatTitle: async () => null,
  botUsername: async () => "flex_test_bot",
}));

function initData(userId: number): string {
  const p = new URLSearchParams();
  p.set("auth_date", String(Math.floor(Date.now() / 1000)));
  p.set("query_id", "AAE");
  p.set("user", JSON.stringify({ id: userId, first_name: "T", language_code: "en" }));
  const dcs = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  p.set("hash", createHmac("sha256", secret).update(dcs).digest("hex"));
  return p.toString();
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let server: Server;
let base = "";
let pgServer: { stop(): Promise<void> };
let pgDb: { close(): Promise<void> };
const S = {} as { ceo: string; teacher1: string; teacher2: string; classA: string; classB: string; alice: string; bob: string };
let M: {
  db: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  schema: typeof import("@shared/schema");
  imp: typeof import("../server/learning/grammar/import");
  eq: typeof import("drizzle-orm").eq;
  and: typeof import("drizzle-orm").and;
};

async function call(path: string, opts: { method?: string; body?: unknown; auth?: string } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(opts.auth ? { Authorization: opts.auth } : {}) },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: Json = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}
const ALICE = `tma ${initData(7001)}`;
const BOB = `tma ${initData(7002)}`;
const G = "/api/student/learn/grammar";

/* ───────────── fixture content ───────────── */

const NOUNS = ["doctor", "teacher", "student", "driver", "farmer", "singer", "dancer", "builder", "painter", "writer", "player", "baker"];
function topic(slug: string, position: number, opts: { build?: number; uzSuffix?: string } = {}): GrammarTopicContent {
  return {
    slug,
    level: "A1",
    position,
    title: { en: `Topic ${position}`, uz: `Mavzu ${position}` },
    explanation: { uz: "Qoida.", pattern: "I + am", examples: [{ en: "I am here.", uz: "Men shu yerdaman." }, { en: "She is here.", uz: "U shu yerda." }] },
    build: Array.from({ length: opts.build ?? 3 }, (_, i) => ({
      uz: `U ${NOUNS[i]}${opts.uzSuffix ?? ""}.`,
      en: `She is a ${NOUNS[i]}.`,
      traps: ["are"],
    })),
    test: NOUNS.map((n) => ({ uz: `Ular ${n}lar.`, en: `They are ${n}s.`, traps: ["is"] })),
  };
}
const FIXTURE = [topic("fx-one", 1), topic("fx-two", 2), topic("fx-three", 3)];

/** The stored session (answer key) — the client never sees it. */
async function sessionRow(id: string) {
  const [s] = await M.db.select().from(M.schema.grammarSessions).where(M.eq(M.schema.grammarSessions.id, id));
  return s;
}
async function topicId(slug: string): Promise<string> {
  const [t] = await M.db.select().from(M.schema.grammarTopics).where(M.eq(M.schema.grammarTopics.slug, slug));
  return t.id;
}
async function activity(studentId: string) {
  const rows = await M.db.select().from(M.schema.learnerDailyActivity).where(M.eq(M.schema.learnerDailyActivity.studentId, studentId));
  return rows.reduce(
    (a: Json, r: Json) => ({ xp: a.xp + r.xp, exercises: a.exercises + r.exercisesAnswered, correct: a.correct + r.correct }),
    { xp: 0, exercises: 0, correct: 0 },
  );
}

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const pg = await PGlite.create();
  const port = 55000 + Math.floor(Math.random() * 5000);
  const sock = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1", maxConnections: 20 });
  await sock.start();
  pgServer = sock;
  pgDb = pg;
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  process.env.SESSION_SECRET = "test-secret";
  process.env.WEB_APP_URL = "https://app.example.test";

  const { runMigrations } = await import("../server/migrate");
  await runMigrations();
  const storage = await import("../server/storage");
  const { signToken } = await import("../server/auth/token");
  const { db } = await import("../server/db");
  const schema = await import("@shared/schema");
  const imp = await import("../server/learning/grammar/import");
  const { eq, and } = await import("drizzle-orm");
  M = { db, schema, imp, eq, and };

  await storage.ensureSettings({ gracePeriodDays: 5, currency: "UZS" });
  const ceo = await storage.createUser({ telegramId: 2001, fullName: "Boss CEO", role: "ceo" });
  const t1 = await storage.createUser({ telegramId: 2003, fullName: "Madina Teacher", role: "teacher" });
  const t2 = await storage.createUser({ telegramId: 2004, fullName: "Aziz Teacher", role: "teacher" });
  const teacher1 = await storage.getTeacherByUserId(t1.id);
  const teacher2 = await storage.getTeacherByUserId(t2.id);
  const clsA = await storage.createClass({ name: "English A1", teacherId: teacher1!.id, branchId: schema.DEFAULT_BRANCH_ID, defaultFee: 500000 });
  const clsB = await storage.createClass({ name: "English B", teacherId: teacher2!.id, branchId: schema.DEFAULT_BRANCH_ID, defaultFee: 500000 });
  await db.update(schema.classes).set({ learningLevel: "A1" }).where(eq(schema.classes.id, clsA.id));
  const alice = await storage.createStudent({ fullName: "Rahimova Alice", phone: "+998901112233", classId: clsA.id, branchId: clsA.branchId, enrolledAt: "2026-01-10" });
  const bob = await storage.createStudent({ fullName: "Karimov Bob", phone: "+998904445566", classId: clsA.id, branchId: clsA.branchId, enrolledAt: "2026-01-10" });
  await db.insert(schema.studentTelegramAccounts).values([
    { studentId: alice.id, telegramUserId: 7001, verificationMethod: "phone", languageCode: "en" },
    { studentId: bob.id, telegramUserId: 7002, verificationMethod: "code", languageCode: "uz" },
  ]);
  Object.assign(S, {
    ceo: `Bearer ${signToken(ceo.id)}`,
    teacher1: `Bearer ${signToken(t1.id)}`,
    teacher2: `Bearer ${signToken(t2.id)}`,
    classA: clsA.id,
    classB: clsB.id,
    alice: alice.id,
    bob: bob.id,
  });

  const express = (await import("express")).default;
  const api = (await import("../server/routes")).default;
  const { errorHandler } = await import("../server/routes/helpers");
  const app = express();
  app.use(express.json());
  app.use("/api", api);
  app.use("/api", errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);

afterAll(async () => {
  server?.close();
  await new Promise((r) => setTimeout(r, 600));
  const { pool } = await import("../server/db");
  await pool.end().catch(() => undefined);
  await pgServer?.stop().catch(() => undefined);
  await pgDb?.close().catch(() => undefined);
});

describe("grammar import", () => {
  it("inserts new topics as drafts", async () => {
    const r = await M.imp.importGrammarTopics(FIXTURE, 1);
    expect(r).toMatchObject({ topicsInserted: 3, itemsInserted: 3 * (3 + 12), itemsUpdated: 0 });
    const topics = await M.db.select().from(M.schema.grammarTopics);
    expect(topics.map((t: Json) => t.status)).toEqual(["draft", "draft", "draft"]);
  });

  it("is idempotent, and the boot hook only re-runs when the version is bumped", async () => {
    const r = await M.imp.importGrammarTopics(FIXTURE, 1);
    expect(r).toMatchObject({ topicsInserted: 0, itemsInserted: 0, itemsUpdated: 45, itemsDeactivated: 0 });
    expect(await M.db.select().from(M.schema.grammarItems)).toHaveLength(45);
    expect(await M.imp.ensureGrammarContent(FIXTURE, 1)).toBeNull();
    expect(await M.imp.ensureGrammarContent(FIXTURE, 2)).not.toBeNull();
  });

  it("keeps staff edits and topic status; drops removed items to inactive", async () => {
    const id = await topicId("fx-three");
    // Staff publish + edit one sentence through the real routes.
    expect((await call(`/api/learning/grammar/topics/${id}`, { method: "PATCH", auth: S.ceo, body: { status: "published" } })).status).toBe(200);
    const detail = (await call(`/api/learning/grammar/topics/${id}`, { auth: S.ceo })).body;
    const first = detail.items.find((i: Json) => i.kind === "build" && i.position === 1);
    const p = await call(`/api/learning/grammar/items/${first.id}`, { method: "PATCH", auth: S.ceo, body: { uz: "U shifokor (tahrir)." } });
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ uz: "U shifokor (tahrir).", edited: true });

    // Content changes: uz of every build item, and one build item removed.
    const changed = [FIXTURE[0], FIXTURE[1], topic("fx-three", 3, { build: 2, uzSuffix: " (yangi)" })];
    const r = await M.imp.importGrammarTopics(changed, 3);
    expect(r.itemsDeactivated).toBe(1);
    const after = (await call(`/api/learning/grammar/topics/${id}`, { auth: S.ceo })).body;
    expect(after.status).toBe("published");
    expect(after.editedCount).toBe(1);
    expect(after.buildCount).toBe(2);
    const b = after.items.filter((i: Json) => i.kind === "build");
    expect(b[0].uz).toBe("U shifokor (tahrir).");
    expect(b[1].uz).toBe("U teacher (yangi).");
    expect(b[2].active).toBe(false);

    // Back to draft for the student tests below.
    await call(`/api/learning/grammar/topics/${id}`, { method: "PATCH", auth: S.ceo, body: { status: "draft" } });
  });
});

describe("student grammar flow", () => {
  let buildSession = "";

  it("shows nothing while every topic is a draft", async () => {
    const r = await call(`${G}/topics`, { auth: ALICE });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ level: null, topics: [] });
    expect((await call(`${G}/topics/fx-one`, { auth: ALICE })).status).toBe(404);
  });

  it("opens published topics strictly in order", async () => {
    for (const slug of ["fx-one", "fx-two"]) {
      const r = await call(`/api/learning/grammar/topics/${await topicId(slug)}`, { method: "PATCH", auth: S.ceo, body: { status: "published" } });
      expect(r.body.status).toBe("published");
    }
    const r = await call(`${G}/topics`, { auth: ALICE });
    expect(r.body.level).toBe("A1");
    expect(r.body.topics.map((t: Json) => [t.slug, t.status, t.buildTotal])).toEqual([
      ["fx-one", "open", 3],
      ["fx-two", "locked", 3],
    ]);
    const d = await call(`${G}/topics/fx-one`, { auth: ALICE });
    expect(d.body).toMatchObject({ canTest: false, attempts: 0, bestScore: null, reviewPending: 0 });
    expect(d.body.explanation.pattern).toBe("I + am");
    expect((await call(`${G}/topics/fx-two/build`, { method: "POST", auth: ALICE })).body.error).toBe("locked");
    expect((await call(`${G}/topics/fx-two/build`, { method: "POST", auth: ALICE })).status).toBe(403);
    expect((await call(`${G}/topics/fx-two/test`, { method: "POST", auth: ALICE })).status).toBe(409);
  });

  it("build round: no answer key sent; wrong item stays; resume keeps the same bubbles", async () => {
    const r = await call(`${G}/topics/fx-one/build`, { method: "POST", auth: ALICE });
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe("build");
    expect(r.body.items).toHaveLength(3);
    expect(JSON.stringify(r.body)).not.toContain("She is a doctor");
    expect([...r.body.items[0].bubbles].sort()).toEqual(["a", "are", "doctor", "is", "she"]);
    buildSession = r.body.sessionId;

    const wrong = await call(`${G}/build/${buildSession}/answer`, { method: "POST", auth: ALICE, body: { index: 0, tokens: ["she", "are", "a", "doctor"] } });
    expect(wrong.body).toEqual({ correct: false, expected: "She is a doctor.", roundDone: false, xp: 0 });

    const again = await call(`${G}/topics/fx-one/build`, { method: "POST", auth: ALICE });
    expect(again.body.sessionId).toBe(buildSession);
    expect(again.body.items).toEqual(r.body.items);

    const ok = await call(`${G}/build/${buildSession}/answer`, { method: "POST", auth: ALICE, body: { index: 0, tokens: ["she", "is", "a", "doctor"] } });
    expect(ok.body).toMatchObject({ correct: true, roundDone: false, xp: 5 });
    expect((await call(`${G}/build/${buildSession}/answer`, { method: "POST", auth: ALICE, body: { index: 0, tokens: ["she", "is", "a", "doctor"] } })).status).toBe(409);
    const resumed = await call(`${G}/topics/fx-one/build`, { method: "POST", auth: ALICE });
    expect(resumed.body.items.map((i: Json) => i.index)).toEqual([1, 2]);
  });

  it("test is blocked until every build item is built", async () => {
    const r = await call(`${G}/topics/fx-one/test`, { method: "POST", auth: ALICE });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("build_first");
  });

  it("another learner's session is a plain 404", async () => {
    const r = await call(`${G}/build/${buildSession}/answer`, { method: "POST", auth: BOB, body: { index: 1, tokens: ["she", "is", "a", "teacher"] } });
    expect(r.status).toBe(404);
  });

  it("finishing the round marks items built and records XP in daily activity", async () => {
    const s = await sessionRow(buildSession);
    for (const i of [1, 2]) {
      const r = await call(`${G}/build/${buildSession}/answer`, { method: "POST", auth: ALICE, body: { index: i, tokens: sentenceWords(s.items[i].en) } });
      expect(r.body.correct).toBe(true);
      expect(r.body.roundDone).toBe(i === 2);
    }
    expect(await activity(S.alice)).toEqual({ xp: 15, exercises: 4, correct: 3 });
    const d = await call(`${G}/topics/fx-one`, { auth: ALICE });
    expect(d.body).toMatchObject({ buildDone: 3, buildTotal: 3, canTest: true });
    const none = await call(`${G}/topics/fx-one/build`, { method: "POST", auth: ALICE });
    expect(none.body.items).toEqual([]);
  });

  it("failed test (7.5/10, typo = half) → review round first → then a new test", async () => {
    const t = await call(`${G}/topics/fx-one/test`, { method: "POST", auth: ALICE });
    expect(t.status).toBe(200);
    expect(t.body.items).toHaveLength(10);
    expect(JSON.stringify(t.body)).not.toContain("They are");
    const s = await sessionRow(t.body.sessionId);
    const answers = s.items.map((it: Json, i: number) =>
      i < 7 ? it.en : i === 7 ? it.en.replace(/(\w+)s\.$/, (_m: string, w: string) => `${w.slice(0, -1)}x${w.slice(-1)}s.`) : "They is wrong.",
    );
    expect((await call(`${G}/test/${t.body.sessionId}/finish`, { method: "POST", auth: BOB, body: { answers } })).status).toBe(404);
    const f = await call(`${G}/test/${t.body.sessionId}/finish`, { method: "POST", auth: ALICE, body: { answers } });
    expect(f.status).toBe(200);
    expect(f.body.items[7].score).toBe(0.5);
    expect(f.body).toMatchObject({ score: 7.5, passed: false, unlocked: null });
    expect((await call(`${G}/test/${t.body.sessionId}/finish`, { method: "POST", auth: ALICE, body: { answers } })).status).toBe(409);

    const d = await call(`${G}/topics/fx-one`, { auth: ALICE });
    expect(d.body).toMatchObject({ reviewPending: 3, canTest: false, attempts: 1, bestScore: 7.5, status: "open" });
    expect((await call(`${G}/topics/fx-one/test`, { method: "POST", auth: ALICE })).body.error).toBe("review_first");

    const rv = await call(`${G}/topics/fx-one/build`, { method: "POST", auth: ALICE });
    expect(rv.body.mode).toBe("review");
    expect(rv.body.items).toHaveLength(3);
    const rs = await sessionRow(rv.body.sessionId);
    expect(rs.items.map((i: Json) => i.itemId).sort()).toEqual(s.items.slice(7).map((i: Json) => i.itemId).sort());
    for (const it of rv.body.items) {
      const r = await call(`${G}/build/${rv.body.sessionId}/answer`, { method: "POST", auth: ALICE, body: { index: it.index, tokens: sentenceWords(rs.items[it.index].en) } });
      expect(r.body).toMatchObject({ correct: true, xp: 5 });
    }
    expect((await call(`${G}/topics/fx-one`, { auth: ALICE })).body).toMatchObject({ reviewPending: 0, canTest: true });
  });

  it("passing (8/10) marks the topic passed and unlocks the next one", async () => {
    const t = await call(`${G}/topics/fx-one/test`, { method: "POST", auth: ALICE });
    const s = await sessionRow(t.body.sessionId);
    const answers = s.items.map((it: Json, i: number) => (i < 8 ? it.en.toLowerCase().replace(".", "") : ""));
    const f = await call(`${G}/test/${t.body.sessionId}/finish`, { method: "POST", auth: ALICE, body: { answers } });
    expect(f.body).toMatchObject({ score: 8, passed: true, unlocked: "fx-two", xp: 8 * 3 + 50 });
    const list = await call(`${G}/topics`, { auth: ALICE });
    expect(list.body.topics.map((x: Json) => [x.slug, x.status, x.bestScore, x.reviewPending])).toEqual([
      ["fx-one", "passed", 8, 0],
      ["fx-two", "open", null, 0],
    ]);
    // Bob's progress is his own.
    expect((await call(`${G}/topics`, { auth: BOB })).body.topics.map((x: Json) => x.status)).toEqual(["open", "locked"]);
  });
});

describe("staff grammar routes", () => {
  it("only manage_learning may list / edit content", async () => {
    expect((await call("/api/learning/grammar/topics", { auth: S.teacher1 })).status).toBe(403);
    const list = await call("/api/learning/grammar/topics", { auth: S.ceo });
    expect(list.status).toBe(200);
    expect(list.body.map((t: Json) => t.slug)).toEqual(["fx-one", "fx-two", "fx-three"]);
    expect(list.body[0]).toMatchObject({ buildCount: 3, testCount: 12, status: "published" });
  });

  it("rejects an edit with an invalid trap", async () => {
    const d = (await call(`/api/learning/grammar/topics/${await topicId("fx-two")}`, { auth: S.ceo })).body;
    const item = d.items[0];
    expect((await call(`/api/learning/grammar/items/${item.id}`, { method: "PATCH", auth: S.teacher1, body: { traps: ["was"] } })).status).toBe(403);
    const bad = await call(`/api/learning/grammar/items/${item.id}`, { method: "PATCH", auth: S.ceo, body: { traps: ["is"] } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("invalid");
    expect(bad.body.problems.join(" ")).toMatch(/trap "is"/);
    const dup = await call(`/api/learning/grammar/items/${item.id}`, { method: "PATCH", auth: S.ceo, body: { en: "She is a teacher." } });
    expect(dup.status).toBe(400);
    expect(dup.body.problems.join(" ")).toMatch(/duplicate/);
    const ok = await call(`/api/learning/grammar/items/${item.id}`, { method: "PATCH", auth: S.ceo, body: { traps: ["was"] } });
    expect(ok.status).toBe(200);
    expect(ok.body.traps).toEqual(["was"]);
  });

  it("class progress: own teacher and management yes, another group's teacher 403", async () => {
    expect((await call(`/api/learning/grammar/class/${S.classA}`, { auth: S.teacher2 })).status).toBe(403);
    const r = await call(`/api/learning/grammar/class/${S.classA}`, { auth: S.teacher1 });
    expect(r.status).toBe(200);
    expect(r.body.level).toBe("A1");
    expect(r.body.topics.map((t: Json) => t.slug)).toEqual(["fx-one", "fx-two"]);
    const alice = r.body.students.find((s: Json) => s.studentId === S.alice);
    expect(alice).toMatchObject({ currentTopic: "fx-two", passedCount: 1, best: { "fx-one": 8, "fx-two": null }, reviewPending: false });
    expect(alice.lastActiveAt).toBeTruthy();
    const bob = r.body.students.find((s: Json) => s.studentId === S.bob);
    expect(bob).toMatchObject({ currentTopic: "fx-one", passedCount: 0, lastActiveAt: null });
    expect((await call(`/api/learning/grammar/class/${S.classA}`, { auth: S.ceo })).status).toBe(200);
  });
});
