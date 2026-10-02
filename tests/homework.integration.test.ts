/**
 * Homework + student analytics, end to end against a real Postgres (PGlite)
 * and the real Express routes:
 *  - stage progress moves as soon as words are studied (not only when mastered);
 *  - app time is capped by real elapsed time and never fakes a streak day;
 *  - homework: assign → hand in (text + photo) → assistant checks with a mark
 *    (mirrored into scores) → student and teacher are told; returns and
 *    resubmits; vocabulary homework completes itself; the deadline report;
 *  - access: other students, other groups' teachers and the accountant are kept out.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const BOT_TOKEN = "123456:TEST-TOKEN";
const sent: { chat: number | string; text: string }[] = [];

vi.mock("../server/bot/client", async () => ({
  bot: { api: { sendMessage: async () => ({ message_id: 1 }), setChatMenuButton: async () => true, getMe: async () => ({ username: "t" }) } },
  sendMessage: async (chat: number | string, text: string) => {
    sent.push({ chat, text });
  },
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
const S = {} as Record<string, string>;
let M: {
  db: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  schema: typeof import("@shared/schema");
  eq: typeof import("drizzle-orm").eq;
  hw: typeof import("../server/services/homework");
};

async function call(path: string, opts: { method?: string; body?: unknown; auth?: string; headers?: Record<string, string>; raw?: Buffer } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": opts.raw ? "application/octet-stream" : "application/json",
      ...(opts.auth ? { Authorization: opts.auth } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.raw ? new Uint8Array(opts.raw) : opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  let body: Json = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body, ct };
}
const ALICE = `tma ${initData(6001)}`;
const BOB = `tma ${initData(6002)}`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

async function notificationsOf(studentId: string) {
  return M.db.select().from(M.schema.notifications).where(M.eq(M.schema.notifications.studentId, studentId));
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
  M = { db, schema, eq, hw: await import("../server/services/homework") };

  await storage.ensureSettings({ gracePeriodDays: 5, currency: "UZS" });
  await importBeginner900();
  const ceo = await storage.createUser({ telegramId: 2001, fullName: "Boss CEO", role: "ceo" });
  const t1 = await storage.createUser({ telegramId: 2003, fullName: "Madina Teacher", role: "teacher" });
  const t2 = await storage.createUser({ telegramId: 2004, fullName: "Aziz Teacher", role: "teacher" });
  const asst = await storage.createUser({ telegramId: 2005, fullName: "Dilnoza Assistant", role: "assistant" });
  const acct = await storage.createUser({ telegramId: 2006, fullName: "Olim Accountant", role: "accountant" });
  const teacher1 = await storage.getTeacherByUserId(t1.id);
  const teacher2 = await storage.getTeacherByUserId(t2.id);
  const clsA = await storage.createClass({ name: "English A1", teacherId: teacher1!.id, branchId: schema.DEFAULT_BRANCH_ID, defaultFee: 500000 });
  const clsB = await storage.createClass({ name: "Math", teacherId: teacher2!.id, branchId: schema.DEFAULT_BRANCH_ID, defaultFee: 500000 });
  const alice = await storage.createStudent({ fullName: "Rahimova Alice", phone: "+998901112233", classId: clsA.id, branchId: clsA.branchId, enrolledAt: "2026-01-10" });
  const bob = await storage.createStudent({ fullName: "Karimov Bob", phone: "+998904445566", classId: clsA.id, branchId: clsA.branchId, enrolledAt: "2026-01-10" });
  const alice2 = await storage.createStudent({ fullName: "Rahimova Alice", phone: "+998901112233", classId: clsB.id, branchId: clsB.branchId, enrolledAt: "2026-02-01" });
  await db.insert(schema.studentTelegramAccounts).values([
    { studentId: alice.id, telegramUserId: 6001, verificationMethod: "phone", languageCode: "en" },
    { studentId: alice2.id, telegramUserId: 6001, verificationMethod: "phone", languageCode: "en" },
    { studentId: bob.id, telegramUserId: 6002, verificationMethod: "code", languageCode: "uz" },
  ]);
  Object.assign(S, {
    ceo: `Bearer ${signToken(ceo.id)}`,
    teacher1: `Bearer ${signToken(t1.id)}`,
    teacher2: `Bearer ${signToken(t2.id)}`,
    assistant: `Bearer ${signToken(asst.id)}`,
    accountant: `Bearer ${signToken(acct.id)}`,
    classA: clsA.id,
    classB: clsB.id,
    alice: alice.id,
    alice2: alice2.id,
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

const aliceA = { auth: ALICE, headers: { "X-Student-Id": "" } };
const asAliceA = () => ({ ...aliceA, headers: { "X-Student-Id": S.alice } });

describe("progress statistics", () => {
  it("stage percent moves as soon as words are learned (not only when mastered)", async () => {
    const home0 = await call("/api/student/learn/home", asAliceA());
    expect(home0.status).toBe(200);
    const stage1 = home0.body.stages[0];
    expect(stage1.percent).toBe(0);
    const deck = await call(`/api/student/learn/deck?mode=learn&unit=${stage1.id}&limit=10`, asAliceA());
    for (const c of deck.body.cards) {
      const r = await call(`/api/student/learn/cards/${c.id}/review`, { ...asAliceA(), method: "POST", body: { known: true } });
      expect(r.status).toBe(200);
    }
    const home = await call("/api/student/learn/home", asAliceA());
    const s1 = home.body.stages[0];
    expect(s1.learned).toBe(10);
    expect(s1.mastered).toBe(0);
    // 10 of 100 words at box 2 = 10 × 0.5 / 100 = 5%.
    expect(s1.percent).toBe(5);
    expect(home.body.totals.learned).toBe(10);
    expect(home.body.totals.percent).toBeGreaterThan(0);
    const stats = await call("/api/student/learn/stats", asAliceA());
    expect(stats.body.wordsLearned).toBe(10);
    expect(stats.body.wordsMastered).toBe(0);
  });

  it("staff see the same learned / mastered / percent", async () => {
    const r = await call(`/api/learning/classes/${S.classA}`, { auth: S.teacher1 });
    const a = r.body.students.find((s: Json) => s.studentId === S.alice);
    expect(a.learned).toBe(10);
    expect(a.percent).toBeGreaterThan(0);
  });
});

describe("app time + analytics", () => {
  it("credits time but caps it by the real time since the last ping", async () => {
    const a = await call("/api/student/learn/ping", { auth: BOB, method: "POST", body: { seconds: 30 } });
    expect(a.status).toBe(200);
    expect(a.body.todaySeconds).toBe(30);
    // An instant second ping can't add another minute.
    const b = await call("/api/student/learn/ping", { auth: BOB, method: "POST", body: { seconds: 60 } });
    expect(b.body.todaySeconds).toBeLessThanOrEqual(32);
  });

  it("opening the app alone is not a streak day; the calendar shows it as unpractised", async () => {
    const r = await call("/api/student/learn/analytics", { auth: BOB });
    expect(r.status).toBe(200);
    expect(r.body.streak).toBe(0);
    expect(r.body.secondsToday).toBeGreaterThanOrEqual(30);
    expect(r.body.calendar).toHaveLength(1);
    expect(r.body.calendar[0].practised).toBe(false);
  });

  it("a practising learner gets a streak, words per level and a calendar day", async () => {
    const r = await call("/api/student/learn/analytics", asAliceA());
    expect(r.body.streak).toBe(1);
    expect(r.body.levels[0].learned).toBe(10);
    expect(r.body.calendar.some((d: Json) => d.practised && d.xp > 0)).toBe(true);
  });

  it("staff preview cannot write app time", async () => {
    const r = await call("/api/student/learn/ping", { auth: S.ceo, method: "POST", body: { seconds: 30 }, headers: { "X-Portal-Student": S.alice } });
    expect(r.status).toBe(403);
  });
});

describe("homework (task)", () => {
  let hwId = "";
  let fileId = "";

  it("the group's teacher sets homework; students are notified", async () => {
    const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const r = await call(`/api/groups/${S.classA}/homework`, {
      auth: S.teacher1,
      method: "POST",
      body: { kind: "task", title: "Essay: my family", instructions: "120 words", dueAt: due, maxScore: 10 },
    });
    expect(r.status).toBe(201);
    hwId = r.body.id;
    await new Promise((res) => setTimeout(res, 300));
    const n = await notificationsOf(S.alice);
    expect(n.some((x: Json) => x.type === "homework_assigned")).toBe(true);
  });

  it("another group's teacher and the accountant can't set or see it", async () => {
    const r = await call(`/api/groups/${S.classA}/homework`, {
      auth: S.teacher2,
      method: "POST",
      body: { kind: "task", title: "x", dueAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    expect(r.status).toBe(403);
    expect((await call(`/api/homework/${hwId}`, { auth: S.teacher2 })).status).toBe(403);
    expect((await call(`/api/homework`, { auth: S.accountant })).status).toBe(403);
    // The assistant may check but not set homework.
    const a = await call(`/api/groups/${S.classA}/homework`, {
      auth: S.assistant,
      method: "POST",
      body: { kind: "task", title: "x", dueAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    expect(a.status).toBe(403);
  });

  it("students of the group see it; the same person's other group does not", async () => {
    const mine = await call("/api/student/homework", asAliceA());
    expect(mine.body.map((h: Json) => h.id)).toContain(hwId);
    expect(mine.body.find((h: Json) => h.id === hwId).state).toBe("todo");
    const other = await call("/api/student/homework", { auth: ALICE, headers: { "X-Student-Id": S.alice2 } });
    expect(other.body).toHaveLength(0);
    expect((await call(`/api/student/homework/${hwId}`, { auth: ALICE, headers: { "X-Student-Id": S.alice2 } })).status).toBe(404);
  });

  it("an empty hand-in is refused; files are type-checked by their bytes", async () => {
    const e = await call(`/api/student/homework/${hwId}/submit`, { ...asAliceA(), method: "POST", body: {} });
    expect(e.status).toBe(400);
    expect(e.body.error).toBe("empty_submission");
    const bad = await call(`/api/student/homework/${hwId}/files`, { ...asAliceA(), method: "POST", raw: Buffer.from("not an image at all") });
    expect(bad.status).toBe(415);
    const ok = await call(`/api/student/homework/${hwId}/files`, { ...asAliceA(), method: "POST", raw: PNG, headers: { "X-Student-Id": S.alice, "X-File-Name": "page1.png" } });
    expect(ok.status).toBe(201);
    expect(ok.body.mime).toBe("image/png");
    fileId = ok.body.id;
  });

  it("a draft (files only) is invisible to checkers until handed in", async () => {
    const q = await call("/api/homework/queue", { auth: S.assistant });
    expect(q.body).toHaveLength(0);
    const s = await call(`/api/student/homework/${hwId}/submit`, { ...asAliceA(), method: "POST", body: { text: "My family is big." } });
    expect(s.status).toBe(200);
    expect(s.body.status).toBe("submitted");
    expect(s.body.late).toBe(false);
    const q2 = await call("/api/homework/queue", { auth: S.assistant });
    expect(q2.body).toHaveLength(1);
    expect(q2.body[0].files).toBe(1);
  });

  it("files are private: another student gets 404, staff of the group get the bytes", async () => {
    expect((await call(`/api/student/homework/files/${fileId}`, { auth: BOB })).status).toBe(404);
    expect((await call(`/api/homework/files/${fileId}`, { auth: S.teacher2 })).status).toBe(403);
    const t = await call(`/api/homework/files/${fileId}`, { auth: S.teacher1 });
    expect(t.status).toBe(200);
    expect(t.ct).toContain("image/png");
  });

  it("the assistant accepts with a mark: scores, student notice, teacher report", async () => {
    const detail = await call(`/api/homework/${hwId}`, { auth: S.assistant });
    expect(detail.status).toBe(200);
    expect(detail.body.canEdit).toBe(false);
    expect(detail.body.canCheck).toBe(true);
    const subId = detail.body.students.find((s: Json) => s.studentId === S.alice).submission.id;
    const over = await call(`/api/homework/submissions/${subId}/check`, { auth: S.assistant, method: "POST", body: { decision: "accept", score: 11 } });
    expect(over.status).toBe(400);
    const r = await call(`/api/homework/submissions/${subId}/check`, {
      auth: S.assistant,
      method: "POST",
      body: { decision: "accept", score: 8, feedback: "Good work" },
    });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("accepted");
    const scores = await M.db.select().from(M.schema.studentScores).where(M.eq(M.schema.studentScores.studentId, S.alice));
    expect(scores).toHaveLength(1);
    expect(scores[0].category).toBe("homework");
    expect(Number(scores[0].score)).toBe(8);
    const n = await notificationsOf(S.alice);
    expect(n.some((x: Json) => x.type === "homework_checked")).toBe(true);
    // Re-checking with a new mark updates the same score row.
    await call(`/api/homework/submissions/${subId}/check`, { auth: S.assistant, method: "POST", body: { decision: "accept", score: 9 } });
    const again = await M.db.select().from(M.schema.studentScores).where(M.eq(M.schema.studentScores.studentId, S.alice));
    expect(again).toHaveLength(1);
    expect(Number(again[0].score)).toBe(9);
    // The group's teacher hears about it (batched; flushed here).
    sent.length = 0;
    await M.hw.flushTeacherReports();
    const msg = sent.find((m) => m.chat === 2003);
    expect(msg?.text).toContain("Homework checked");
    expect(msg?.text).toContain("Dilnoza Assistant");
    // Accepted work can't be changed by the student any more.
    const s = await call(`/api/student/homework/${hwId}/submit`, { ...asAliceA(), method: "POST", body: { text: "edit" } });
    expect(s.status).toBe(409);
  });

  it("returned work: the student is told and can hand in again", async () => {
    await call(`/api/student/homework/${hwId}/submit`, { auth: BOB, method: "POST", body: { text: "short" } });
    const d = await call(`/api/homework/${hwId}`, { auth: S.teacher1 });
    const subId = d.body.students.find((s: Json) => s.studentId === S.bob).submission.id;
    const r = await call(`/api/homework/submissions/${subId}/check`, { auth: S.teacher1, method: "POST", body: { decision: "return", feedback: "Write 120 words" } });
    expect(r.body.status).toBe("returned");
    const n = await notificationsOf(S.bob);
    expect(n.some((x: Json) => x.type === "homework_returned")).toBe(true);
    const mine = await call(`/api/student/homework/${hwId}`, { auth: BOB });
    expect(mine.body.state).toBe("returned");
    expect(mine.body.submission.feedback).toBe("Write 120 words");
    const again = await call(`/api/student/homework/${hwId}/submit`, { auth: BOB, method: "POST", body: { text: "longer answer" } });
    expect(again.body.status).toBe("submitted");
    expect(again.body.attempt).toBe(2);
    // Checked by the group's own teacher: no extra report to themselves.
    sent.length = 0;
    await M.hw.flushTeacherReports();
    expect(sent).toHaveLength(0);
  });

  it("when the deadline passes the teacher gets one status report", async () => {
    await M.db.update(M.schema.homework).set({ dueAt: new Date(Date.now() - 60_000) }).where(M.eq(M.schema.homework.id, hwId));
    sent.length = 0;
    const t1 = await M.hw.runHomeworkJobs();
    expect(t1.reports).toBe(1);
    const msg = sent.find((m) => m.chat === 2003);
    expect(msg?.text).toContain("deadline passed");
    expect(msg?.text).toContain("2/2");
    // The assistant is told there is work to check (Bob's resubmission).
    expect(sent.some((m) => m.chat === 2005 && m.text.includes("to check"))).toBe(true);
    const t2 = await M.hw.runHomeworkJobs();
    expect(t2.reports).toBe(0);
  });

  it("the student profile shows the homework record", async () => {
    const r = await call(`/api/students/${S.alice}/homework`, { auth: S.teacher1 });
    expect(r.status).toBe(200);
    expect(r.body.summary.done).toBe(1);
    expect(r.body.summary.averagePercent).toBe(90);
  });
});

describe("homework (vocabulary)", () => {
  it("completes itself once the stage target is reached", async () => {
    const meta = await call("/api/homework/meta", { auth: S.teacher1 });
    const g = meta.body.groups.find((x: Json) => x.id === S.classA);
    const stage2 = g.stages[1];
    const r = await call(`/api/groups/${S.classA}/homework`, {
      auth: S.teacher1,
      method: "POST",
      body: { kind: "vocabulary", title: "Stage 2 words", dueAt: new Date(Date.now() + 86_400_000).toISOString(), unitId: stage2.id, targetPercent: 10 },
    });
    expect(r.status).toBe(201);
    const before = await call(`/api/student/homework/${r.body.id}`, asAliceA());
    expect(before.body.state).toBe("todo");
    expect(before.body.vocab.percent).toBe(0);
    const deck = await call(`/api/student/learn/deck?mode=learn&unit=${stage2.id}&limit=10`, asAliceA());
    for (const c of deck.body.cards) await call(`/api/student/learn/cards/${c.id}/review`, { ...asAliceA(), method: "POST", body: { known: true } });
    // Completion runs right after the answer; give it a moment.
    let state = "";
    for (let i = 0; i < 20 && state !== "done"; i++) {
      await new Promise((res) => setTimeout(res, 100));
      state = (await call(`/api/student/homework/${r.body.id}`, asAliceA())).body.state;
    }
    expect(state).toBe("done");
    // Vocabulary homework never shows up in the check queue.
    const q = await call("/api/homework/queue", { auth: S.assistant });
    expect(q.body.every((x: Json) => x.homeworkId !== r.body.id)).toBe(true);
  });
});
