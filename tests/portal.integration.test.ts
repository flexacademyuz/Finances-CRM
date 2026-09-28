/**
 * End-to-end tests of the student portal, attendance, scores, notifications and
 * Telegram linking against a REAL Postgres (embedded PGlite over the wire
 * protocol) and the real Express routes. Telegram itself is replaced by an
 * in-memory fake bot so nothing leaves the machine.
 *
 * Security focus: a student can only ever reach their own data (no IDOR),
 * teachers only their own groups, and preview mode is read-only.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const BOT_TOKEN = "123456:TEST-TOKEN";

// Fake Telegram bot: records messages, can simulate failures.
const tg = vi.hoisted(() => ({
  sent: [] as { chatId: number; text: string }[],
  fail: null as null | "blocked" | "server",
}));
vi.mock("../server/bot/client", async () => {
  const { GrammyError } = await import("grammy");
  return {
    bot: {
      api: {
        sendMessage: async (chatId: number, text: string) => {
          if (tg.fail === "blocked") {
            throw new GrammyError(
              "Call to 'sendMessage' failed!",
              { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" },
              "sendMessage",
              {},
            );
          }
          if (tg.fail === "server") {
            throw new GrammyError(
              "Call to 'sendMessage' failed!",
              { ok: false, error_code: 500, description: "Internal Server Error" },
              "sendMessage",
              {},
            );
          }
          tg.sent.push({ chatId, text });
          return { message_id: tg.sent.length };
        },
        setChatMenuButton: async () => true,
        getMe: async () => ({ username: "flex_test_bot" }),
      },
    },
    sendMessage: async () => undefined,
    getChatTitle: async () => null,
    botUsername: async () => "flex_test_bot",
  };
});

/** Sign Mini App initData exactly like Telegram does. */
function initData(userId: number, first = "Test"): string {
  const p = new URLSearchParams();
  p.set("auth_date", String(Math.floor(Date.now() / 1000)));
  p.set("query_id", "AAE");
  p.set("user", JSON.stringify({ id: userId, first_name: first, language_code: "en" }));
  const dcs = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  p.set("hash", createHmac("sha256", secret).update(dcs).digest("hex"));
  return p.toString();
}

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 4000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() > until) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

let server: Server;
let base = "";
let pgServer: { stop(): Promise<void> };
let pgDb: { close(): Promise<void> };

// Seeded ids / credentials
const S = {} as {
  ceoToken: string;
  accToken: string;
  teacherToken: string;
  teacher2Token: string;
  classA: string;
  classB: string;
  alice: string; // student in class A (teacher 1), linked to TG 5001
  bob: string; // student in class A, linked to TG 5002
  carol: string; // student in class B (teacher 2), not linked
  bobPaymentId: string;
  alicePaymentId: string;
};

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  path: string,
  opts: { method?: string; body?: unknown; auth?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Json }> {
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.auth ? { Authorization: opts.auth } : {}),
      ...(opts.headers ?? {}),
    },
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
  const { registerNotificationListeners } = await import("../server/notifications/listeners");
  registerNotificationListeners();

  await storage.ensureSettings({ gracePeriodDays: 5, currency: "UZS" });
  const ceo = await storage.createUser({ telegramId: 1001, fullName: "Boss CEO", role: "ceo" });
  const acc = await storage.createUser({ telegramId: 1002, fullName: "Anna Accountant", role: "accountant" });
  const t1 = await storage.createUser({ telegramId: 1003, fullName: "Madina Teacher", role: "teacher" });
  const t2 = await storage.createUser({ telegramId: 1004, fullName: "Aziz Teacher", role: "teacher" });
  const teacher1 = await storage.getTeacherByUserId(t1.id);
  const teacher2 = await storage.getTeacherByUserId(t2.id);

  const clsA = await storage.createClass({
    name: "IELTS 18:00",
    teacherId: teacher1!.id,
    branchId: schema.DEFAULT_BRANCH_ID,
    defaultFee: 500000,
    room: "204",
    scheduleSlots: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "18:00", end: "19:30" }],
  });
  const clsB = await storage.createClass({
    name: "SAT",
    teacherId: teacher2!.id,
    branchId: schema.DEFAULT_BRANCH_ID,
    defaultFee: 600000,
  });
  const alice = await storage.createStudent({ fullName: "Rahimov Alice", phone: "+998901112233", classId: clsA.id, branchId: clsA.branchId, enrolledAt: "2026-01-10" });
  const bob = await storage.createStudent({ fullName: "Karimov Bob", phone: "+998904445566", classId: clsA.id, branchId: clsA.branchId, enrolledAt: "2026-01-10" });
  const carol = await storage.createStudent({ fullName: "Aliyeva Carol", classId: clsB.id, branchId: clsB.branchId, enrolledAt: "2026-01-10" });

  // Link Alice + Bob to Telegram (as the bot would after verification).
  await db.insert(schema.studentTelegramAccounts).values([
    { studentId: alice.id, telegramUserId: 5001, verificationMethod: "phone", languageCode: "en" },
    { studentId: bob.id, telegramUserId: 5002, verificationMethod: "code", languageCode: "uz" },
  ]);

  Object.assign(S, {
    ceoToken: `Bearer ${signToken(ceo.id)}`,
    accToken: `Bearer ${signToken(acc.id)}`,
    teacherToken: `Bearer ${signToken(t1.id)}`,
    teacher2Token: `Bearer ${signToken(t2.id)}`,
    classA: clsA.id,
    classB: clsB.id,
    alice: alice.id,
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
  // Let the debounced queue kick (500ms) finish before closing the pool.
  await new Promise((r) => setTimeout(r, 800));
  const { processQueue } = await import("../server/notifications/queue");
  await processQueue(2000);
  const { pool } = await import("../server/db");
  await pool.end().catch(() => undefined);
  await pgServer?.stop().catch(() => undefined);
  await pgDb?.close().catch(() => undefined);
});

