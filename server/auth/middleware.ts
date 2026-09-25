import type { Request, Response, NextFunction } from "express";
import { verifyInitData, telegramDisplayName } from "./telegram";
import { verifyToken } from "./token";
import { getUserByTelegramId, getUserById, getTeacherByUserId } from "../storage";
import { env } from "../env";
import type { Role, User } from "@shared/schema";
import { can, type Permission } from "@shared/permissions";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: User;
      teacherId?: string;
      // The set of branches this user may access. An empty array = "all
      // branches" (full access). One or more ids = exactly those branches.
      userBranches?: string[];
      // Set when a CEO is viewing the app as another user (X-Impersonate-User).
      // `authUser` is then the impersonated user; this is the real CEO.
      impersonator?: User;
    }
  }
}

/**
 * Authenticate every API request from the Telegram initData supplied in the
 * `Authorization: tma <initData>` header (or `X-Telegram-Init-Data`). The
 * Telegram user is mapped to a DB user; unknown users are rejected 403 so only
 * CEO-invited accounts can use the app.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authz = req.header("authorization") ?? "";

    // Web session token (browser login, outside Telegram).
    if (authz.startsWith("Bearer ")) {
      const uid = verifyToken(authz.slice(7));
      if (!uid) {
        return res.status(401).json({ error: "unauthorized", message: "Session expired. Please log in again." });
      }
      return finishAuth(req, res, next, await getUserById(uid), "not_found");
    }

    // Telegram Mini App: verify initData (or the dev bypass).
    let telegramId: number;
    if (env.devAuthBypass && env.devTelegramId) {
      telegramId = env.devTelegramId;
    } else {
      const initData = authz.startsWith("tma ")
        ? authz.slice(4)
        : req.header("x-telegram-init-data") ?? "";
      const verified = verifyInitData(initData, env.botToken, env.initDataMaxAgeSeconds);
      telegramId = verified.user.id;
      req.telegramDisplayName = telegramDisplayName(verified.user);
      req.telegramUsername = verified.user.username;
    }
    return finishAuth(req, res, next, await getUserByTelegramId(telegramId), "not_registered");
  } catch (err) {
    res.status(401).json({ error: "unauthorized", message: (err as Error).message });
  }
}

/** Shared post-lookup checks (approved / active) + request wiring. */
async function finishAuth(
  req: Request,
  res: Response,
  next: NextFunction,
  user: User | undefined,
  missingCode: "not_registered" | "not_found",
) {
  if (!user) {
    return res.status(missingCode === "not_found" ? 401 : 403).json({
      error: missingCode,
      message:
        missingCode === "not_found"
          ? "Account not found. Please log in again."
          : "Your account isn't linked yet. Log in or request access.",
    });
  }
  if (!user.approved) {
    return res.status(403).json({ error: "pending", message: "Your access request is awaiting the CEO's approval." });
  }
  if (!user.active) {
    return res.status(403).json({ error: "inactive", message: "Account disabled." });
  }

  // CEO impersonation: act as another (approved, active, non-CEO) user so the CEO
  // can see and test exactly what that user sees. Everything downstream — role,
  // permissions, branch scoping, teacherId — follows the impersonated user.
  const impersonateId = req.header("x-impersonate-user");
  if (impersonateId && user.role === "ceo" && impersonateId !== user.id) {
    const target = UUID_RE.test(impersonateId) ? await getUserById(impersonateId) : undefined;
    if (!target || !target.approved || !target.active || target.role === "ceo") {
      return res.status(403).json({
        error: "impersonation_invalid",
        message: "That user can't be impersonated (missing, disabled, or a CEO).",
      });
    }
    if (req.method !== "GET") {
      console.log(
        `[impersonate] ${user.fullName} (${user.id}) as ${target.fullName} (${target.id}): ${req.method} ${req.originalUrl}`,
      );
    }
    req.impersonator = user;
    user = target;
  }

  req.authUser = user;
  req.userBranches = user.branchIds ?? [];
  if (user.role === "teacher") {
    const t = await getTeacherByUserId(user.id);
    req.teacherId = t?.id;
  }
  next();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The branches the caller may access (empty = all branches / full access). */
function allowedBranches(req: Request): string[] {
  return req.userBranches ?? [];
}

/** True if the caller may access `branchId` (full-access users may access any). */
function canAccessBranch(req: Request, branchId: string): boolean {
  const allowed = allowedBranches(req);
  return allowed.length === 0 || allowed.includes(branchId);
}

/** The branch the client asked to view via header / query, if any. */
function requestedBranch(req: Request): string | undefined {
  const raw =
    req.header("x-branch-id") ??
    (typeof req.query.branch === "string" ? req.query.branch : "");
  return raw && raw !== "all" ? raw : undefined;
}

/**
 * The single branch a list/report request should be scoped to, or `undefined`
 * for "all branches" (no filter — full-access users only).
 *
 * - Full-access users (empty set) may narrow to one branch via the `X-Branch-Id`
 *   header (or `?branch=`); with none, they see everything (undefined).
 * - Restricted users always see exactly one of their branches: the requested one
 *   if it's allowed, otherwise their first branch. They never get an unfiltered
 *   cross-company view.
 */
export function branchFilter(req: Request): string | undefined {
  const allowed = allowedBranches(req);
  const requested = requestedBranch(req);
  if (allowed.length === 0) return requested; // full access: header or all
  if (requested && allowed.includes(requested)) return requested;
  return allowed[0]; // default to their first branch
}

/**
 * The branch a NEW top-level entity (group, lead, draft, expense) should be
 * created in. Restricted users create in the requested branch (must be one of
 * theirs) or, if they have exactly one, that one. Full-access users use the body
 * branch or the selected header branch; if they've picked neither, they must
 * choose one.
 */
export function writeBranch(req: Request, bodyBranchId?: string | null): string {
  const allowed = allowedBranches(req);
  const chosen = bodyBranchId || requestedBranch(req);

  if (allowed.length > 0) {
    if (chosen) {
      if (!allowed.includes(chosen)) {
        throw Object.assign(new Error("You don't have access to that branch."), { status: 403 });
      }
      return chosen;
    }
    if (allowed.length === 1) return allowed[0];
    throw Object.assign(new Error("Select a branch first."), { status: 400 });
  }

  // Full access.
  if (!chosen) {
    throw Object.assign(
      new Error("Select a branch first (you have access to all branches)."),
      { status: 400 },
    );
  }
  return chosen;
}

/**
 * Guard access to an entity that already carries a branch: a restricted user may
 * only touch branches in their set; full-access users may touch any.
 */
export function assertBranchAccess(req: Request, branchId: string): void {
  if (!canAccessBranch(req, branchId)) {
    throw Object.assign(new Error("forbidden"), { status: 403 });
  }
}

/** Restrict a route to one of the given roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) return res.status(401).json({ error: "unauthorized" });
    if (!roles.includes(req.authUser.role)) {
      return res.status(403).json({ error: "forbidden", message: "Insufficient role." });
    }
    next();
  };
}

/**
 * Restrict a route to users who have the given ability — either from their role
 * defaults or a per-user grant from the CEO (who always passes). See
 * shared/permissions.ts.
 */
export function requirePermission(perm: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) return res.status(401).json({ error: "unauthorized" });
    if (!can(req.authUser, perm)) {
      return res.status(403).json({
        error: "forbidden",
        message: "You don't have permission for this action. Ask the CEO to enable it.",
      });
    }
    next();
  };
}

// Augment Express Request with the display fields captured during verify.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      telegramDisplayName?: string;
      telegramUsername?: string;
    }
  }
}
