import { Router } from "express";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import { can } from "@shared/permissions";
import {
  listTeachers,
  listSalaryHistory,
  getTeacherById,
  createAdvance,
  listAdvances,
  listPayouts,
} from "../storage";
import {
  estimateSalary,
  salaryCycle,
  monthlySalary,
  salaryMonths,
  recordMonthlyPayout,
  payrollMonthView,
} from "../services/salary";
import { monthKey, normalizeMonth } from "@shared/date";
import { createAdvanceSchema, createPayoutSchema } from "@shared/schema";

const router = Router();

/**
 * Resolve which teacher a request is about: a teacher sees only themselves; a
 * CEO may target any teacher via ?teacherId (or body.teacherId). Returns
 * undefined when unresolved so the caller can 400/404.
 */
function resolveTeacherId(req: import("express").Request, fromBody = false): string | undefined {
  if (req.authUser!.role === "teacher") return req.teacherId;
  const source = fromBody ? req.body?.teacherId : req.query.teacherId;
  return typeof source === "string" ? source : undefined;
}

/**
 * GET /api/teachers — active teacher list. Needed to pick a teacher/class when
 * recording a payment and to show teacher names on the Groups screen, so it's
 * open to anyone the CEO has granted those abilities — not just CEO/Accountant.
 * Salary figures are stripped for callers who aren't CEO/Accountant, so a
 * granted teacher never sees a colleague's pay.
 */
router.get(
  "/teachers",
  asyncHandler(async (req, res) => {
    const u = req.authUser!;
    const privileged = u.role === "ceo" || u.role === "accountant";
    const allowed =
      privileged || can(u, "record_payment") || can(u, "add_group") || can(u, "edit_group");
    if (!allowed) {
      return res.status(403).json({ error: "forbidden", message: "Insufficient permission." });
    }
    const rows = await listTeachers(true);
    // Hide pay details from non-finance callers.
    res.json(
      privileged
        ? rows
        : rows.map(({ salaryModel: _sm, salaryValue: _sv, ...rest }) => rest),
    );
  }),
);

/**
 * GET /api/salary/me — a teacher's own estimated salary for a month, with the
 * per-class breakdown (spec §3.4). CEO may pass ?teacherId to view any teacher.
 */
router.get(
  "/salary/me",
  asyncHandler(async (req, res) => {
    const month = typeof req.query.month === "string" ? normalizeMonth(req.query.month) : monthKey();

    let teacherId: string | undefined;
    if (req.authUser!.role === "teacher") {
      teacherId = req.teacherId;
    } else if (req.authUser!.role === "ceo" && typeof req.query.teacherId === "string") {
      teacherId = req.query.teacherId;
    } else {
      return res.status(400).json({ error: "bad_request", message: "teacherId required" });
    }
    if (!teacherId) return res.status(404).json({ error: "not_found", message: "No teacher profile" });

    res.json(await estimateSalary(teacherId, month));
  }),
);

/** GET /api/salary/history — snapshots/estimates by past months. */
router.get(
  "/salary/history",
  asyncHandler(async (req, res) => {
    let teacherId: string | undefined;
    if (req.authUser!.role === "teacher") teacherId = req.teacherId;
    else if (typeof req.query.teacherId === "string") teacherId = req.query.teacherId;
    if (!teacherId) return res.status(400).json({ error: "bad_request", message: "teacherId required" });

    const teacher = await getTeacherById(teacherId);
    if (!teacher) return res.status(404).json({ error: "not_found" });
    res.json(await listSalaryHistory(teacherId));
  }),
);

/**
 * GET /api/salary/cycle — a teacher's live salary cycle (earned since last
 * payout, open advances, net owed). Teacher sees own; CEO may pass ?teacherId.
 */
router.get(
  "/salary/cycle",
  asyncHandler(async (req, res) => {
    const teacherId = resolveTeacherId(req);
    if (!teacherId) return res.status(400).json({ error: "bad_request", message: "teacherId required" });
    res.json(await salaryCycle(teacherId));
  }),
);

/**
 * GET /api/salary/month?month=&teacherId= — one month's salary for a teacher:
 * the amount, the per-class and per-student justification, and whether it's paid.
 */
