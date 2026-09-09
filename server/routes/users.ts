import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import {
  insertUserSchema,
  salaryRuleSchema,
  updateUserSchema,
  permissionsSchema,
  credentialsSchema,
  roleEnum,
  type User,
} from "@shared/schema";
import {
  listUsers,
  createUser,
  updateUserRole,
  updateUserProfile,
  setUserPermissions,
  setUserActive,
  getUserById,
  getUserByLoginUsername,
  getTeacherByUserId,
  updateSalaryRule,
  approveUser,
  rejectPendingUser,
  setLoginCredentials,
} from "../storage";
import { isPermission } from "@shared/permissions";
import { hashPassword } from "../auth/password";

const router = Router();

/** Never expose the password hash to the client. */
function sanitize<T extends { passwordHash?: string | null }>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _omit, ...rest } = user;
  return rest;
}

/** GET /api/me — the authenticated user + (if teacher) their teacherId. */
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    res.json({ user: sanitize(req.authUser as User), teacherId: req.teacherId ?? null });
  }),
);

/**
 * PATCH /api/me/credentials — the signed-in user sets/changes their own login
 * username + password, so they can recover access from a new Telegram account
 * later. Any role may do this for themselves.
 */
router.patch(
  "/me/credentials",
  asyncHandler(async (req, res) => {
    const { username, password } = credentialsSchema.parse(req.body);
    const taken = await getUserByLoginUsername(username);
    if (taken && taken.id !== req.authUser!.id) {
      return res.status(409).json({ error: "username_taken", message: "That username is taken." });
    }
    const user = await setLoginCredentials(req.authUser!.id, username, hashPassword(password));
    res.json(sanitize(user));
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
    const users = await listUsers();
    res.json(users.map(sanitize));
  }),
);

/** Invite a user by Telegram ID + role, optionally with login credentials. */
router.post(
  "/users",
  asyncHandler(async (req, res) => {
    const input = insertUserSchema.parse(req.body);
    const creds = z
      .object({ loginUsername: z.string().min(3).max(64).optional(), password: z.string().min(6).max(128).optional() })
      .parse(req.body);
    if (creds.loginUsername) {
      const taken = await getUserByLoginUsername(creds.loginUsername);
      if (taken) return res.status(409).json({ error: "username_taken", message: "That username is taken." });
    }
    const user = await createUser({
      telegramId: input.telegramId,
      username: input.username ?? null,
      fullName: input.fullName,
      role: input.role,
      // Only accept known permission keys; unknown strings are dropped so a
      // stale client can't grant a permission the server doesn't understand.
      permissions: input.permissions?.filter(isPermission),
      loginUsername: creds.loginUsername ?? null,
      passwordHash: creds.password ? hashPassword(creds.password) : null,
    });
    res.status(201).json(sanitize(user));
  }),
);

/** Approve a pending access request and assign a role (CEO). */
router.post(
  "/users/:id/approve",
  asyncHandler(async (req, res) => {
    const { role } = z.object({ role: z.enum(roleEnum.enumValues) }).parse(req.body);
    const user = await approveUser(req.params.id, role);
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json(sanitize(user));
  }),
);

/** Reject (delete) a pending access request (CEO). */
router.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "not_found" });
    if (user.approved) {
      return res.status(409).json({ error: "not_pending", message: "Disable an approved user instead of deleting." });
    }
    await rejectPendingUser(req.params.id);
    res.json({ ok: true });
  }),
);

/** CEO sets or resets a user's login credentials (recovery help). */
router.patch(
  "/users/:id/credentials",
  asyncHandler(async (req, res) => {
    const { username, password } = credentialsSchema.parse(req.body);
    const taken = await getUserByLoginUsername(username);
    if (taken && taken.id !== req.params.id) {
      return res.status(409).json({ error: "username_taken", message: "That username is taken." });
    }
    const user = await setLoginCredentials(req.params.id, username, hashPassword(password));
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json(sanitize(user));
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
    res.json(sanitize(user));
  }),
);

router.patch(
  "/users/:id/role",
  asyncHandler(async (req, res) => {
    const { role } = z.object({ role: z.enum(roleEnum.enumValues) }).parse(req.body);
    const user = await updateUserRole(req.params.id, role);
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json(sanitize(user));
  }),
);

/** Set the per-user permission grants (CEO controls who can do what). */
router.patch(
  "/users/:id/permissions",
  asyncHandler(async (req, res) => {
    const { permissions } = permissionsSchema.parse(req.body);
    const user = await setUserPermissions(req.params.id, permissions.filter(isPermission));
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json(sanitize(user));
  }),
);

router.patch(
  "/users/:id/active",
  asyncHandler(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const user = await setUserActive(req.params.id, active);
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json(sanitize(user));
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
