/**
 * Homework + student analytics, end to end against a real Postgres (PGlite)
 * and the real Express routes:
 *  - stage progress moves as soon as words are studied (not only when mastered);
 *  - app time is capped by real elapsed time and never fakes a streak day;
 *  - homework: the teacher writes several lines (parts); the assistant (or
 *    teacher) ticks or crosses each part per student, the teacher gets a
 *    Telegram summary when someone else marked, students only see it;
 *  - task tables: a teacher-made grid of tasks with no deadline, ticked by
 *    staff as students finish each task;
 *  - access: other groups' teachers and the accountant are kept out.
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

describe("homework (parts, tick / X)", () => {
  let hwId = "";
  let parts: { id: string; text: string }[] = [];
  const mark = (auth: string, body: Json) => call(`/api/homework/${hwId}/marks`, { auth, method: "POST", body });

  it("the group's teacher writes several lines; each becomes a part; students are told", async () => {
    const r = await call(`/api/groups/${S.classA}/homework`, {
      auth: S.teacher1,
      method: "POST",
      body: { text: "1. Workbook p. 12-13\n\n2. Learn 20 words\n3. Write 5 sentences", dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString() },
    });
    expect(r.status).toBe(201);
    hwId = r.body.id;
    parts = r.body.parts;
    expect(parts.map((p) => p.text)).toEqual(["Workbook p. 12-13", "Learn 20 words", "Write 5 sentences"]);
    await new Promise((res) => setTimeout(res, 300));
    expect((await notificationsOf(S.alice)).some((x: Json) => x.type === "homework_assigned")).toBe(true);
  });

  it("only the teacher (or CEO) adds homework; other teachers and the accountant are kept out", async () => {
    const body = { text: "x", dueAt: new Date(Date.now() + 86_400_000).toISOString() };
    expect((await call(`/api/groups/${S.classA}/homework`, { auth: S.teacher2, method: "POST", body })).status).toBe(403);
    expect((await call(`/api/groups/${S.classA}/homework`, { auth: S.assistant, method: "POST", body })).status).toBe(403);
    expect((await call(`/api/groups/${S.classA}/homework`, { auth: S.ceo, method: "POST", body: { ...body, notify: false } })).status).toBe(201);
    expect((await call(`/api/groups/${S.classA}/homework`, { auth: S.teacher2 })).status).toBe(403);
    expect((await call(`/api/groups/${S.classA}/homework`, { auth: S.accountant })).status).toBe(403);
    expect((await call(`/api/homework/groups`, { auth: S.accountant })).status).toBe(403);
    expect((await mark(S.teacher2, { studentIds: [S.alice], status: "done" })).status).toBe(403);
  });

  it("the assistant sees every group, can mark but not add", async () => {
    const g = await call(`/api/homework/groups`, { auth: S.assistant });
    const a = g.body.find((x: Json) => x.id === S.classA);
    expect(a.canAssign).toBe(false);
    expect(a.canCheck).toBe(true);
    expect(g.body.some((x: Json) => x.id === S.classB)).toBe(true);
    const t = await call(`/api/homework/groups`, { auth: S.teacher1 });
    expect(t.body.map((x: Json) => x.id)).toEqual([S.classA]);
  });

  it("each part is ticked or crossed per student; idempotent; only the group's own students", async () => {
    const r = await mark(S.assistant, { studentIds: [S.alice, S.alice2], status: "done" });
    expect(r.status).toBe(200);
    expect(r.body.changed).toEqual([S.alice]); // every part; alice2 is the Math record
    expect((await mark(S.assistant, { studentIds: [S.alice], status: "done" })).body.changed).toEqual([]);
    // Bob: part 1 done, part 2 not done.
    await mark(S.assistant, { studentIds: [S.bob], partIds: [parts[0].id], status: "done" });
    await mark(S.assistant, { studentIds: [S.bob], partIds: [parts[1].id], status: "missed" });
    const grid = await call(`/api/groups/${S.classA}/homework`, { auth: S.teacher1 });
    const h = grid.body.homework.find((x: Json) => x.id === hwId);
    expect(h.marks[S.alice]).toEqual({ [parts[0].id]: "done", [parts[1].id]: "done", [parts[2].id]: "done" });
    expect(h.marks[S.bob]).toEqual({ [parts[0].id]: "done", [parts[1].id]: "missed" });
    expect(h.done).toBe(1);
    expect(grid.body.students).toHaveLength(2);
  });

  it("the teacher gets one summary when the assistant marked, naming the parts not done", async () => {
    sent.length = 0;
    await M.hw.flushTeacherReports();
    const msg = sent.find((m) => m.chat === 2003);
    expect(msg?.text).toContain("Homework checked");
    expect(msg?.text).toContain("Dilnoza Assistant");
    expect(msg?.text).toContain("2. Learn 20 words");
    expect(msg?.text).toContain("Done: <b>1/2</b>");
    expect(msg?.text).toContain("Karimov Bob (2, 3)");
  });

  it("the teacher's own marks don't message the teacher; clearing a mark removes it", async () => {
    await mark(S.teacher1, { studentIds: [S.bob], partIds: [parts[2].id], status: "done" });
    await mark(S.teacher1, { studentIds: [S.bob], partIds: [parts[2].id], status: null });
    sent.length = 0;
    await M.hw.flushTeacherReports();
    expect(sent).toHaveLength(0);
    const grid = await call(`/api/groups/${S.classA}/homework`, { auth: S.teacher1 });
    expect(grid.body.homework.find((x: Json) => x.id === hwId).marks[S.bob][parts[2].id]).toBeUndefined();
  });

  it("students see each part with its tick / X, read-only", async () => {
    const a = await call("/api/student/homework", asAliceA());
    const ah = a.body.find((h: Json) => h.id === hwId);
    expect(ah.state).toBe("done");
    expect(ah.parts.map((p: Json) => p.mark)).toEqual(["done", "done", "done"]);
    const b = await call("/api/student/homework", { auth: BOB });
    const bh = b.body.find((h: Json) => h.id === hwId);
    expect(bh.parts.map((p: Json) => p.mark)).toEqual(["done", "missed", null]);
    expect(bh.state).toBe("missed"); // a part crossed
    const other = await call("/api/student/homework", { auth: ALICE, headers: { "X-Student-Id": S.alice2 } });
    expect(other.body).toHaveLength(0);
    // Students can't mark or hand anything in.
    expect((await call(`/api/student/homework/${hwId}/submit`, { auth: BOB, method: "POST", body: { text: "x" } })).status).toBe(404);
    expect([401, 403]).toContain((await call(`/api/homework/${hwId}/marks`, { auth: BOB, method: "POST", body: { studentIds: [S.bob], status: "done" } })).status);
  });

  it("editing the text keeps marks of parts that stayed and drops removed ones", async () => {
    const r = await call(`/api/homework/${hwId}`, {
      auth: S.teacher1,
      method: "PATCH",
      body: { text: "Workbook p. 12-13\nWrite 5 sentences\nRead the story" },
    });
    expect(r.status).toBe(200);
    expect(r.body.parts.map((p: Json) => p.id)).toEqual([parts[0].id, parts[2].id, "p4"]);
    const rows = await M.db.select().from(M.schema.homeworkMarks).where(M.eq(M.schema.homeworkMarks.homeworkId, hwId));
    expect(rows.some((m: Json) => m.partId === parts[1].id)).toBe(false);
    expect(rows.filter((m: Json) => m.studentId === S.alice).map((m: Json) => m.partId).sort()).toEqual([parts[0].id, parts[2].id].sort());
  });

  it("after the deadline a student who didn't do every part shows as not done", async () => {
    // Past due, but after Bob joined (his record was made moments ago by the seed).
    const [bob] = await M.db.select().from(M.schema.students).where(M.eq(M.schema.students.id, S.bob));
    await M.db.update(M.schema.homework).set({ dueAt: new Date(bob.createdAt.getTime() + 1) }).where(M.eq(M.schema.homework.id, hwId));
    const b = await call("/api/student/homework", { auth: BOB });
    expect(b.body.find((h: Json) => h.id === hwId).state).toBe("missed");
    const prof = await call(`/api/students/${S.bob}/homework`, { auth: S.teacher1 });
    expect(prof.body.summary.missed).toBeGreaterThanOrEqual(1);
    const bRecent = prof.body.recent.find((h: Json) => h.id === hwId);
    expect([bRecent.partsDone, bRecent.partsTotal]).toEqual([1, 3]);
  });

  it("reminds students who haven't done every part the day before the deadline, once", async () => {
    const r = await call(`/api/groups/${S.classA}/homework`, {
      auth: S.teacher1,
      method: "POST",
      body: { text: "Learn 20 words", dueAt: new Date(Date.now() + 12 * 3600_000).toISOString(), notify: false },
    });
    await M.db.update(M.schema.homework).set({ createdAt: new Date(Date.now() - 24 * 3600_000) }).where(M.eq(M.schema.homework.id, r.body.id));
    await call(`/api/homework/${r.body.id}/marks`, { auth: S.teacher1, method: "POST", body: { studentIds: [S.alice], status: "done" } });
    const first = await M.hw.runHomeworkJobs();
    expect(first.dueSoon).toBe(1); // Bob only
    expect((await M.hw.runHomeworkJobs()).dueSoon).toBe(0);
  });

  it("a student who joined after homework was set still sees it while it's open, but not work already past due", async () => {
    const yearAgo = new Date(Date.now() - 365 * 24 * 3600_000);
    const set = async (text: string, dueAt: Date) => {
      const r = await call(`/api/groups/${S.classA}/homework`, {
        auth: S.teacher1,
        method: "POST",
        body: { text, dueAt: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(), notify: false },
      });
      // Set long before Bob's student record existed.
      await M.db.update(M.schema.homework).set({ createdAt: yearAgo, dueAt }).where(M.eq(M.schema.homework.id, r.body.id));
      return r.body.id as string;
    };
    const open = await set("Still open", new Date(Date.now() + 3 * 24 * 3600_000));
    const stale = await set("Long gone", new Date(yearAgo.getTime() + 24 * 3600_000));
    const ids = (await call("/api/student/homework", { auth: BOB })).body.map((h: Json) => h.id);
    expect(ids).toContain(open);
    expect(ids).not.toContain(stale);
    for (const id of [open, stale]) await call(`/api/homework/${id}`, { auth: S.teacher1, method: "DELETE" });
  });

  it("archive hides it from the current view; delete removes it", async () => {
    await call(`/api/homework/${hwId}`, { auth: S.teacher1, method: "PATCH", body: { status: "archived" } });
    const g = await call(`/api/groups/${S.classA}/homework`, { auth: S.teacher1 });
    expect(g.body.homework.some((h: Json) => h.id === hwId)).toBe(false);
    const all = await call(`/api/groups/${S.classA}/homework?view=all`, { auth: S.teacher1 });
    expect(all.body.homework.some((h: Json) => h.id === hwId)).toBe(true);
    expect((await call(`/api/homework/${hwId}`, { auth: S.teacher1, method: "DELETE" })).status).toBe(200);
  });
});

describe("task tables (no deadline)", () => {
  let tableId = "";
  let cols: { id: string; label: string }[] = [];

  it("the teacher makes a table of 10 tasks; the assistant can't", async () => {
    expect((await call(`/api/groups/${S.classA}/homework-tables`, { auth: S.assistant, method: "POST", body: { title: "x", columns: { count: 3 } } })).status).toBe(403);
    expect((await call(`/api/groups/${S.classA}/homework-tables`, { auth: S.teacher2, method: "POST", body: { title: "x", columns: { count: 3 } } })).status).toBe(403);
    const r = await call(`/api/groups/${S.classA}/homework-tables`, { auth: S.teacher1, method: "POST", body: { title: "Speaking tasks", columns: { count: 10 } } });
    expect(r.status).toBe(201);
    tableId = r.body.id;
    cols = r.body.columns;
    expect(cols).toHaveLength(10);
    expect(cols[9].label).toBe("10");
  });

  it("teacher and assistant tick tasks as students finish them; students only see theirs", async () => {
    const tick = (auth: string, body: Json) => call(`/api/homework-tables/${tableId}/ticks`, { auth, method: "POST", body });
    expect((await tick(S.assistant, { studentIds: [S.alice, S.alice2], columnId: cols[0].id, done: true })).body.changed).toEqual([S.alice]);
    expect((await tick(S.teacher1, { studentIds: [S.alice], columnId: cols[1].id, done: true })).status).toBe(200);
    expect((await tick(S.teacher1, { studentIds: [S.bob], columnId: cols[0].id, done: true })).status).toBe(200);
    expect((await tick(S.teacher1, { studentIds: [S.bob], columnId: cols[0].id, done: false })).body.changed).toEqual([S.bob]);
    expect((await tick(S.teacher2, { studentIds: [S.bob], columnId: cols[0].id, done: true })).status).toBe(403);
    expect((await tick(S.accountant, { studentIds: [S.bob], columnId: cols[0].id, done: true })).status).toBe(403);
    expect((await tick(S.teacher1, { studentIds: [S.bob], columnId: "nope", done: true })).body.changed).toEqual([]);

    const g = await call(`/api/groups/${S.classA}/homework-tables`, { auth: S.assistant });
    const t = g.body.trackers.find((x: Json) => x.id === tableId);
    expect(t.ticks[S.alice].sort()).toEqual([cols[0].id, cols[1].id].sort());
    expect(t.ticks[S.bob]).toEqual([]);
    expect(g.body.canAssign).toBe(false);

    const a = await call("/api/student/homework/tables", asAliceA());
    const at = a.body.find((x: Json) => x.id === tableId);
    expect(at.columns.filter((c: Json) => c.done)).toHaveLength(2);
    const b = await call("/api/student/homework/tables", { auth: BOB });
    expect(b.body.find((x: Json) => x.id === tableId).columns.some((c: Json) => c.done)).toBe(false);
  });

  it("renaming tasks keeps ticks; removing tasks drops theirs; archive and delete", async () => {
    const r = await call(`/api/homework-tables/${tableId}`, { auth: S.teacher1, method: "PATCH", body: { columns: { labels: "Family" } } });
    expect(r.status).toBe(200);
    expect(r.body.columns).toEqual([{ id: cols[0].id, label: "Family" }]);
    const g = await call(`/api/groups/${S.classA}/homework-tables`, { auth: S.teacher1 });
    expect(g.body.trackers.find((x: Json) => x.id === tableId).ticks[S.alice]).toEqual([cols[0].id]);
    await call(`/api/homework-tables/${tableId}`, { auth: S.teacher1, method: "PATCH", body: { status: "archived" } });
    expect((await call(`/api/groups/${S.classA}/homework-tables`, { auth: S.teacher1 })).body.trackers).toHaveLength(0);
    expect((await call("/api/student/homework/tables", asAliceA())).body).toHaveLength(0);
    expect((await call(`/api/homework-tables/${tableId}`, { auth: S.teacher1, method: "DELETE" })).status).toBe(200);
  });
});