describe("student authentication", () => {
  it("resolves the student from signed initData", async () => {
    const r = await call("/api/student/me", { auth: asStudent(5001) });
    expect(r.status).toBe(200);
    expect(r.body.student.id).toBe(S.alice);
    expect(r.body.group.name).toBe("IELTS 18:00");
    expect(r.body.group.teacherName).toBe("Madina Teacher");
    expect(r.body.group.room).toBe("204");
  });

  it("rejects an unlinked Telegram user (403 not_linked)", async () => {
    const r = await call("/api/student/me", { auth: asStudent(9999) });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("not_linked");
  });

  it("rejects tampered initData and missing auth", async () => {
    const tampered = initData(5001).replace("5001", "5002");
    expect((await call("/api/student/me", { auth: `tma ${tampered}` })).status).toBe(401);
    expect((await call("/api/student/me")).status).toBe(401);
  });

  it("does not let a staff token act as a student, nor a student reach staff APIs", async () => {
    expect((await call("/api/student/me", { auth: S.ceoToken })).status).toBe(401);
    expect((await call("/api/students", { auth: asStudent(5001) })).status).toBe(403);
  });
});

describe("payments → notifications (accountant flow unchanged)", () => {
  it("records a payment and notifies the student in-app and on Telegram", async () => {
    const r = await call("/api/payments", {
      method: "POST",
      auth: S.accToken,
      body: { studentId: S.bob, amount: 300000, method: "cash" },
    });
    expect(r.status).toBe(201);
    S.bobPaymentId = r.body.id;

    const n = await waitFor(async () => {
      const list = await call("/api/student/notifications", { auth: asStudent(5002) });
      return list.body.items?.find((x: Json) => x.type === "payment_recorded");
    });
    expect(n.params.amount).toBe(300000);
    expect(n.params.remaining).toBe(200000); // partial of 500,000

    const { processQueue } = await import("../server/notifications/queue");
    await processQueue(5000);
    const msg = tg.sent.find((m) => m.chatId === 5002);
    expect(msg?.text).toContain("To'lov qabul qilindi"); // Bob reads Uzbek
  });

  it("student sees their own payment with safe fields only", async () => {
    const list = await call("/api/student/payments", { auth: asStudent(5002) });
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    const p = list.body.items[0];
    expect(p).toMatchObject({ amount: 300000, amountDue: 500000, remaining: 200000, status: "partial" });
    expect(p).not.toHaveProperty("teacherCreditAmount");
    expect(p).not.toHaveProperty("recordedBy");
    const detail = await call(`/api/student/payments/${S.bobPaymentId}`, { auth: asStudent(5002) });
    expect(detail.status).toBe(200);
    expect(detail.body.installments[0].amount).toBe(300000);
  });

  it("a Telegram outage never breaks recording a payment", async () => {
    tg.fail = "server";
    const r = await call("/api/payments", {
      method: "POST",
      auth: S.accToken,
      body: { studentId: S.alice, amount: 500000, method: "online" },
    });
    expect(r.status).toBe(201);
    S.alicePaymentId = r.body.id;
    await waitFor(async () => {
      const l = await call("/api/student/notifications", { auth: asStudent(5001) });
      return l.body.items?.some((x: Json) => x.type === "payment_recorded");
    });
    const { processQueue } = await import("../server/notifications/queue");
    await processQueue(3000);
    const { db } = await import("../server/db");
    const { notificationDeliveries } = await import("@shared/schema");
    const rows = await db.select().from(notificationDeliveries);
    const failed = rows.find((d) => d.chatId === 5001 && d.lastError);
    expect(failed?.status).toBe("pending"); // scheduled for retry, not lost
    expect(failed?.attempts).toBe(1);
    expect(failed!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    tg.fail = null;
  });
});

describe("IDOR: a student can never reach another student's data", () => {
  it("payments by id", async () => {
    const r = await call(`/api/student/payments/${S.bobPaymentId}`, { auth: asStudent(5001) });
    expect(r.status).toBe(404);
  });

  it("ignores a smuggled studentId query parameter", async () => {
    const r = await call(`/api/student/payments?studentId=${S.bob}`, { auth: asStudent(5001) });
    expect(r.status).toBe(200);
    expect(r.body.items.every((p: Json) => p.id !== S.bobPaymentId)).toBe(true);
  });

  it("notifications cannot be read-marked across students", async () => {
    const bobs = await call("/api/student/notifications", { auth: asStudent(5002) });
    const id = bobs.body.items[0].id;
    const r = await call(`/api/student/notifications/${id}/read`, { method: "POST", auth: asStudent(5001) });
    expect(r.status).toBe(404);
    const again = await call("/api/student/notifications", { auth: asStudent(5002) });
    expect(again.body.items.find((x: Json) => x.id === id).readAt).toBeNull();
  });

  it("unknown / malformed ids are 404, never a leak or crash", async () => {
    expect((await call("/api/student/scores/not-a-uuid", { auth: asStudent(5001) })).status).toBe(404);
    expect((await call("/api/student/attendance/00000000-0000-0000-0000-000000000000", { auth: asStudent(5001) })).status).toBe(404);
    expect((await call("/api/student/nope", { auth: asStudent(5001) })).status).toBe(404);
  });
});

describe("attendance (teacher)", () => {
  let today: string;
  beforeAll(async () => {
    today = (await import("@shared/lesson-schedule")).tashkentDate();
  });

  it("teacher sees the sheet for their own group", async () => {
    const r = await call(`/api/groups/${S.classA}/attendance?date=${today}`, { auth: S.teacherToken });
    expect(r.status).toBe(200);
    expect(r.body.roster.map((s: Json) => s.id).sort()).toEqual([S.alice, S.bob].sort());
    expect(r.body.canEdit).toBe(true);
  });

  it("another teacher is forbidden", async () => {
    expect((await call(`/api/groups/${S.classA}/attendance`, { auth: S.teacher2Token })).status).toBe(403);
    const put = await call(`/api/groups/${S.classA}/attendance`, {
      method: "PUT",
      auth: S.teacher2Token,
      body: { date: today, records: [{ studentId: S.alice, status: "present" }] },
    });
    expect(put.status).toBe(403);
  });

  it("rejects students from another group and future dates", async () => {
    const stranger = await call(`/api/groups/${S.classA}/attendance`, {
      method: "PUT",
      auth: S.teacherToken,
      body: { date: today, records: [{ studentId: S.carol, status: "present" }] },
    });
    expect(stranger.status).toBe(400);
    expect(stranger.body.error).toBe("not_in_group");
    const future = await call(`/api/groups/${S.classA}/attendance`, {
      method: "PUT",
      auth: S.teacherToken,
      body: { date: "2999-01-01", records: [{ studentId: S.alice, status: "present" }] },
    });
    expect(future.status).toBe(400);
  });

  it("locks old dates for teachers but not for the CEO", async () => {
    const old = "2026-01-15";
    const t = await call(`/api/groups/${S.classA}/attendance`, {
      method: "PUT",
      auth: S.teacherToken,
      body: { date: old, records: [{ studentId: S.alice, status: "absent" }] },
    });
    expect(t.status).toBe(403);
    expect(t.body.error).toBe("attendance_locked");
    const c = await call(`/api/groups/${S.classA}/attendance`, {
      method: "PUT",
      auth: S.ceoToken,
      body: { date: old, records: [{ studentId: S.alice, status: "absent" }] },
    });
    expect(c.status).toBe(200);
  });

  it("saves, is idempotent, notifies only on change, and audits", async () => {
    const save = (status: string) =>
      call(`/api/groups/${S.classA}/attendance`, {
        method: "PUT",
        auth: S.teacherToken,
        body: {
          date: today,
          records: [
            { studentId: S.alice, status: "present" },
            { studentId: S.bob, status },
          ],
        },
      });
    const first = await save("late");
    expect(first.status).toBe(200);
    expect(first.body.changed).toBe(2);
    expect((await save("late")).body.changed).toBe(0); // same marks → no change
    expect((await save("absent")).body.changed).toBe(1); // correction

    const bobNotes = await waitFor(async () => {
      const l = await call("/api/student/notifications", { auth: asStudent(5002) });
      const att = l.body.items.filter((x: Json) => x.type === "attendance_marked");
      return att.length >= 2 ? att : null;
    });
    expect(bobNotes.map((n: Json) => n.params.status).sort()).toEqual(["absent", "late"]);

    const audit = await call(`/api/audit?entityType=lesson`, { auth: S.ceoToken });
    expect(audit.body.some((a: Json) => a.action === "attendance.changed")).toBe(true);
  });

  it("student sees their own attendance history + summary", async () => {
    const r = await call("/api/student/attendance", { auth: asStudent(5001) });
    expect(r.status).toBe(200);
    expect(r.body.summary.present).toBe(1);
    expect(r.body.summary.absent).toBe(1); // the CEO's old-date mark
    expect(r.body.records[0]).toHaveProperty("className", "IELTS 18:00");
    const one = await call(`/api/student/attendance/${r.body.records[0].id}`, { auth: asStudent(5001) });
    expect(one.status).toBe(200);
    // Bob can't open Alice's record.
    expect((await call(`/api/student/attendance/${r.body.records[0].id}`, { auth: asStudent(5002) })).status).toBe(404);
  });

  it("management analytics aggregates records", async () => {
    const r = await call(`/api/attendance/analytics?from=2026-01-01&to=${today}`, { auth: S.ceoToken });
    expect(r.status).toBe(200);
    expect(r.body.totals.lessons).toBe(2);
    expect(r.body.byGroup[0].className).toBe("IELTS 18:00");
    // Teacher 2 is scoped to their own groups → sees nothing of group A.
    const t2 = await call(`/api/attendance/analytics?from=2026-01-01&to=${today}`, { auth: S.teacher2Token });
    expect(t2.body.totals.total).toBe(0);
  });
});

describe("scores", () => {
  it("teacher records a whole-group assessment; duplicates are refused", async () => {
    const body = {
      category: "reading",
      title: "Reading Test 1",
      maxScore: 40,
      scoreDate: "2026-09-20",
      entries: [
        { studentId: S.alice, score: 34, comment: "Good improvement in TFNG." },
        { studentId: S.bob, score: 28 },
      ],
    };
    const r = await call(`/api/groups/${S.classA}/scores`, { method: "POST", auth: S.teacherToken, body });
    expect(r.status).toBe(201);
    const dup = await call(`/api/groups/${S.classA}/scores`, { method: "POST", auth: S.teacherToken, body });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("duplicate_score");
    const other = await call(`/api/groups/${S.classA}/scores`, { method: "POST", auth: S.teacher2Token, body });
    expect(other.status).toBe(403);
  });

  it("validates score ≤ max and known categories", async () => {
    const over = await call(`/api/students/${S.alice}/scores`, {
      method: "POST",
      auth: S.teacherToken,
      body: { category: "quiz", title: "Q1", maxScore: 10, score: 11, scoreDate: "2026-09-21" },
    });
    expect(over.status).toBe(400);
    const bad = await call(`/api/students/${S.alice}/scores`, {
      method: "POST",
      auth: S.teacherToken,
      body: { category: "astrology", title: "Q1", maxScore: 10, score: 5, scoreDate: "2026-09-21" },
    });
    expect(bad.status).toBe(400);
  });

  it("student sees their scores, progress, and a notification", async () => {
    const scores = await call("/api/student/scores", { auth: asStudent(5001) });
    expect(scores.body).toHaveLength(1);
    expect(scores.body[0]).toMatchObject({ score: 34, maxScore: 40, percent: 85, teacherName: "Madina Teacher" });
    const progress = await call("/api/student/progress", { auth: asStudent(5001) });
    expect(progress.body.analytics.average).toBe(85);
    await waitFor(async () => {
      const l = await call("/api/student/notifications", { auth: asStudent(5001) });
      return l.body.items.find((x: Json) => x.type === "score_added");
    });
    // Bob can't read Alice's score by id.
    expect((await call(`/api/student/scores/${scores.body[0].id}`, { auth: asStudent(5002) })).status).toBe(404);
  });

  it("editing is audited and re-notifies", async () => {
    const list = await call(`/api/students/${S.bob}/scores`, { auth: S.teacherToken });
    const id = list.body.scores[0].id;
    const r = await call(`/api/scores/${id}`, { method: "PATCH", auth: S.teacherToken, body: { score: 30 } });
    expect(r.status).toBe(200);
    await waitFor(async () => {
      const l = await call("/api/student/notifications", { auth: asStudent(5002) });
      return l.body.items.find((x: Json) => x.type === "score_updated");
    });
    const audit = await call(`/api/audit?entityType=score&entityId=${id}`, { auth: S.ceoToken });
    expect(audit.body[0].action).toBe("score.updated");
  });
});

describe("notification centre", () => {
  it("paginates with a cursor and tracks unread", async () => {
    const page1 = await call("/api/student/notifications?limit=2", { auth: asStudent(5002) });
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();
    const page2 = await call(`/api/student/notifications?limit=2&cursor=${page1.body.nextCursor}`, { auth: asStudent(5002) });
    const ids = new Set([...page1.body.items, ...page2.body.items].map((x: Json) => x.id));
    expect(ids.size).toBe(page1.body.items.length + page2.body.items.length); // no overlap
    expect(page1.body.unread).toBeGreaterThan(0);

    const one = await call(`/api/student/notifications/${page1.body.items[0].id}/read`, { method: "POST", auth: asStudent(5002) });
    expect(one.body.unread).toBe(page1.body.unread - 1);
    const all = await call("/api/student/notifications/read-all", { method: "POST", auth: asStudent(5002) });
    expect(all.body.unread).toBe(0);
  });

  it("honours opt-outs but not for mandatory notices", async () => {
    const put = await call("/api/student/settings", { method: "PUT", auth: asStudent(5001), body: { disabled: ["scores"] } });
    expect(put.status).toBe(200);
    const { createNotification } = await import("../server/notifications/service");
    expect(await createNotification({ studentId: S.alice, type: "score_added", params: {} })).toBeNull();
    const mandatory = await createNotification({ studentId: S.alice, type: "payment_overdue", params: { dueDate: "2026-09-01" } });
    expect(mandatory).not.toBeNull();
    // Dedupe: the same key twice creates one row.
    const a = await createNotification({ studentId: S.alice, type: "debt_reminder", params: { balance: 1 }, dedupeKey: "t:dedupe" });
    const b = await createNotification({ studentId: S.alice, type: "debt_reminder", params: { balance: 1 }, dedupeKey: "t:dedupe" });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });

  it("a blocked bot marks the account unreachable instead of retrying forever", async () => {
    tg.fail = "blocked";
    const { createNotification } = await import("../server/notifications/service");
    await createNotification({ studentId: S.alice, type: "announcement", params: { title: "Hi", body: "x", kind: "general" } });
    const { processQueue } = await import("../server/notifications/queue");
    const { db } = await import("../server/db");
    const { studentTelegramAccounts } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    // A run may already be in flight (debounced kick) — wait for the outcome.
    const acc = await waitFor(async () => {
      await processQueue(1000);
      const [a] = await db.select().from(studentTelegramAccounts).where(eq(studentTelegramAccounts.telegramUserId, 5001));
      return a.botBlocked ? a : null;
    });
    tg.fail = null;
    expect(acc.botBlocked).toBe(true);
  });
});

describe("staff preview of the portal", () => {
  it("CEO can view a student's portal read-only", async () => {
    const h = { "X-Portal-Student": S.carol };
    const me = await call("/api/student/me", { auth: S.ceoToken, headers: h });
    expect(me.status).toBe(200);
    expect(me.body.student.id).toBe(S.carol);
    expect(me.body.preview.by).toBe("Boss CEO");
    const write = await call("/api/student/notifications/read-all", { method: "POST", auth: S.ceoToken, headers: h });
    expect(write.status).toBe(403);
  });

  it("a teacher cannot preview", async () => {
    const r = await call("/api/student/me", { auth: S.teacherToken, headers: { "X-Portal-Student": S.alice } });
    expect(r.status).toBe(403);
  });
});

describe("telegram linking", () => {
  it("staff generate a one-time code; it links once and only once", async () => {
    const gen = await call(`/api/students/${S.carol}/telegram/code`, { method: "POST", auth: S.teacher2Token });
    expect(gen.status).toBe(201);
    expect(gen.body.deepLink).toBe(`https://t.me/flex_test_bot?start=link_${gen.body.code}`);
    // Teacher 1 doesn't teach Carol → can't issue codes for her.
    expect((await call(`/api/students/${S.carol}/telegram/code`, { method: "POST", auth: S.teacherToken })).status).toBe(403);

    const link = await import("../server/services/telegram-link");
    // Wrong student selected in the bot → generic invalid code.
    await expect(link.redeemLinkCode(gen.body.formatted, { id: 6001 }, S.alice)).rejects.toMatchObject({ code: "invalid_code" });
    const acc = await link.redeemLinkCode(gen.body.formatted.toLowerCase(), { id: 6001, username: "carol" }, S.carol);
    expect(acc.studentId).toBe(S.carol);
    await expect(link.redeemLinkCode(gen.body.code, { id: 6002 })).rejects.toMatchObject({ code: "invalid_code" });

    const me = await call("/api/student/me", { auth: asStudent(6001) });
    expect(me.body.student.id).toBe(S.carol);
  });

  it("refuses staff accounts", async () => {
    const link = await import("../server/services/telegram-link");
    await expect(link.linkAccount(S.alice, { id: 1003 }, "phone")).rejects.toMatchObject({ code: "staff_account" });
  });

  it("one Telegram account can hold several groups and switch between them", async () => {
    const link = await import("../server/services/telegram-link");
    // Telegram 6001 (Carol, SAT) also verifies a second record → two groups.
    await link.linkAccount(S.alice, { id: 6001 }, "code");
    const me = await call("/api/student/me", { auth: asStudent(6001) });
    expect(me.body.profiles.map((p: Json) => p.groupName).sort()).toEqual(["IELTS 18:00", "SAT"]);
    // Default = first linked; X-Student-Id switches to another OWN record.
    expect(me.body.student.id).toBe(S.carol);
    const switched = await call("/api/student/me", { auth: asStudent(6001), headers: { "X-Student-Id": S.alice } });
    expect(switched.body.student.id).toBe(S.alice);
    // …but never to a record this Telegram account isn't linked to.
    const other = await call("/api/student/payments", { auth: asStudent(6001), headers: { "X-Student-Id": S.bob } });
    expect(other.status).toBe(403);
    expect(other.body.error).toBe("profile_not_linked");
    // Linking the same record twice is a no-op, not a duplicate.
    const again = await link.linkAccount(S.alice, { id: 6001 }, "code");
    expect(again.studentId).toBe(S.alice);
  });

  it("messages say which group they are about when linked to several", async () => {
    tg.sent.length = 0;
    const { createNotification } = await import("../server/notifications/service");
    await createNotification({ studentId: S.carol, type: "debt_reminder", params: { balance: 10, currency: "UZS" } });
    const { processQueue } = await import("../server/notifications/queue");
    const msg = await waitFor(async () => {
      await processQueue(1000);
      return tg.sent.find((m) => m.chatId === 6001);
    });
    expect(msg.text).toContain("<i>SAT</i>");
  });

  it("verifying one group also links the same person's other groups", async () => {
    const storage = await import("../server/storage");
    const link = await import("../server/services/telegram-link");
    const cls = await storage.getClassById(S.classB);
    // Alice also studies SAT: a second record with the same name + phone.
    const aliceSat = await storage.createStudent({
      fullName: "Rahimov  Alice",
      phone: "901112233",
      classId: cls!.id,
      branchId: cls!.branchId,
      enrolledAt: "2026-01-10",
    });
    const linked = await link.linkWithOtherGroups(S.alice, { id: 8001 }, "phone");
    expect(linked.map((a) => a.studentId).sort()).toEqual([S.alice, aliceSat.id].sort());
    // Bob shares nothing with Alice → not linked along.
    expect(linked.some((a) => a.studentId === S.bob)).toBe(false);
  });

  it("rate-limits repeated wrong codes", async () => {
    const link = await import("../server/services/telegram-link");
    for (let i = 0; i < 5; i++) {
      await expect(link.redeemLinkCode("ZZZZZZZZ", { id: 7001 })).rejects.toMatchObject({ code: "invalid_code" });
    }
    await expect(link.redeemLinkCode("ZZZZZZZZ", { id: 7001 })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("student can unlink themselves", async () => {
    const r = await call("/api/student/unlink", { method: "POST", auth: asStudent(6001) });
    expect(r.status).toBe(200);
    expect((await call("/api/student/me", { auth: asStudent(6001) })).status).toBe(403);
  });
});

describe("scheduler", () => {
  it("sends lesson reminders once per lesson (deduped)", async () => {
    const { runLessonReminders } = await import("../server/notifications/scheduler");
    const { tashkentInstant, tashkentDate, addDaysIso } = await import("@shared/lesson-schedule");
    // 2h before tomorrow's 18:00 lesson.
    const at = new Date(tashkentInstant(addDaysIso(tashkentDate(), 1), "18:00").getTime() - 2 * 3600_000);
    const first = await runLessonReminders(at);
    expect(first).toBe(2); // Alice + Bob (Carol's group has no schedule)
    expect(await runLessonReminders(at)).toBe(0);
  });

  it("cancelling a lesson notifies the group and suppresses its reminders", async () => {
    const { tashkentInstant, tashkentDate, addDaysIso } = await import("@shared/lesson-schedule");
    const day = addDaysIso(tashkentDate(), 2);
    const r = await call(`/api/groups/${S.classA}/lessons/cancel`, {
      method: "POST",
      auth: S.teacherToken,
      body: { date: day, reason: "Holiday" },
    });
    expect(r.status).toBe(200);
    await waitFor(async () => {
      const l = await call("/api/student/notifications", { auth: asStudent(5002) });
      return l.body.items.find((x: Json) => x.type === "lesson_cancelled");
    });
    const { runLessonReminders } = await import("../server/notifications/scheduler");
    const at = new Date(tashkentInstant(day, "18:00").getTime() - 2 * 3600_000);
    expect(await runLessonReminders(at)).toBe(0);
  });

  it("daily job: overdue + debt reminders are deduped per period", async () => {
    const { runDailyStudentJobs } = await import("../server/notifications/scheduler");
    const { recomputeStatuses } = await import("../server/services/billing");
    await recomputeStatuses();
    const first = await runDailyStudentJobs();
    expect(first.debt_reminder).toBe(1); // Bob's 200,000 partial balance
    const second = await runDailyStudentJobs();
    expect(second.debt_reminder ?? 0).toBe(0);
  });
});
