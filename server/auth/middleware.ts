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
      // The branch this user is pinned to, or null for "all branches" access.
      userBranchId?: string | null;
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
  req.authUser = user;
  req.userBranchId = user.branchId ?? null;
  if (user.role === "teacher") {
    const t = await getTeacherByUserId(user.id);
    req.teacherId = t?.id;
  }
  next();
}

/**
 * The branch a list/report request should be scoped to, or `undefined` for "all
 * branches" (no filter). A pinned user is always locked to their own branch —
 * any client-supplied branch is ignored. An all-branches user (CEO, or a
 * teacher/staffer set to all branches) may narrow to one branch via the
 * `X-Branch-Id` header (or `?branch=` query); with none, they see everything.
 */
export function branchFilter(req: Request): string | undefined {
  if (req.userBranchId) return req.userBranchId;
  const raw =
    req.header("x-branch-id") ??
    (typeof req.query.branch === "string" ? req.query.branch : "");
  return raw && raw !== "all" ? raw : undefined;
}

/**
 * The branch a NEW top-level entity (group, lead, draft, expense) should be
 * created in. Pinned users always create in their own branch (a mismatched body
 * value is rejected). All-branches users use the body branch or the selected
 * header branch; if they've picked neither, the caller must choose one.
 */
export function writeBranch(req: Request, bodyBranchId?: string | null): string {
  if (req.userBranchId) {
    if (bodyBranchId && bodyBranchId !== req.userBranchId) {
      throw Object.assign(new Error("You can only create records in your own branch."), {
        status: 403,
      });
    }
    return req.userBranchId;
  }
  const chosen = bodyBranchId || branchFilter(req);
  if (!chosen) {
    throw Object.assign(
      new Error("Select a branch first (you have access to all branches)."),
      { status: 400 },
    );
  }
  return chosen;
}

/**
 * Guard access to an entity that already carries a branch: a pinned user may
 * only touch their own branch's rows; all-branches users may touch any.
 */
export function assertBranchAccess(req: Request, branchId: string): void {
  if (req.userBranchId && req.userBranchId !== branchId) {
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
