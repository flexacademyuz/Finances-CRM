import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import { db } from "../db";
import { payments, students, classes, teachers, users, discounts, paymentFreezes } from "@shared/schema";
import { monthKey, normalizeMonth, monthLabel, shiftMonth, recentMonths } from "@shared/date";
import { estimateSalary } from "../services/salary";
import { expenseMatrix } from "../storage";

const router = Router();

// Analytics is CEO-only (V2 summary permissions).
router.use("/analytics", requireRole("ceo"));

// Daily buckets use the center's local timezone (Tashkent, UTC+5).
const TZ = "Asia/Tashkent";
const localDay = sql`(${payments.createdAt} AT TIME ZONE ${TZ})::date`;

function parseRange(from: unknown, to: unknown) {
  const today = new Date().toISOString().slice(0, 10);
  const toDate = typeof to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today;
  const defFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const fromDate = typeof from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : defFrom;
  return { fromDate, toDate };
}

/** Daily revenue (UTC+5), gap-filled, with cash/online split and count. */
router.get(
  "/analytics/revenue/daily",
  asyncHandler(async (req, res) => {
    const { fromDate, toDate } = parseRange(req.query.from, req.query.to);
    const rows = await db
      .select({
        day: sql<string>`gs::date`,
        total: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.voided} = false), 0)`,
        cash: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.voided} = false and ${payments.method} = 'cash'), 0)`,
        online: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.voided} = false and ${payments.method} = 'online'), 0)`,
        count: sql<number>`count(${payments.id}) filter (where ${payments.voided} = false)`,
      })
      .from(sql`generate_series(${fromDate}::date, ${toDate}::date, '1 day') as gs`)
      .leftJoin(payments, sql`${localDay} = gs::date`)
      .groupBy(sql`gs::date`)
      .orderBy(sql`gs::date`);
    res.json(
      rows.map((r) => ({
        date: r.day,
        total: Number(r.total),
        cash: Number(r.cash),
        online: Number(r.online),
        count: Number(r.count),
      })),
    );
  }),
);

/** Monthly revenue for an academic year (Sep→Aug) with month-over-month %. */
router.get(
  "/analytics/revenue/monthly",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const defStart = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const startYear = req.query.year ? Number(req.query.year) : defStart;
    const months = Array.from({ length: 12 }, (_, i) => shiftMonth(`${startYear}-09-01`, i));

    const rows = await db
      .select({
        month: payments.billingMonth,
        total: sql<string>`coalesce(sum(${payments.amount}), 0)`,
      })
      .from(payments)
      .where(and(eq(payments.voided, false)))
      .groupBy(payments.billingMonth);
    const map = new Map(rows.map((r) => [r.month, Number(r.total)]));

    const data = months.map((m, i) => {
      const total = map.get(m) ?? 0;
      const prev = i > 0 ? map.get(months[i - 1]) ?? 0 : 0;
      const changePct = prev > 0 ? +(((total - prev) / prev) * 100).toFixed(1) : null;
      return { month: m, label: monthLabel(m), total, changePct };
    });
    const avg = data.reduce((a, b) => a + b.total, 0) / (data.length || 1);
    res.json({ startYear, label: `${startYear}–${startYear + 1}`, average: +avg.toFixed(2), data });
  }),
);

/** Revenue per academic year, most recent years compared. */
router.get(
  "/analytics/revenue/yearly",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const curStart = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const years = [curStart - 2, curStart - 1, curStart];
    const out = [];
    for (const y of years) {
      const months = Array.from({ length: 12 }, (_, i) => shiftMonth(`${y}-09-01`, i));
      const [row] = await db
        .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .where(and(eq(payments.voided, false), sql`${payments.billingMonth} = any(${months})`));
      out.push({ startYear: y, label: `${y}–${y + 1}`, total: Number(row?.total ?? 0) });
    }
    const prev = out[out.length - 2]?.total ?? 0;
    const cur = out[out.length - 1]?.total ?? 0;
    const yoyPct = prev > 0 ? +(((cur - prev) / prev) * 100).toFixed(1) : null;
    res.json({ years: out, yoyPct });
  }),
);

/** Daily payment counts + method split + average payment size. */
router.get(
  "/analytics/payments/daily",
  asyncHandler(async (req, res) => {
    const { fromDate, toDate } = parseRange(req.query.from, req.query.to);
    const rows = await db
      .select({
        day: sql<string>`gs::date`,
        count: sql<number>`count(${payments.id}) filter (where ${payments.voided} = false)`,
        cashCount: sql<number>`count(${payments.id}) filter (where ${payments.voided} = false and ${payments.method} = 'cash')`,
        onlineCount: sql<number>`count(${payments.id}) filter (where ${payments.voided} = false and ${payments.method} = 'online')`,
        total: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.voided} = false), 0)`,
      })
      .from(sql`generate_series(${fromDate}::date, ${toDate}::date, '1 day') as gs`)
      .leftJoin(payments, sql`${localDay} = gs::date`)
      .groupBy(sql`gs::date`)
      .orderBy(sql`gs::date`);
    res.json(
      rows.map((r) => ({
        date: r.day,
        count: Number(r.count),
        cashCount: Number(r.cashCount),
        onlineCount: Number(r.onlineCount),
        avgSize: Number(r.count) ? +(Number(r.total) / Number(r.count)).toFixed(0) : 0,
      })),
    );
  }),
);

