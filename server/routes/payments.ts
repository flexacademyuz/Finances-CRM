import { Router } from "express";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import {
  recordPaymentSchema,
  editPaymentSchema,
  voidPaymentSchema,
} from "@shared/schema";
import {
  listPayments,
  getPaymentById,
  getStudentById,
  getActivePaymentForMonth,
  effectiveFee,
  recordPayment,
  editPayment,
  voidPayment,
  getClassById,
  getTeacherById,
  type PaymentFilter,
} from "../storage";
import { monthKey, normalizeMonth } from "@shared/date";
import { notifyPaymentRecorded } from "../bot/notifications";
import { buildPaymentContext } from "../services/payment-context";

const router = Router();

/**
 * GET /api/payments — history / log.
 *  - CEO: everything (full history, editable).
 *  - Accountant: their own entries by default (?scope=all for the full log).
 *  - Teacher: scoped to their classes.
 */
router.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const filter: PaymentFilter = {};
    const { classId, studentId, billingMonth, scope } = req.query;
    if (typeof classId === "string") filter.classId = classId;
    if (typeof studentId === "string") filter.studentId = studentId;
    if (typeof billingMonth === "string") filter.billingMonth = normalizeMonth(billingMonth);

    const role = req.authUser!.role;
    if (role === "teacher") {
      filter.teacherId = req.teacherId;
    } else if (role === "accountant" && scope !== "all") {
      filter.recordedBy = req.authUser!.id;
    }
    res.json(await listPayments(filter));
  }),
);

/**
 * Preview the default amount for a student (their effective monthly fee) and
 * whether they've already paid this month — used to pre-fill the record form.
 */
router.get(
  "/payments/preview/:studentId",
  requireRole("accountant", "ceo"),
  asyncHandler(async (req, res) => {
    const student = await getStudentById(req.params.studentId);
    if (!student) return res.status(404).json({ error: "not_found" });
    const month = typeof req.query.month === "string" ? normalizeMonth(req.query.month) : monthKey();
    const ctx = await buildPaymentContext(student.id, month);
    res.json({
      studentId: student.id,
      billingMonth: month,
      // Pre-fill with the discounted amount the student should pay.
      defaultAmount: ctx.amountToPay,
      fullTuition: ctx.fullTuition,
      discount: ctx.discount,
      teacherCredit: ctx.teacherCredit,
      alreadyPaid: ctx.alreadyPaid,
      frozen: ctx.frozen,
    });
  }),
);

/**
 * POST /api/payments — Accountant (or CEO) records a payment.
 * Date is auto-assigned server-side; teacher/class are derived from the
 * student's class (spec §3.2). Creates one immutable record and flips the
 * student to "paid" for the month.
 */
router.post(
  "/payments",
  requireRole("accountant", "ceo"),
  asyncHandler(async (req, res) => {
    const input = recordPaymentSchema.parse(req.body);
    const student = await getStudentById(input.studentId);
    if (!student) return res.status(404).json({ error: "not_found", message: "Student not found" });

    const billingMonth = input.billingMonth ? normalizeMonth(input.billingMonth) : monthKey();

    const existing = await getActivePaymentForMonth(student.id, billingMonth);
    if (existing) {
      return res.status(409).json({
        error: "already_paid",
        message: "This student already has a payment for that month. Void it first to re-enter.",
      });
    }

    // Resolve discount + teacher credit for this student/month. The accountant
    // may override `amount`, but full tuition and teacher credit are derived
    // server-side so the teacher's pay stays discount-independent (V2 1C).
    const ctx = await buildPaymentContext(student.id, billingMonth);
    const payment = await recordPayment({
      studentId: student.id,
      amount: input.amount,
      method: input.method,
      billingMonth,
      recordedBy: req.authUser!.id,
      fullTuitionAmount: ctx.fullTuition,
      discountId: ctx.discount?.id ?? null,
      teacherCreditAmount: ctx.teacherCredit,
    });

    // Fire-and-forget notification via the companion bot.
    void notifyPaymentRecorded(payment.id).catch(() => undefined);

    res.status(201).json(payment);
  }),
);

/* ── CEO-only corrections with audit trail (spec §3.2, §7) ─────────────── */

router.patch(
  "/payments/:id",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const { amount, method, reason } = editPaymentSchema.parse(req.body);
    const existing = await getPaymentById(req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    const updated = await editPayment(req.params.id, req.authUser!.id, { amount, method }, reason);
    res.json(updated);
  }),
);

router.post(
  "/payments/:id/void",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const { reason } = voidPaymentSchema.parse(req.body);
    const existing = await getPaymentById(req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    const updated = await voidPayment(req.params.id, req.authUser!.id, reason);
    res.json(updated);
  }),
);

router.get(
  "/payments/:id",
  asyncHandler(async (req, res) => {
    const p = await getPaymentById(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    if (req.authUser!.role === "teacher" && p.teacherId !== req.teacherId) {
      return res.status(403).json({ error: "forbidden" });
    }
    // Include a little context for the detail view.
    const [cls, teacher] = await Promise.all([
      getClassById(p.classId),
      getTeacherById(p.teacherId),
    ]);
    res.json({ ...p, className: cls?.name, teacher });
  }),
);

export default router;
