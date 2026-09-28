/**
 * End-to-end tests of the learning platform against a REAL Postgres (PGlite)
 * and the real Express routes: idempotent vocabulary import, flashcards,
 * bookmarks, exercise sessions, stats, staff content management / analytics —
 * and above all that one learner can never reach another learner's data.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

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
const S = {} as {
  ceo: string;
  teacher1: string;
  teacher2: string;
  classA: string;
  classB: string;
  alice: string;
  alice2: string;
  bob: string;
  carol: string;
};
// Lazily-imported modules (after env is set).
let M: {
  db: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  schema: typeof import("@shared/schema");
  importBeginner900: typeof import("../server/learning/import").importBeginner900;
  eq: typeof import("drizzle-orm").eq;
};

async function call(path: string, opts: { method?: string; body?: unknown; auth?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(opts.auth ? { Authorization: opts.auth } : {}), ...(opts.headers ?? {}) },
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
const asStudent = (tgId: number) => `tma ${initData(tgId)}`;
const ALICE = asStudent(5001);
const BOB = asStudent(5002);

/** The stored answer key for a session question (the client never sees it). */
async function keyOf(sessionId: string, index: number): Promise<Json> {
  const [s] = await M.db.select().from(M.schema.learningSessions).where(M.eq(M.schema.learningSessions.id, sessionId));
  return (s.questions as Json[])[index];
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
  const { importBeginner900 } = await import("../server/learning/import");
  const { eq } = await import("drizzle-orm");
  M = { db, schema, importBeginner900, eq };

  await storage.ensureSettings({ gracePeriodDays: 5, currency: "UZS" });
  const ceo = await storage.createUser({ telegramId: 1001, fullName: "Boss CEO", role: "ceo" });
  const t1 = await storage.createUser({ telegramId: 1003, fullName: "Madina Teacher", role: "teacher" });
  const t2 = await storage.createUser({ telegramId: 1004, fullName: "Aziz Teacher", role: "teacher" });
  const teacher1 = await storage.getTeacherByUserId(t1.id);
  const teacher2 = await storage.getTeacherByUserId(t2.id);
  const clsA = await storage.createClass({ name: "English A1", teacherId: teacher1!.id, branchId: schema.DEFAULT_BRANCH_ID, defaultFee: 500000 });
  const clsB = await storage.createClass({ name: "Math", teacherId: teacher2!.id, branchId: schema.DEFAULT_BRANCH_ID, defaultFee: 500000 });
  const alice = await storage.createStudent({ fullName: "Rahimova Alice", phone: "+998901112233", classId: clsA.id, branchId: clsA.branchId, enrolledAt: "2026-01-10" });
  const bob = await storage.createStudent({ fullName: "Karimov Bob", phone: "+998904445566", classId: clsA.id, branchId: clsA.branchId, enrolledAt: "2026-01-10" });
  const carol = await storage.createStudent({ fullName: "Aliyeva Carol", classId: clsB.id, branchId: clsB.branchId, enrolledAt: "2026-01-10" });
  // Alice also studies Math: a second billing record for the same person.
  const alice2 = await storage.createStudent({ fullName: "Rahimova  Alice", phone: "901112233", classId: clsB.id, branchId: clsB.branchId, enrolledAt: "2026-02-01" });
  await db.insert(schema.studentTelegramAccounts).values([
    { studentId: alice.id, telegramUserId: 5001, verificationMethod: "phone", languageCode: "en" },
    { studentId: alice2.id, telegramUserId: 5001, verificationMethod: "phone", languageCode: "en" },
    { studentId: bob.id, telegramUserId: 5002, verificationMethod: "code", languageCode: "uz" },
  ]);
  Object.assign(S, {
    ceo: `Bearer ${signToken(ceo.id)}`,
    teacher1: `Bearer ${signToken(t1.id)}`,
    teacher2: `Bearer ${signToken(t2.id)}`,
    classA: clsA.id,
    classB: clsB.id,
    alice: alice.id,
    alice2: alice2.id,
    bob: bob.id,
    carol: carol.id,
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

describe("vocabulary import", () => {
  it("imports 896 words into 9 stages", async () => {
    const r = await M.importBeginner900();
    expect(r.inserted).toBe(896);
    expect(r.report.stages).toBe(9);
  });

  it("is idempotent: a second run inserts nothing and duplicates nothing", async () => {
    const r = await M.importBeginner900();
    expect(r.inserted).toBe(0);
    expect(r.updated).toBe(896);
    const items = await M.db.select().from(M.schema.vocabItems);
    const units = await M.db.select().from(M.schema.learningUnits);
    const resources = await M.db.select().from(M.schema.learningResources);
    expect(items).toHaveLength(896);
    expect(units).toHaveLength(9);
    expect(resources).toHaveLength(1);
  });
});

describe("student learning flow", () => {
  let firstCard: Json;

  it("home shows Stage 1 as the current stage and today's plan", async () => {
    const r = await call("/api/student/learn/home", { auth: ALICE });
    expect(r.status).toBe(200);
    expect(r.body.currentStage.position).toBe(1);
    expect(r.body.totals.words).toBe(896);
    expect(r.body.stages).toHaveLength(9);
    expect(r.body.today.newWords).toBe(10);
    expect(r.body.streak).toBe(0);
  });

  it("stage list: 100 words each, last 96", async () => {
    const r = await call("/api/student/learn/stages", { auth: ALICE });
    expect(r.body.stages.map((s: Json) => s.total)).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 96]);
  });

  it("continue-learning deck starts at the first new word of the stage", async () => {
    const stages = (await call("/api/student/learn/stages", { auth: ALICE })).body.stages;
    const r = await call(`/api/student/learn/deck?mode=learn&unit=${stages[0].id}&limit=5`, { auth: ALICE });
    expect(r.status).toBe(200);
    expect(r.body.cards.map((c: Json) => c.word)).toEqual(["I", "you", "we", "he", "she"]);
    firstCard = r.body.cards[0];
    expect(firstCard).toMatchObject({ translation: "men", phonetic: "/aɪ/", status: "new", bookmarked: false });
  });

  it("I KNOW saves progress; I DON'T KNOW marks it for practice", async () => {
    const stages = (await call("/api/student/learn/stages", { auth: ALICE })).body.stages;
    const deck = (await call(`/api/student/learn/deck?mode=learn&unit=${stages[0].id}&limit=3`, { auth: ALICE })).body.cards;
    const know = await call(`/api/student/learn/cards/${deck[0].id}/review`, { method: "POST", auth: ALICE, body: { known: true } });
    expect(know.status).toBe(200);
    expect(know.body.status).toBe("learning");
    expect(know.body.earned).toContain("first_steps");
    const dont = await call(`/api/student/learn/cards/${deck[1].id}/review`, { method: "POST", auth: ALICE, body: { known: false } });
    expect(dont.body.status).toBe("need_practice");

    // Persisted: the stage counts and the "continue" deck moved on.
    const s1 = (await call(`/api/student/learn/stages/${stages[0].id}`, { auth: ALICE })).body.stage;
    expect(s1).toMatchObject({ seen: 2, learning: 1, needPractice: 1, newCount: 98 });
    const next = (await call(`/api/student/learn/deck?mode=learn&unit=${stages[0].id}&limit=3`, { auth: ALICE })).body.cards;
    expect(next[0].word).toBe("we");
    const difficult = (await call("/api/student/learn/deck?mode=difficult", { auth: ALICE })).body.cards;
    expect(difficult.map((c: Json) => c.word)).toEqual(["you"]);
  });

  it("bookmarks: add, list, remove — per learner", async () => {
    const add = await call(`/api/student/learn/bookmarks/${firstCard.id}`, { method: "PUT", auth: ALICE, body: { bookmarked: true } });
    expect(add.body.bookmarked).toBe(true);
    expect((await call("/api/student/learn/bookmarks", { auth: ALICE })).body.cards.map((c: Json) => c.id)).toEqual([firstCard.id]);
    expect((await call("/api/student/learn/bookmarks", { auth: BOB })).body.cards).toEqual([]);
    await call(`/api/student/learn/bookmarks/${firstCard.id}`, { method: "PUT", auth: ALICE, body: { bookmarked: false } });
    expect((await call("/api/student/learn/bookmarks", { auth: ALICE })).body.cards).toEqual([]);
  });

  it("rejects unknown words and bad bodies", async () => {
    const r = await call(`/api/student/learn/cards/00000000-0000-0000-0000-000000000000/review`, { method: "POST", auth: ALICE, body: { known: true } });
    expect(r.status).toBe(404);
    const bad = await call(`/api/student/learn/cards/${firstCard.id}/review`, { method: "POST", auth: ALICE, body: { known: "yes" } });
    expect(bad.status).toBe(400);
  });
});

describe("exercise sessions", () => {
  let sessionId = "";
  let questions: Json[] = [];

  it("builds a stage set server-side without exposing answers", async () => {
    const stages = (await call("/api/student/learn/stages", { auth: ALICE })).body.stages;
    const r = await call("/api/student/learn/sessions", { method: "POST", auth: ALICE, body: { source: "stage", unitId: stages[0].id, count: 8 } });
    expect(r.status).toBe(201);
    sessionId = r.body.id;
    questions = r.body.questions;
    expect(questions).toHaveLength(8);
    for (const q of questions) {
      expect(q.answer).toBeUndefined();
      expect(q.accept).toBeUndefined();
    }
  });

  it("grades answers immediately and records them", async () => {
    const k0 = await keyOf(sessionId, 0);
    const right = await call(`/api/student/learn/sessions/${sessionId}/answer`, {
      method: "POST",
      auth: ALICE,
      body: { index: 0, answer: k0.answer },
    });
    expect(right.status).toBe(200);
    expect(right.body.correct).toBe(true);
    expect(right.body.xp).toBeGreaterThan(0);

    const k1 = await keyOf(sessionId, 1);
    const wrongAnswer = k1.type === "matching" ? [...(k1.answer as number[])].reverse() : typeof k1.answer === "string" ? "zzz" : ((k1.answer as number) + 1) % k1.options.length;
    const wrong = await call(`/api/student/learn/sessions/${sessionId}/answer`, { method: "POST", auth: ALICE, body: { index: 1, answer: wrongAnswer } });
    expect(wrong.body.correct).toBe(false);
    expect(wrong.body.correctAnswer).toEqual(k1.answer);

    const again = await call(`/api/student/learn/sessions/${sessionId}/answer`, { method: "POST", auth: ALICE, body: { index: 0, answer: k0.answer } });
    expect(again.status).toBe(409);
    const out = await call(`/api/student/learn/sessions/${sessionId}/answer`, { method: "POST", auth: ALICE, body: { index: 99, answer: 0 } });
    expect(out.status).toBe(400);
  });

  it("can be resumed and finished; score is saved", async () => {
    const resume = await call(`/api/student/learn/sessions/${sessionId}`, { auth: ALICE });
    expect(resume.body.answered).toBe(2);
    expect(resume.body.questions[0].answered).toBe(true);
    const fin = await call(`/api/student/learn/sessions/${sessionId}/finish`, { method: "POST", auth: ALICE });
    expect(fin.status).toBe(200);
    expect(fin.body).toMatchObject({ answered: 2, correct: 1, accuracy: 50 });
    const late = await call(`/api/student/learn/sessions/${sessionId}/answer`, { method: "POST", auth: ALICE, body: { index: 2, answer: 0 } });
    expect(late.status).toBe(409);
  });

  it("stats reflect everything the learner did", async () => {
    const r = await call("/api/student/learn/stats", { auth: ALICE });
    expect(r.status).toBe(200);
    expect(r.body.sessionsCompleted).toBe(1);
    expect(r.body.exercisesAnswered).toBeGreaterThanOrEqual(2);
    expect(r.body.answers).toBeGreaterThanOrEqual(4);
    expect(r.body.streak).toBe(1);
    expect(r.body.practisedToday).toBe(true);
    expect(r.body.history).toHaveLength(1);
  });

  it("difficult-words practice needs something difficult first", async () => {
    const bob = await call("/api/student/learn/sessions", { method: "POST", auth: BOB, body: { source: "difficult" } });
    expect(bob.status).toBe(409);
    expect(bob.body.error).toBe("nothing_to_practise");
  });
});

describe("isolation between learners (no IDOR)", () => {
  let aliceSession = "";

  it("another learner can't read, answer or finish someone's session", async () => {
    const stages = (await call("/api/student/learn/stages", { auth: ALICE })).body.stages;
    aliceSession = (await call("/api/student/learn/sessions", { method: "POST", auth: ALICE, body: { source: "stage", unitId: stages[0].id } })).body.id;
    expect((await call(`/api/student/learn/sessions/${aliceSession}`, { auth: BOB })).status).toBe(404);
    expect((await call(`/api/student/learn/sessions/${aliceSession}/answer`, { method: "POST", auth: BOB, body: { index: 0, answer: 0 } })).status).toBe(404);
    expect((await call(`/api/student/learn/sessions/${aliceSession}/finish`, { method: "POST", auth: BOB })).status).toBe(404);
    // Alice's session is untouched.
    expect((await call(`/api/student/learn/sessions/${aliceSession}`, { auth: ALICE })).body.answered).toBe(0);
  });

  it("progress, stats and history are the caller's own", async () => {
    const bob = await call("/api/student/learn/stats", { auth: BOB });
    expect(bob.body).toMatchObject({ wordsSeen: 0, answers: 0, sessionsCompleted: 0, streak: 0 });
    expect(bob.body.history).toEqual([]);
    const home = await call("/api/student/learn/home", { auth: BOB });
    expect(home.body.totals.seen).toBe(0);
  });

  it("can't switch into another student's record via X-Student-Id", async () => {
    const r = await call("/api/student/learn/stats", { auth: BOB, headers: { "X-Student-Id": S.alice } });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("profile_not_linked");
  });

  it("unauthenticated and staff tokens can't use the student learning API", async () => {
    expect((await call("/api/student/learn/home")).status).toBe(401);
    expect((await call("/api/student/learn/home", { auth: S.ceo })).status).toBe(401);
  });

  it("staff preview is read-only", async () => {
    const h = { "X-Portal-Student": S.alice };
    const home = await call("/api/student/learn/home", { auth: S.ceo, headers: h });
    expect(home.status).toBe(200);
    expect(home.body.totals.seen).toBeGreaterThan(0);
    const stages = home.body.stages;
    const deck = (await call(`/api/student/learn/deck?unit=${stages[0].id}`, { auth: S.ceo, headers: h })).body.cards;
    const w = await call(`/api/student/learn/cards/${deck[0].id}/review`, { method: "POST", auth: S.ceo, headers: h, body: { known: true } });
    expect(w.status).toBe(403);
    expect(w.body.error).toBe("preview_read_only");
  });

  it("a student in two groups keeps ONE progress (same person, same learner)", async () => {
    const a1 = (await call("/api/student/learn/stats", { auth: ALICE })).body;
    const a2 = (await call("/api/student/learn/stats", { auth: ALICE, headers: { "X-Student-Id": S.alice2 } })).body;
    expect(a2.wordsSeen).toBe(a1.wordsSeen);
    expect(a2.answers).toBe(a1.answers);
  });
});

describe("staff: content management & analytics", () => {
  let item: Json;

  it("only manage_learning (CEO) can manage content", async () => {
    expect((await call("/api/learning/items?limit=5", { auth: S.teacher1 })).status).toBe(403);
    const list = await call("/api/learning/items?q=apple", { auth: S.ceo });
    expect(list.status).toBe(200);
    item = list.body.items.find((i: Json) => i.word === "Apple");
    expect(item).toMatchObject({ translation: "olma", stage: 1 });
    expect((await call(`/api/learning/items/${item.id}`, { method: "PATCH", auth: S.teacher1, body: { translation: "x" } })).status).toBe(403);
  });

  it("edits survive a re-import; examples must mark the word", async () => {
    const bad = await call(`/api/learning/items/${item.id}`, { method: "PATCH", auth: S.ceo, body: { example: "I like apples." } });
    expect(bad.status).toBe(400);
    const ok = await call(`/api/learning/items/${item.id}`, { method: "PATCH", auth: S.ceo, body: { translation: "olma (meva)" } });
    expect(ok.status).toBe(200);
    expect(ok.body.editedFields).toContain("translation");
    await M.importBeginner900();
    const again = await call("/api/learning/items?q=apple", { auth: S.ceo });
    expect(again.body.items.find((i: Json) => i.id === item.id).translation).toBe("olma (meva)");
  });

  it("moves a word between stages, adds and removes words", async () => {
    const units = (await call("/api/learning/units", { auth: S.ceo })).body.units;
    const mv = await call(`/api/learning/items/${item.id}`, { method: "PATCH", auth: S.ceo, body: { unitId: units[1].id } });
    expect(mv.body.unitId).toBe(units[1].id);

    const dup = await call("/api/learning/items", { method: "POST", auth: S.ceo, body: { unitId: units[0].id, word: "Cat", translation: "mushuk" } });
    expect(dup.status).toBe(409);
    const add = await call("/api/learning/items", {
      method: "POST",
      auth: S.ceo,
      body: { unitId: units[0].id, word: "Kitten", translation: "mushukcha", example: "The {kitten} is small." },
    });
    expect(add.status).toBe(201);
    const del = await call(`/api/learning/items/${add.body.id}`, { method: "DELETE", auth: S.ceo });
    expect(del.status).toBe(200);
    const words = (await call(`/api/student/learn/stages/${units[0].id}/words?limit=100`, { auth: BOB })).body.items;
    expect(words.find((w: Json) => w.id === add.body.id)).toBeUndefined();
  });

  it("a teacher sees their own students' progress, not other groups'", async () => {
    const own = await call(`/api/learning/students/${S.alice}`, { auth: S.teacher1 });
    expect(own.status).toBe(200);
    expect(own.body.stats.wordsSeen).toBeGreaterThan(0);
    expect(own.body.difficult.map((d: Json) => d.word)).toContain("you");
    expect((await call(`/api/learning/students/${S.alice}`, { auth: S.teacher2 })).status).toBe(403);
    const group = await call(`/api/learning/classes/${S.classA}`, { auth: S.teacher1 });
    expect(group.status).toBe(200);
    expect(group.body.students.map((s: Json) => s.fullName).sort()).toEqual(["Karimov Bob", "Rahimova Alice"]);
    expect((await call(`/api/learning/classes/${S.classA}`, { auth: S.teacher2 })).status).toBe(403);
  });

  it("CEO overview and settings", async () => {
    const o = await call("/api/learning/overview", { auth: S.ceo });
    expect(o.status).toBe(200);
    expect(o.body.words).toBe(896);
    expect(o.body.learners).toBe(1);
    const res = (await call("/api/learning/resources", { auth: S.ceo })).body[0];
    const s = await call(`/api/learning/resources/${res.id}/settings`, { method: "PATCH", auth: S.ceo, body: { dailyNewWords: 15 } });
    expect(s.body.settings.dailyNewWords).toBe(15);
  });
});

describe("course levels (assigned by group)", () => {
  let a1 = "";
  let a2 = "";

  it("imports the A2 set as a DRAFT, invisible to students", async () => {
    const { VOCAB_SETS, importVocabSet } = await import("../server/learning/import");
    const r = await importVocabSet(VOCAB_SETS[1]);
    expect(r).toMatchObject({ slug: "elementary-a2", inserted: 700, stages: 7 });
    const again = await importVocabSet(VOCAB_SETS[1]);
    expect(again.inserted).toBe(0);
    const sets = (await call("/api/learning/resources", { auth: S.ceo })).body as Json[];
    a1 = sets.find((s) => s.level === "A1")!.id;
    const a2set = sets.find((s) => s.level === "A2")!;
    a2 = a2set.id;
    expect(a2set).toMatchObject({ status: "draft", words: 700, stages: 7 });
    // Group A set to A2, but A2 is a draft → students still get Beginner.
    const patch = await call(`/api/classes/${S.classA}`, { method: "PATCH", auth: S.ceo, body: { learningLevel: "A2" } });
    expect(patch.status).toBe(200);
    expect(patch.body.learningLevel).toBe("A2");
    const home = await call("/api/student/learn/home", { auth: BOB });
    expect(home.body.resource.level).toBe("A1");
  });

  it("rejects an unknown level code", async () => {
    const bad = await call(`/api/classes/${S.classA}`, { method: "PATCH", auth: S.ceo, body: { learningLevel: "Z9" } });
    expect(bad.status).toBe(400);
  });

  it("once published, the group's students study their own level only", async () => {
    expect((await call(`/api/learning/resources/${a2}`, { method: "PATCH", auth: S.teacher1, body: { status: "published" } })).status).toBe(403);
    const pub = await call(`/api/learning/resources/${a2}`, { method: "PATCH", auth: S.ceo, body: { status: "published" } });
    expect(pub.body.status).toBe("published");
    const home = await call("/api/student/learn/home", { auth: BOB });
    expect(home.body.resource.level).toBe("A2");
    expect(home.body.levels.map((l: Json) => l.level)).toEqual(["A2"]);
    expect(home.body.totals.words).toBe(700);
    // Bob (A2 group only) cannot switch himself into the A1 set.
    const sneaky = await call(`/api/student/learn/home?resource=${a1}`, { auth: BOB });
    expect(sneaky.body.resource.level).toBe("A2");
  });

  it("a student in groups of two levels can switch between them", async () => {
    // Alice: group A (now A2) + group B (set to A1).
    await call(`/api/classes/${S.classB}`, { method: "PATCH", auth: S.ceo, body: { learningLevel: "A1" } });
    const home = await call("/api/student/learn/home", { auth: ALICE });
    expect(home.body.levels.map((l: Json) => l.level)).toEqual(["A1", "A2"]);
    expect(home.body.resource.level).toBe("A2"); // the group she's viewing (A)
    const viaB = await call("/api/student/learn/home", { auth: ALICE, headers: { "X-Student-Id": S.alice2 } });
    expect(viaB.body.resource.level).toBe("A1");
    const switched = await call(`/api/student/learn/home?resource=${a1}`, { auth: ALICE });
    expect(switched.body.resource.level).toBe("A1");
    // Her A1 progress is still there under the A1 set.
    expect(switched.body.totals.seen).toBeGreaterThan(0);
  });

  it("teachers see group progress against the group's level", async () => {
    const g = await call(`/api/learning/classes/${S.classA}`, { auth: S.teacher1 });
    expect(g.body).toMatchObject({ level: "A2", totalWords: 700 });
    const st = await call(`/api/learning/students/${S.alice}`, { auth: S.teacher1 });
    expect(st.body.sets.map((s: Json) => s.level).sort()).toEqual(["A1", "A2"]);
  });

  it("unpublishing hides the set again", async () => {
    await call(`/api/learning/resources/${a2}`, { method: "PATCH", auth: S.ceo, body: { status: "draft" } });
    const home = await call("/api/student/learn/home", { auth: BOB });
    expect(home.body.resource.level).toBe("A1");
  });
});

describe("learning reminders", () => {
  it("nudges learners who haven't practised today, once", async () => {
    const { runLearningReminders } = await import("../server/learning/reminders");
    // Alice practised today → no practise-nudge; the job is idempotent.
    const first = await runLearningReminders();
    expect(first.learning_review_due ?? 0).toBe(0);
    expect(first.learning_reminder ?? 0).toBe(0);
    const second = await runLearningReminders();
    expect(Object.values(second).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