router.get(
  "/salary/month",
  asyncHandler(async (req, res) => {
    const teacherId = resolveTeacherId(req);
    if (!teacherId) return res.status(400).json({ error: "bad_request", message: "teacherId required" });
    const month = typeof req.query.month === "string" ? normalizeMonth(req.query.month) : monthKey();
    res.json(await monthlySalary(teacherId, month));
  }),
);

/** GET /api/salary/months?teacherId=&count= — the teacher's monthly salary table. */
router.get(
  "/salary/months",
  asyncHandler(async (req, res) => {
    const teacherId = resolveTeacherId(req);
    if (!teacherId) return res.status(400).json({ error: "bad_request", message: "teacherId required" });
    const count = req.query.count ? Math.min(Math.max(Number(req.query.count), 1), 24) : 12;
    res.json(await salaryMonths(teacherId, count));
  }),
);

/** GET /api/salary/payouts — a teacher's salary payment history. */
router.get(
  "/salary/payouts",
  asyncHandler(async (req, res) => {
    const teacherId = resolveTeacherId(req);
    if (!teacherId) return res.status(400).json({ error: "bad_request", message: "teacherId required" });
    res.json(await listPayouts(teacherId));
  }),
);

/**
 * POST /api/salary/payout — pay a teacher for one month (CEO). Closes that month
 * (one payout per month) and snapshots the student justification.
 */
router.post(
  "/salary/payout",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const input = createPayoutSchema.parse(req.body);
    const teacher = await getTeacherById(input.teacherId);
    if (!teacher) return res.status(404).json({ error: "not_found", message: "Teacher not found" });
    try {
      const payout = await recordMonthlyPayout(input.teacherId, {
        month: normalizeMonth(input.month),
        amount: input.amount,
        method: input.method ?? "cash",
        paidOn: input.paidOn ?? new Date().toISOString().slice(0, 10),
        note: input.note ?? null,
        createdBy: req.authUser!.id,
      });
      res.status(201).json(payout);
    } catch (err) {
      if ((err as Error).message === "already_paid") {
        return res.status(409).json({
          error: "already_paid",
          message: "This teacher's salary for that month has already been paid.",
        });
      }
      throw err;
    }
  }),
);

/** GET /api/advances — a teacher's advance history (teacher self / CEO). */
router.get(
  "/advances",
  asyncHandler(async (req, res) => {
    const teacherId = resolveTeacherId(req);
    if (!teacherId) return res.status(400).json({ error: "bad_request", message: "teacherId required" });
    res.json(await listAdvances(teacherId));
  }),
);

/** POST /api/advances — hand a teacher money against future salary (CEO). */
router.post(
  "/advances",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const input = createAdvanceSchema.parse(req.body);
    const teacher = await getTeacherById(input.teacherId);
    if (!teacher) return res.status(404).json({ error: "not_found", message: "Teacher not found" });
    const advance = await createAdvance({
      teacherId: input.teacherId,
      amount: input.amount,
      method: input.method ?? "cash",
      paidOn: input.paidOn ?? new Date().toISOString().slice(0, 10),
      note: input.note ?? null,
      createdBy: req.authUser!.id,
    });
    res.status(201).json(advance);
  }),
);

/**
 * GET /api/salary/payroll?month= — payroll for a month (CEO): each teacher's
 * salary for that month and whether it has been paid. Defaults to this month.
 */
router.get(
  "/salary/payroll",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const month = typeof req.query.month === "string" ? normalizeMonth(req.query.month) : monthKey();
    const payroll = await payrollMonthView(month);
    const teachers = await listTeachers();
    const byId = new Map(teachers.map((t) => [t.id, t]));
    res.json({
      month: payroll.month,
      total: payroll.total,
      teachers: payroll.perTeacher.map((p) => ({
        teacherId: p.teacherId,
        name: byId.get(p.teacherId)?.fullName ?? "—",
        salaryModel: p.salaryModel,
        salaryValue: p.salaryValue,
        collectedTotal: p.collectedTotal,
        paidStudents: p.paidStudents,
        earned: p.estimatedSalary,
        advancesTotal: p.advancesTotal,
        netOwed: p.netOwed,
        paid: p.paid,
        paidAmount: p.paidAmount,
      })),
    });
  }),
);

export default router;
