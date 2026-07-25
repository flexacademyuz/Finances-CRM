import { Router, type Request } from "express";
import { z } from "zod";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import { insertStudentSchema, type StudentStatus } from "@shared/schema";
import {
  listStudents,
  getStudentById,
  createStudent,
  updateStudent,
  stopStudent,
  resumeStudent,
  getClassById,
  effectiveFee,
  listPayments,
  listDiscountsForStudent,
  listFreezesForStudent,
  getSettings,
  type StudentFilter,
} from "../storage";
import { parseDate, fullMonthsBetween, atMidnight, toIso } from "@shared/date";
import { computePaidThrough, decideStudentStatus, elapsedFrozenDays } from "@shared/billing";
import { recomputeStatuses } from "../services/billing";
import { env } from "../env";

const router = Router();

/**
 * GET /api/students/:id/detail — full student profile: start date, billing
 * summary (paid-through, next-due), status, active discounts/freezes, and the
 * complete payment history. Teachers may only view their own class's students.
 */
router.get(
  "/students/:id/detail",
  asyncHandler(async (req, res) => {
    const student = await getStudentById(req.params.id);
    if (!student) return res.status(404).json({ error: "not_found" });
    const cls = await getClassById(student.classId);
    if (req.authUser!.role === "teacher" && cls?.teacherId !== req.teacherId) {
      return res.status(403).json({ error: "forbidden" });
    }

    const [feeVal, payments, discounts, freezes, settings] = await Promise.all([
      effectiveFee(student.id),
      // Voided (accidental) payments are removed from the student's view; they
      // remain in the CEO payments log for audit.
      listPayments({ studentId: student.id, includeVoided: false }),
      listDiscountsForStudent(student.id),
      listFreezesForStudent(student.id),
      getSettings(),
    ]);

    const grace = settings?.gracePeriodDays ?? env.defaultGracePeriodDays;
    const currency = settings?.currency ?? env.defaultCurrency;
    const now = new Date();
    // Billing anchor: resume date if the student stopped and came back, else
    // their enrolment date.
    const anchor = student.billingStartDate ?? student.enrolledAt;
    const start = atMidnight(parseDate(anchor));
    const monthsElapsed = fullMonthsBetween(start, now);
    const active = payments.filter((p) => !p.voided);

    const activeFreezes = freezes.filter((f) => f.status === "active");
    const todayIso = toIso(now);
    const isFrozenNow = activeFreezes.some(
      (f) => todayIso >= f.freezeFrom && (f.freezeTo == null || todayIso <= f.freezeTo),
    );

    const args = {
      startDate: anchor,
      paymentDates: active.map((p) => toIso(new Date(p.createdAt))),
      frozenDays: elapsedFrozenDays(
        activeFreezes.map((f) => ({ from: f.freezeFrom, to: f.freezeTo })),
        start,
        atMidnight(now),
      ),
    };
    const paidThrough = computePaidThrough(args);
    const status = decideStudentStatus({ ...args, today: now, gracePeriodDays: grace, isFrozenNow });

    res.json({
      student: {
        id: student.id,
        fullName: student.fullName,
        phone: student.phone,
        classId: student.classId,
        className: cls?.name ?? null,
        active: student.active,
      },
      billing: {
        startDate: anchor,
        monthsEnrolled: monthsElapsed,
        paymentsMade: active.length,
        effectiveFee: feeVal,
        currency,
        // Coverage runs up to (but not including) this date, so it doubles as
        // the day the next payment falls due.
        paidThrough: toIso(paidThrough),
        nextDueDate: toIso(paidThrough),
        status,
      },
      payments,
      discounts: discounts.filter((d) => d.isActive),
      freezes: activeFreezes,
    });
  }),
);

/**
 * GET /api/students — CEO/Accountant see all (filterable by class/teacher/
 * status); Teachers are scoped to their own classes only (spec §2, §3.1).
 */
router.get(
  "/students",
  asyncHandler(async (req, res) => {
    // Refresh statuses before listing so both the badges and the status filter
    // reflect today's billing reality, not a value stamped hours ago. Without
    // this the list serves the stored `status` column verbatim, so filtering by
    // "Paid"/"Awaiting" matches stale data. Idempotent (same as /awaiting).
    await recomputeStatuses();

    const filter: StudentFilter = {};
    const { classId, teacherId, status, activeOnly, archived } = req.query;
    if (typeof classId === "string") filter.classId = classId;
    if (typeof status === "string") filter.status = status as StudentStatus;
    if (activeOnly === "1" || activeOnly === "true") filter.activeOnly = true;
    // Archive tab: stopped students only (active = false).
    if (archived === "1" || archived === "true") filter.archivedOnly = true;

    if (req.authUser!.role === "teacher") {
      filter.teacherId = req.teacherId; // hard scope
    } else if (typeof teacherId === "string") {
      filter.teacherId = teacherId;
    }
    res.json(await listStudents(filter));
  }),
);

