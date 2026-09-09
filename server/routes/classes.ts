import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "./helpers";
import { requireRole, requirePermission } from "../auth/middleware";
import { insertClassSchema } from "@shared/schema";
import {
  listClasses,
  getClassById,
  createClass,
  updateClass,
  classLedger,
  getTeacherById,
  getUserById,
  getSalaryRuleForGroup,
} from "../storage";
import { academicMonthsSoFar, monthLabel, normalizeMonth, monthKey } from "@shared/date";

const router = Router();

/**
 * GET /api/classes/:id/ledger — the class "folder": its enrolled students plus
 * a paid/unpaid/frozen status per month (a monthly payment table). Teachers may
 * only view their own classes.
 */
router.get(
  "/classes/:id/ledger",
  asyncHandler(async (req, res) => {
    const cls = await getClassById(req.params.id);
    if (!cls) return res.status(404).json({ error: "not_found" });
    if (req.authUser!.role === "teacher" && cls.teacherId !== req.teacherId) {
      return res.status(403).json({ error: "forbidden" });
    }

    // The payment table runs from the academic year's September up to the
    // selected end month (default: this month) — never pre-term months.
    const end = typeof req.query.end === "string" ? normalizeMonth(req.query.end) : monthKey();
    const months = academicMonthsSoFar(end);

    const [teacher, rule] = await Promise.all([
      getTeacherById(cls.teacherId),
      getSalaryRuleForGroup(cls.id),
    ]);
    const teacherUser = teacher ? await getUserById(teacher.userId) : undefined;
    const students = await classLedger(cls.id, months);

    res.json({
      class: {
        id: cls.id,
        name: cls.name,
        subject: cls.subject,
        room: cls.room,
        schedule: cls.schedule,
        defaultFee: cls.defaultFee,
        maxStudents: cls.maxStudents,
        teacherId: cls.teacherId,
        teacherName: teacherUser?.fullName ?? null,
        perStudentRate: rule ? rule.fixedSalaryPerStudent : null,
      },
      months: months.map((m) => ({ key: m, label: monthLabel(m) })),
      students,
    });
  }),
);

/**
 * GET /api/classes — teachers see only their own classes; CEO/Accountant see
 * all (Accountant needs them read-only to record payments).
 */
router.get(
  "/classes",
  asyncHandler(async (req, res) => {
    const { teacherId, activeOnly } = req.query;
    const filter: { teacherId?: string; activeOnly?: boolean } = {};
    if (req.authUser!.role === "teacher") {
      filter.teacherId = req.teacherId;
    } else if (typeof teacherId === "string") {
      filter.teacherId = teacherId;
    }
    if (activeOnly === "1" || activeOnly === "true") filter.activeOnly = true;
    res.json(await listClasses(filter));
  }),
);

/* Create/edit/archive: anyone granted the group permissions (CEO always). */
router.post(
  "/classes",
  requirePermission("add_group"),
  asyncHandler(async (req, res) => {
    const input = insertClassSchema.parse(req.body);
    const created = await createClass({
      name: input.name,
      subject: input.subject ?? null,
      teacherId: input.teacherId,
      defaultFee: input.defaultFee ?? 0,
      schedule: input.schedule ?? null,
      room: input.room ?? null,
      maxStudents: input.maxStudents ?? null,
      startDate: input.startDate ?? null,
    });
    res.status(201).json(created);
  }),
);

router.patch(
  "/classes/:id",
  requirePermission("edit_group"),
  asyncHandler(async (req, res) => {
    const patch = z
      .object({
        name: z.string().min(1).optional(),
        subject: z.string().nullable().optional(),
        teacherId: z.string().uuid().optional(),
        defaultFee: z.coerce.number().nonnegative().optional(),
        schedule: z.string().nullable().optional(),
        room: z.string().nullable().optional(),
        maxStudents: z.coerce.number().int().positive().nullable().optional(),
        startDate: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = await updateClass(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json(updated);
  }),
);

router.get(
  "/classes/:id",
  asyncHandler(async (req, res) => {
    const cls = await getClassById(req.params.id);
    if (!cls) return res.status(404).json({ error: "not_found" });
    if (req.authUser!.role === "teacher" && cls.teacherId !== req.teacherId) {
      return res.status(403).json({ error: "forbidden" });
    }
    res.json(cls);
  }),
);

export default router;
