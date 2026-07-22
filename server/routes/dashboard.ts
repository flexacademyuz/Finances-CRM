import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import { db } from "../db";
import { payments, students, classes, users, teachers } from "@shared/schema";
import { monthKey, normalizeMonth, recentMonths, monthLabel } from "@shared/date";
import { payrollForMonth } from "../services/salary";
import { recomputeStatuses } from "../services/billing";
import { getSettings, updateSettings, listStudents } from "../storage";
import { settingsSchema } from "@shared/schema";

const router = Router();

/** Revenue (cash/online) for a month over non-voided payments. */
async function revenueForMonth(month: string) {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${payments.amount}), 0)`,
      cash: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.method} = 'cash'), 0)`,
      online: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.method} = 'online'), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(payments)
    .where(and(eq(payments.billingMonth, month), eq(payments.voided, false)));
  return {
    total: Number(row?.total ?? 0),
    cash: Number(row?.cash ?? 0),
    online: Number(row?.online ?? 0),
    count: Number(row?.count ?? 0),
  };
}

/**
 * GET /api/dashboard — center-wide overview for the CEO (spec §3.5):
 * revenue this month (cash vs online), student counts by status, total
 * students, payroll obligation, and a 6-month revenue trend.
 */
router.get(
  "/dashboard",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const month = typeof req.query.month === "string" ? normalizeMonth(req.query.month) : monthKey();

    const [revenue, statusRows, totalsRow, payroll] = await Promise.all([
      revenueForMonth(month),
      db
        .select({ status: students.status, n: sql<number>`count(*)` })
        .from(students)
        .where(eq(students.active, true))
        .groupBy(students.status),
      db
        .select({
          students: sql<number>`count(*) filter (where ${students.active})`,
        })
        .from(students),
      payrollForMonth(month),
    ]);

    const statusCounts = { paid: 0, awaiting_payment: 0, overdue: 0, frozen: 0 };
    for (const r of statusRows) statusCounts[r.status] = Number(r.n);

    const trend = await Promise.all(
      recentMonths(6, month).map(async (m) => ({
        month: m,
        label: monthLabel(m),
        ...(await revenueForMonth(m)),
      })),
    );

    res.json({
      month,
      revenue,
      statusCounts,
      totalStudents: Number(totalsRow[0]?.students ?? 0),
      payrollObligation: payroll.total,
      trend,
    });
  }),
);

/**
 * GET /api/dashboard/breakdown — per-class and per-teacher revenue for a month.
 */
router.get(
  "/dashboard/breakdown",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const month = typeof req.query.month === "string" ? normalizeMonth(req.query.month) : monthKey();

    const perClass = await db
      .select({
        classId: classes.id,
        className: classes.name,
        teacherId: classes.teacherId,
        revenue: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.voided} = false and ${payments.billingMonth} = ${month}), 0)`,
        paidStudents: sql<number>`count(distinct ${payments.studentId}) filter (where ${payments.voided} = false and ${payments.billingMonth} = ${month})`,
      })
      .from(classes)
      .leftJoin(payments, eq(payments.classId, classes.id))
      .groupBy(classes.id, classes.name, classes.teacherId)
      .orderBy(classes.name);

    const perTeacher = await db
      .select({
        teacherId: teachers.id,
        name: users.fullName,
        revenue: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.voided} = false and ${payments.billingMonth} = ${month}), 0)`,
      })
      .from(teachers)
      .innerJoin(users, eq(teachers.userId, users.id))
      .leftJoin(payments, eq(payments.teacherId, teachers.id))
      .groupBy(teachers.id, users.fullName)
      .orderBy(users.fullName);

    res.json({
      month,
      perClass: perClass.map((c) => ({ ...c, revenue: Number(c.revenue) })),
      perTeacher: perTeacher.map((t) => ({ ...t, revenue: Number(t.revenue) })),
    });
  }),
);

/**
 * GET /api/awaiting — the dedicated Awaiting Payment / Overdue list for CEO &
 * Accountant, filterable by class/teacher and sortable client-side (spec §3.3).
 * Recomputes statuses first so the list reflects the current date.
 */
router.get(
  "/awaiting",
  requireRole("ceo", "accountant"),
  asyncHandler(async (req, res) => {
    await recomputeStatuses();
    const all = await listStudents({ activeOnly: true });
    // Frozen students are excused — they don't belong in the awaiting/overdue list.
    const filtered = all.filter((s) => s.status !== "paid" && s.status !== "frozen");
    const { classId, teacherId } = req.query;
    const scoped = filtered.filter(
      (s) =>
        (typeof classId !== "string" || s.classId === classId) &&
        (typeof teacherId !== "string" || s.teacherId === teacherId),
    );
    res.json(scoped);
  }),
);

/**
 * GET /api/reports/payments.csv — exportable payments report (spec §3.5).
 */
router.get(
  "/reports/payments.csv",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const month = typeof req.query.month === "string" ? normalizeMonth(req.query.month) : undefined;
    const rows = await db
      .select({
        createdAt: payments.createdAt,
        billingMonth: payments.billingMonth,
        student: students.fullName,
        className: classes.name,
        teacher: users.fullName,
        amount: payments.amount,
        method: payments.method,
        voided: payments.voided,
        recorder: sql<string>`(select full_name from ${users} u2 where u2.id = ${payments.recordedBy})`,
      })
      .from(payments)
      .innerJoin(students, eq(payments.studentId, students.id))
      .innerJoin(classes, eq(payments.classId, classes.id))
      .innerJoin(teachers, eq(payments.teacherId, teachers.id))
      .innerJoin(users, eq(teachers.userId, users.id))
      .where(month ? eq(payments.billingMonth, month) : undefined)
      .orderBy(payments.createdAt);

    const header = [
      "recorded_at",
      "billing_month",
      "student",
      "class",
      "teacher",
      "amount",
      "method",
      "voided",
      "recorded_by",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.createdAt?.toISOString?.() ?? r.createdAt,
          r.billingMonth,
          r.student,
          r.className,
          r.teacher,
          r.amount,
          r.method,
          r.voided,
          r.recorder,
        ]
          .map(escape)
          .join(","),
      ),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payments${month ? "-" + month : ""}.csv"`,
    );
    res.send(lines.join("\n"));
  }),
);

/* ── Settings (CEO-only): grace period & currency ─────────────────────── */

router.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    res.json(await getSettings());
  }),
);

router.patch(
  "/settings",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const patch = settingsSchema.parse(req.body);
    res.json(await updateSettings(patch));
  }),
);

/** POST /api/billing/recompute — force a status recompute (CEO-only). */
router.post(
  "/billing/recompute",
  requireRole("ceo"),
  asyncHandler(async (_req, res) => {
    const bucket = await recomputeStatuses();
    res.json({
      paid: bucket.paid.length,
      awaiting: bucket.awaiting.length,
      overdue: bucket.overdue.length,
    });
  }),
);

export default router;