/** Assert the caller may write to the given class (teachers: own classes). */
async function assertClassWritable(req: Request, classId: string) {
  const cls = await getClassById(classId);
  if (!cls) throw new Error("Class not found");
  if (req.authUser!.role === "teacher" && cls.teacherId !== req.teacherId) {
    throw new Error("forbidden");
  }
  return cls;
}

/**
 * Create a student. CEO/Accountant can add to any class; a Teacher may add a
 * student only to a class they own.
 */
router.post(
  "/students",
  asyncHandler(async (req, res) => {
    const input = insertStudentSchema.parse(req.body);
    await assertClassWritable(req, input.classId);
    const created = await createStudent({
      fullName: input.fullName,
      phone: input.phone ?? null,
      classId: input.classId,
      monthlyFee: input.monthlyFee ?? null,
      enrolledAt: input.enrolledAt,
    });
    res.status(201).json(created);
  }),
);

router.patch(
  "/students/:id",
  asyncHandler(async (req, res) => {
    const existing = await getStudentById(req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    await assertClassWritable(req, existing.classId);

    const patch = z
      .object({
        fullName: z.string().min(1).optional(),
        phone: z.string().nullable().optional(),
        classId: z.string().uuid().optional(),
        monthlyFee: z.coerce.number().nonnegative().nullable().optional(),
        // Start (enrolment) date — editable to fix a mistaken entry. Drives
        // billing when the student hasn't been re-anchored by a resume.
        enrolledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);

    // Teachers cannot move a class, change fees, or move the start date (all
    // affect billing/money); only CEO/Accountant may.
    if (patch.classId && req.authUser!.role === "teacher") {
      await assertClassWritable(req, patch.classId);
    }
    if (
      req.authUser!.role === "teacher" &&
      (patch.monthlyFee !== undefined || patch.classId !== undefined || patch.enrolledAt !== undefined)
    ) {
      return res.status(403).json({
        error: "forbidden",
        message: "Teachers cannot change fees, classes, or start dates.",
      });
    }
    const updated = await updateStudent(req.params.id, patch);
    // A class move keeps past payments with their original teacher; a start-date
    // change shifts the billing anchor. Either way, refresh status/coverage.
    if (patch.classId || patch.enrolledAt) await recomputeStatuses();
    res.json(updated);
  }),
);

/**
 * Stop a student's education (soft): they leave the group and move to the
 * archive, but the record and every payment stay for the finance history.
 * Teacher: own class; else CEO/Accountant. (`/archive` kept as an alias.)
 */
router.post(
  ["/students/:id/stop", "/students/:id/archive"],
  asyncHandler(async (req, res) => {
    const existing = await getStudentById(req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    await assertClassWritable(req, existing.classId);
    const updated = await stopStudent(req.params.id);
    res.json(updated);
  }),
);

/**
 * Resume a stopped student. Optionally into a new group. Billing re-anchors to
 * the resume date (default today) so they begin a fresh first month rather than
 * owing for the time they were away. CEO/Accountant only.
 */
router.post(
  "/students/:id/resume",
  requireRole("accountant", "ceo"),
  asyncHandler(async (req, res) => {
    const existing = await getStudentById(req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });

    const { classId, resumeDate } = z
      .object({
        classId: z.string().uuid().optional(),
        resumeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(req.body);

    if (classId) await assertClassWritable(req, classId);
    const updated = await resumeStudent(req.params.id, {
      classId,
      resumeDate: resumeDate ?? new Date().toISOString().slice(0, 10),
    });
    // Refresh status/coverage against the new anchor immediately.
    await recomputeStatuses();
    res.json(updated);
  }),
);

/** Hard-restrict fee edits & bulk ops to CEO where needed. */
router.get(
  "/students/:id",
  asyncHandler(async (req, res) => {
    const s = await getStudentById(req.params.id);
    if (!s) return res.status(404).json({ error: "not_found" });
    if (req.authUser!.role === "teacher") {
      const cls = await getClassById(s.classId);
      if (cls?.teacherId !== req.teacherId) return res.status(403).json({ error: "forbidden" });
    }
    res.json(s);
  }),
);

export default router;
