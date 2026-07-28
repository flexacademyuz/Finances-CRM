import { Router } from "express";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import {
  listTeachers,
  listSalaryHistory,
  getTeacherById,
  createAdvance,
  listAdvances,
  listPayouts,
} from "../storage";
import { estimateSalary, salaryCycle, recordPayout, payrollNow } from "../services/salary";
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
 * GET /api/teachers — active teacher list.
 * Available to CEO and Accountant (Accountant selects a teacher first when
 * recording a payment, per spec §3.2).
 */
router.get(
  "/teachers",
  requireRole("ceo", "accountant"),
  asyncHandler(async (_req, res) => {
    res.json(await listTeachers(true));
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

/** GET /api/salary/payouts — a teacher's salary payment history. */
router.get(
  "/salary/payouts",
  asyncHandler(async (req, res) => {
    const teacherId = resolveTeacherId(req);
    if (!teacherId) return res.status(400).json({ error: "bad_request", message: "teacherId required" });
    res.json(await listPayouts(teacherId));
  }),
);

/** POST /api/salary/payout — record a salary payment, settling the cycle (CEO). */
router.post(
  "/salary/payout",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const input = createPayoutSchema.parse(req.body);
    const teacher = await getTeacherById(input.teacherId);
    if (!teacher) return res.status(404).json({ error: "not_found", message: "Teacher not found" });
    const payout = await recordPayout(input.teacherId, {
      amount: input.amount,
      method: input.method ?? "cash",
      paidOn: input.paidOn ?? new Date().toISOString().slice(0, 10),
      note: input.note ?? null,
      createdBy: req.authUser!.id,
    });
    res.status(201).json(payout);
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

/** GET /api/salary/payroll — current payroll obligation, cycle-based (CEO). */
router.get(
  "/salary/payroll",
  requireRole("ceo"),
  asyncHandler(async (_req, res) => {
    const payroll = await payrollNow();
    const teachers = await listTeachers();
    const byId = new Map(teachers.map((t) => [t.id, t]));
    res.json({
      total: payroll.total,
      teachers: payroll.perTeacher.map((p) => ({
        teacherId: p.teacherId,
        name: byId.get(p.teacherId)?.fullName ?? "—",
        salaryModel: p.cycle.salaryModel,
        salaryValue: p.cycle.salaryValue,
        collectedTotal: p.cycle.collectedTotal,
        paidStudents: p.cycle.paidStudents,
        earned: p.cycle.earned,
        advancesTotal: p.cycle.advancesTotal,
        netOwed: p.cycle.netOwed,
      })),
    });
  }),
);

export default router;
