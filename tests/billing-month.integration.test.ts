/**
 * Billing month against a real Postgres (PGlite): the month a new payment is
 * filed under, and the one-time repair of payments filed under the calendar
 * month instead of the period they paid for.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("../server/bot/client", async () => ({
  bot: null,
  sendMessage: async () => undefined,
  getChatTitle: async () => null,
  botUsername: async () => null,
}));

let pgServer: { stop(): Promise<void> };
let pgDb: { close(): Promise<void> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let M: any;
const S = {} as { student: string; class: string; teacher: string; user: string; branch: string };

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
  process.env.SESSION_SECRET = "test-secret";
  const { runMigrations } = await import("../server/migrate");
  await runMigrations();
  const storage = await import("../server/storage");
  const { db } = await import("../server/db");
  const schema = await import("@shared/schema");
  const billing = await import("../server/services/billing");
  const { eq } = await import("drizzle-orm");
  M = { storage, db, schema, billing, eq };
  await storage.ensureSettings({ gracePeriodDays: 5, currency: "UZS" });
  const u = await storage.createUser({ telegramId: 3001, fullName: "Nizomjon Teacher", role: "teacher" });
  const t = await storage.getTeacherByUserId(u.id);
  const cls = await storage.createClass({ name: "NT-110", teacherId: t!.id, branchId: schema.DEFAULT_BRANCH_ID, defaultFee: 400000 });
  const st = await storage.createStudent({ fullName: "Sultonaliyeva Shabnam", classId: cls.id, branchId: cls.branchId, enrolledAt: "2026-09-04" });
  Object.assign(S, { student: st.id, class: cls.id, teacher: t!.id, user: u.id, branch: cls.branchId });
}, 120_000);

afterAll(async () => {
  const { pool } = await import("../server/db");
  await pool.end().catch(() => undefined);
  await pgServer?.stop().catch(() => undefined);
  await pgDb?.close().catch(() => undefined);
});

const pay = (month: string, createdAt: string) =>
  M.db
    .insert(M.schema.payments)
    .values({
      studentId: S.student,
      classId: S.class,
      branchId: S.branch,
      teacherId: S.teacher,
      recordedBy: S.user,
      amount: "400000",
      amountDue: "400000",
      method: "online",
      billingMonth: month,
      createdAt: new Date(createdAt),
    })
    .returning();

describe("billing month of a new payment", () => {
  it("an overdue student (started 4 Sep) paying on 2 Oct pays for September", async () => {
    expect(await M.storage.nextUnpaidBillingMonth(S.student, new Date("2026-10-02T09:00:00Z"))).toBe("2026-09-01");
  });
});

describe("undo of the 2026-10-02 billing month repair", () => {
  it("puts every moved payment back, lifts pre-September months, flags conflicts, runs once", async () => {
    // Late-August starter: the repair moved Sep → Aug and Oct → Sep.
    const st = await M.storage.createStudent({ fullName: "Dilmurodjonov M", classId: S.class, branchId: S.branch, enrolledAt: "2026-08-30" });
    const mk = (studentId: string, month: string, createdAt: string) =>
      M.db
        .insert(M.schema.payments)
        .values({ studentId, classId: S.class, branchId: S.branch, teacherId: S.teacher, recordedBy: S.user, amount: "400000", amountDue: "400000", method: "cash", billingMonth: month, createdAt: new Date(createdAt) })
        .returning()
        .then((r: { id: string }[]) => r[0]);
    const moved = (id: string, studentId: string, from: string, to: string) =>
      M.db.insert(M.schema.auditLogs).values({ actorType: "system", action: "payment.month_relabelled", entityType: "payment", entityId: id, studentId, before: { billingMonth: from }, after: { billingMonth: to } });
    // Applied in the repair's order: earliest first.
    const sep = await mk(st.id, "2026-08-01", "2026-09-28T09:00:00Z");
    await moved(sep.id, st.id, "2026-09-01", "2026-08-01");
    const oct = await mk(st.id, "2026-09-01", "2026-10-01T09:00:00Z");
    await moved(oct.id, st.id, "2026-10-01", "2026-09-01");

    // Conflict: after the move staff re-recorded October → the move can't be undone.
    const st2 = await M.storage.createStudent({ fullName: "Conflict Student", classId: S.class, branchId: S.branch, enrolledAt: "2026-09-20" });
    const c1 = await mk(st2.id, "2026-09-01", "2026-10-01T09:00:00Z");
    await moved(c1.id, st2.id, "2026-10-01", "2026-09-01");
    await mk(st2.id, "2026-10-01", "2026-10-02T09:00:00Z");

    // A stray August payment that the repair didn't log (e.g. recorded today by the new picker).
    const st3 = await M.storage.createStudent({ fullName: "Stray August", classId: S.class, branchId: S.branch, enrolledAt: "2026-08-25" });
    const stray = await mk(st3.id, "2026-08-01", "2026-10-02T09:00:00Z");

    const r = await M.billing.undoBillingMonthRepair();
    expect(r.restored).toHaveLength(2);
    expect(r.conflicts.map((c: { paymentId: string }) => c.paymentId)).toEqual([c1.id]);
    expect(r.lifted.map((c: { paymentId: string; to: string }) => [c.paymentId, c.to])).toEqual([[stray.id, "2026-09-01"]]);
    const month = async (id: string) =>
      (await M.db.select().from(M.schema.payments).where(M.eq(M.schema.payments.id, id)))[0].billingMonth;
    expect(await month(sep.id)).toBe("2026-09-01");
    expect(await month(oct.id)).toBe("2026-10-01");
    expect(await month(c1.id)).toBe("2026-09-01");

    // Once only.
    await M.billing.undoBillingMonthRepairOnce();
    const marks = await M.db.select().from(M.schema.auditLogs).where(M.eq(M.schema.auditLogs.action, "billing.month_repair_undo_v1"));
    expect(marks).toHaveLength(1);
    expect(await M.billing.undoBillingMonthRepairOnce()).toBe(0);
    expect(await month(sep.id)).toBe("2026-09-01");
  });

  it("never files a new payment before September 2026", async () => {
    const st = await M.storage.createStudent({ fullName: "August Starter", classId: S.class, branchId: S.branch, enrolledAt: "2026-08-10" });
    expect(await M.storage.nextUnpaidBillingMonth(st.id, new Date("2026-09-05T09:00:00Z"))).toBe("2026-09-01");
  });
});