/** Students overview: enrollments trend, status snapshot, discounts, freezes. */
router.get(
  "/analytics/students/overview",
  asyncHandler(async (_req, res) => {
    const months = recentMonths(12);
    const enrollRows = await db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${students.enrolledAt}), 'YYYY-MM-01')`,
        n: sql<number>`count(*)`,
      })
      .from(students)
      .groupBy(sql`date_trunc('month', ${students.enrolledAt})`);
    const enrollMap = new Map(enrollRows.map((r) => [r.month, Number(r.n)]));
    const enrollments = months.map((m) => ({ month: m, label: monthLabel(m), count: enrollMap.get(m) ?? 0 }));

    const statusRows = await db
      .select({ status: students.status, n: sql<number>`count(*)` })
      .from(students)
      .where(eq(students.active, true))
      .groupBy(students.status);
    const statusCounts: Record<string, number> = { paid: 0, awaiting_payment: 0, overdue: 0, frozen: 0 };
    for (const r of statusRows) statusCounts[r.status] = Number(r.n);

    const activeDiscounts = await db
      .select({
        id: discounts.id,
        student: students.fullName,
        type: discounts.discountType,
        value: discounts.discountValue,
        reason: discounts.reason,
      })
      .from(discounts)
      .innerJoin(students, eq(discounts.studentId, students.id))
      .where(eq(discounts.isActive, true));

    const activeFreezes = await db
      .select({
        id: paymentFreezes.id,
        student: students.fullName,
        freezeFrom: paymentFreezes.freezeFrom,
        freezeTo: paymentFreezes.freezeTo,
        reason: paymentFreezes.reason,
      })
      .from(paymentFreezes)
      .innerJoin(students, eq(paymentFreezes.studentId, students.id))
      .where(eq(paymentFreezes.status, "active"));

    res.json({
      enrollments,
      statusCounts,
      discounts: activeDiscounts.map((d) => ({ ...d, value: Number(d.value) })),
      freezes: activeFreezes,
    });
  }),
);

/** Revenue + student count + paid-rate per group (current month). */
router.get(
  "/analytics/groups/revenue",
  asyncHandler(async (req, res) => {
    const month = typeof req.query.month === "string" ? normalizeMonth(req.query.month) : monthKey();
    const rows = await db
      .select({
        groupId: classes.id,
        name: classes.name,
        revenue: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.voided} = false and ${payments.billingMonth} = ${month}), 0)`,
        studentCount: sql<number>`(select count(*) from ${students} s where s.class_id = ${classes.id} and s.active = true)`,
        paidCount: sql<number>`count(distinct ${payments.studentId}) filter (where ${payments.voided} = false and ${payments.billingMonth} = ${month})`,
      })
      .from(classes)
      .leftJoin(payments, eq(payments.classId, classes.id))
      .groupBy(classes.id, classes.name)
      .orderBy(sql`2`);
    res.json(
      rows
        .map((r) => {
          const studentCount = Number(r.studentCount);
          const paidCount = Number(r.paidCount);
          return {
            groupId: r.groupId,
            name: r.name,
            revenue: Number(r.revenue),
            studentCount,
            paidCount,
            complianceRate: studentCount ? Math.round((paidCount / studentCount) * 100) : 0,
          };
        })
        .sort((a, b) => b.revenue - a.revenue),
    );
  }),
);

/** Revenue attributed + estimated salary + group count per teacher (month). */
router.get(
  "/analytics/teachers/revenue",
  asyncHandler(async (req, res) => {
    const month = typeof req.query.month === "string" ? normalizeMonth(req.query.month) : monthKey();
    const teacherRows = await db
      .select({ id: teachers.id, name: users.fullName })
      .from(teachers)
      .innerJoin(users, eq(teachers.userId, users.id));

    const out = [];
    for (const tRow of teacherRows) {
      const [rev] = await db
        .select({
          revenue: sql<string>`coalesce(sum(${payments.amount}), 0)`,
        })
        .from(payments)
        .where(
          and(
            eq(payments.teacherId, tRow.id),
            eq(payments.voided, false),
            eq(payments.billingMonth, month),
          ),
        );
      const [grp] = await db
        .select({ n: sql<number>`count(*)` })
        .from(classes)
        .where(eq(classes.teacherId, tRow.id));
      const est = await estimateSalary(tRow.id, month);
      const revenue = Number(rev?.revenue ?? 0);
      out.push({
        teacherId: tRow.id,
        name: tRow.name,
        revenue,
        estimatedSalary: est.estimatedSalary,
        salaryRatio: revenue > 0 ? +((est.estimatedSalary / revenue) * 100).toFixed(1) : null,
        groupCount: Number(grp?.n ?? 0),
      });
    }
    res.json(out.sort((a, b) => b.revenue - a.revenue));
  }),
);

/** Monthly expense totals by category for an academic year (analytics Tab 6). */
router.get(
  "/analytics/expenses/monthly",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const defStart = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const startYear = req.query.year ? Number(req.query.year) : defStart;
    const months = Array.from({ length: 12 }, (_, i) => shiftMonth(`${startYear}-09-01`, i));

    const revRows = await db
      .select({ month: payments.billingMonth, total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(eq(payments.voided, false))
      .groupBy(payments.billingMonth);
    const revMap = new Map(revRows.map((r) => [r.month, Number(r.total)]));

    // Expenses summed per month (all categories) for the profit overlay.
    const expRows = await expenseMatrix(months);
    const expMap = new Map<string, number>();
    for (const r of expRows) expMap.set(r.month, (expMap.get(r.month) ?? 0) + Number(r.total));

    res.json({
      startYear,
      label: `${startYear}–${startYear + 1}`,
      data: months.map((m) => {
        const revenue = revMap.get(m) ?? 0;
        const exp = expMap.get(m) ?? 0;
        return { month: m, label: monthLabel(m), revenue, expenses: exp, netProfit: revenue - exp };
      }),
    });
  }),
);

export default router;
