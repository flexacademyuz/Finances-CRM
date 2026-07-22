import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import {
  createFreezeSchema,
  createDiscountSchema,
  teacherSalaryRuleSchema,
} from "@shared/schema";
import {
  createFreeze,
  listFreezesForStudent,
  getFreezeById,
  liftFreeze,
  createDiscount,
  listDiscountsForStudent,
  setDiscountActive,
  upsertTeacherSalaryRule,
  listSalaryRulesForTeacher,
  getClassById,
} from "../storage";
import { normalizeMonth, monthKey } from "@shared/date";

const router = Router();

/* ─────────────────────────── Payment freezes ───────────────────────── */

router.post(
  "/freezes",
  requireRole("accountant", "ceo"),
  asyncHandler(async (req, res) => {
    const input = createFreezeSchema.parse(req.body);
    if (input.freezeTo < input.freezeFrom) {
      return res.status(400).json({ error: "bad_range", message: "End date is before start date." });
    }
    const freeze = await createFreeze({ ...input, createdBy: req.authUser!.id });
    res.status(201).json(freeze);
  }),
);

router.get(
  "/freezes/student/:studentId",
  asyncHandler(async (req, res) => {
    res.json(await listFreezesForStudent(req.params.studentId));
  }),
);

router.patch(
  "/freezes/:id/lift",
  requireRole("accountant", "ceo"),
  asyncHandler(async (req, res) => {
    const existing = await getFreezeById(req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    res.json(await liftFreeze(req.params.id));
  }),
);

/* ────────────────────────────── Discounts ──────────────────────────── */

router.post(
  "/discounts",
  requireRole("accountant", "ceo"),
  asyncHandler(async (req, res) => {
    const input = createDiscountSchema.parse(req.body);
    if (input.discountType === "percentage" && input.discountValue > 100) {
      return res.status(400).json({ error: "bad_value", message: "Percentage cannot exceed 100." });
    }
    const discount = await createDiscount({
      studentId: input.studentId,
      groupId: input.groupId,
      discountType: input.discountType,
      discountValue: input.discountValue,
      validFrom: normalizeMonth(input.validFrom),
      validTo: input.validTo ? normalizeMonth(input.validTo) : null,
      reason: input.reason,
      createdBy: req.authUser!.id,
    });
    res.status(201).json(discount);
  }),
);

router.get(
  "/discounts/student/:studentId",
  asyncHandler(async (req, res) => {
    res.json(await listDiscountsForStudent(req.params.studentId));
  }),
);

/** Remove (deactivate) or reactivate a discount. */
router.patch(
  "/discounts/:id",
  requireRole("accountant", "ceo"),
  asyncHandler(async (req, res) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const updated = await setDiscountActive(req.params.id, isActive);
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json(updated);
  }),
);

/* ───────────────────────── Teacher salary rules ────────────────────── */

/** Set/replace a group's fixed per-student teacher rate (V2 1C). */
router.put(
  "/teacher-salary-rules",
  requireRole("accountant", "ceo"),
  asyncHandler(async (req, res) => {
    const input = teacherSalaryRuleSchema.parse(req.body);
    const group = await getClassById(input.groupId);
    if (!group) return res.status(404).json({ error: "not_found", message: "Group not found" });
    const rule = await upsertTeacherSalaryRule({
      groupId: input.groupId,
      teacherId: group.teacherId,
      fixedSalaryPerStudent: input.fixedSalaryPerStudent,
      effectiveFrom: input.effectiveFrom ? normalizeMonth(input.effectiveFrom) : monthKey(),
      createdBy: req.authUser!.id,
    });
    res.json(rule);
  }),
);

router.get(
  "/teacher-salary-rules/teacher/:teacherId",
  asyncHandler(async (req, res) => {
    res.json(await listSalaryRulesForTeacher(req.params.teacherId));
  }),
);

export default router;
