import { Router } from "express";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import { listTeachers, listSalaryHistory, getTeacherById } from "../storage";
import { estimateSalary, payrollForMonth } from "../services/salary";
import { monthKey, normalizeMonth } from "@shared/date";

const router = Router();

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

/** GET /api/salary/payroll — aggregate payroll obligation (CEO-only). */
router.get(
  "/salary/payroll",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const month = typeof req.query.month === "string" ? normalizeMonth(req.query.month) : monthKey();
    const payroll = await payrollForMonth(month);
    const teachers = await listTeachers();
    const byId = new Map(teachers.map((t) => [t.id, t]));
    res.json({
      month: payroll.month,
      total: payroll.total,
      teachers: payroll.perTeacher.map((p) => ({
        teacherId: p.teacherId,
        name: byId.get(p.teacherId)?.fullName ?? "—",
        salaryModel: p.est.salaryModel,
        salaryValue: p.est.salaryValue,
        collectedTotal: p.est.collectedTotal,
        paidStudents: p.est.paidStudents,
        estimatedSalary: p.estimatedSalary,
      })),
    });
  }),
);

export default router;
