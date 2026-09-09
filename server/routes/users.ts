import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import {
  insertUserSchema,
  salaryRuleSchema,
  updateUserSchema,
  permissionsSchema,
  roleEnum,
} from "@shared/schema";
import {
  listUsers,
  createUser,
  updateUserRole,
  updateUserProfile,
  setUserPermissions,
  setUserActive,
  getUserById,
  getTeacherByUserId,
  updateSalaryRule,
} from "../storage";
import { isPermission } from "@shared/permissions";

const router = Router();

/** GET /api/me — the authenticated user + (if teacher) their teacherId. */
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    res.json({ user: req.authUser, teacherId: req.teacherId ?? null });
  }),
);

/*
 * User & role management is CEO-only (spec §2). Scope the guard to the
 * `/users` paths — a path-less `router.use(requireRole("ceo"))` here would
 * leak onto every other API route (this router is mounted first), which would
 * 403 accountants/teachers on students, classes, etc.
 */
router.use("/users", requireRole("ceo"));

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
      // Only accept known permission keys; unknown strings are dropped so a
      // stale client can't grant a permission the server doesn't understand.
      permissions: input.permissions?.filter(isPermission),
    });
    res.status(201).json(user);
  }),
);

/**
 * Edit a user's profile (name, username, role) — lets the CEO fix a mistaken
 * registration, e.g. a teacher entered under the wrong name.
 */
router.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const patch = updateUserSchema.parse(req.body);
    const user = await updateUserProfile(req.params.id, patch);
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json(user);
  }),
);

router.patch(
  "/users/:id/role",
  asyncHandler(async (req, res) => {
    const { role } = z.object({ role: z.enum(roleEnum.enumValues) }).parse(req.body);
    const user = await updateUserRole(req.params.id, role);
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json(user);
  }),
);

/** Set the per-user permission grants (CEO controls who can do what). */
router.patch(
  "/users/:id/permissions",
  asyncHandler(async (req, res) => {
    const { permissions } = permissionsSchema.parse(req.body);
    const user = await setUserPermissions(req.params.id, permissions.filter(isPermission));
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
