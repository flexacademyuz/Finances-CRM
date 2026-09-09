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
  if (user.role === "teacher") {
    const t = await getTeacherByUserId(user.id);
    req.teacherId = t?.id;
  }
  next();
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
