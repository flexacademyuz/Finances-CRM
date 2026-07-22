import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import { insertUserSchema, salaryRuleSchema } from "@shared/schema";
import {
  listUsers,
  createUser,
  updateUserRole,
  setUserActive,
  getUserById,
  getTeacherByUserId,
  updateSalaryRule,
} from "../storage";

const router = Router();

/** GET /api/me — the authenticated user + (if teacher) their teacherId. */
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    res.json({ user: req.authUser, teacherId: req.teacherId ?? null });
  }),
);

/* Everything below is CEO-only user & role management (spec §2). */
router.use(requireRole("ceo"));

router.get(
  "/users",
  asyncHandler(async (_req, res) => {
    res.json(await listUsers());
  }),
);

/** Invite a user by Telegram ID + role. */
router.post(
  "/users",
  asyncHandler(async (req, res) => {
    const input = insertUserSchema.parse(req.body);
    const user = await createUser({
      telegramId: input.telegramId,
      username: input.username ?? null,
      fullName: input.fullName,
      role: input.role,
    });
    res.status(201).json(user);
  }),
);

router.patch(
  "/users/:id/role",
  asyncHandler(async (req, res) => {
    const { role } = z.object({ role: z.enum(["ceo", "accountant", "teacher"]) }).parse(req.body);
    const user = await updateUserRole(req.params.id, role);
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json(user);
  }),
);

router.patch(
  "/users/:id/active",
  asyncHandler(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const user = await setUserActive(req.params.id, active);
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json(user);
  }),
);

/** Configure a teacher's salary rule (CEO-only). */
router.patch(
  "/users/:id/salary-rule",
  asyncHandler(async (req, res) => {
    const user = await getUserById(req.params.id);
    if (!user || user.role !== "teacher")
      return res.status(404).json({ error: "not_found", message: "Teacher not found" });
    const teacher = await getTeacherByUserId(user.id);
    if (!teacher) return res.status(404).json({ error: "not_found" });
    const { salaryModel, salaryValue } = salaryRuleSchema.parse(req.body);
    const updated = await updateSalaryRule(teacher.id, salaryModel, salaryValue);
    res.json(updated);
  }),
);

export default router;
