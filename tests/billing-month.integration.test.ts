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

describe("repair of payments filed under the calendar month", () => {
  it("moves them back to the month they paid for, once, with an audit trail", async () => {
    // What the old code did: 2 Oct → "October", then 10 Oct → "November".
    const [a] = await pay("2026-10-01", "2026-10-02T09:00:00Z");
    const [b] = await pay("2026-11-01", "2026-10-10T09:00:00Z");
    const preview = await M.billing.repairBillingMonths({ apply: false });
    expect(preview.map((x: { from: string; to: string }) => `${x.from}>${x.to}`)).toEqual(["2026-10-01>2026-09-01", "2026-11-01>2026-10-01"]);
    expect(await M.billing.repairBillingMonthsOnce()).toBe(2);
    const rows = await M.db.select().from(M.schema.payments).where(M.eq(M.schema.payments.studentId, S.student));
    expect(rows.find((r: { id: string }) => r.id === a.id).billingMonth).toBe("2026-09-01");
    expect(rows.find((r: { id: string }) => r.id === b.id).billingMonth).toBe("2026-10-01");
    const audits = await M.db.select().from(M.schema.auditLogs).where(M.eq(M.schema.auditLogs.action, "payment.month_relabelled"));
    expect(audits).toHaveLength(2);
    // Runs only once, and nothing is left to fix anyway.
    expect(await M.billing.repairBillingMonthsOnce()).toBe(0);
    expect(await M.billing.repairBillingMonths({ apply: false })).toEqual([]);
    // Next payment after 4 Nov coverage: November.
    expect(await M.storage.nextUnpaidBillingMonth(S.student, new Date("2026-11-01T09:00:00Z"))).toBe("2026-11-01");
  });
});
