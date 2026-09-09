import type { Request, Response, NextFunction } from "express";
import { verifyInitData, telegramDisplayName } from "./telegram";
import { getUserByTelegramId, getTeacherByUserId } from "../storage";
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
    let telegramId: number;

    if (env.devAuthBypass && env.devTelegramId) {
      // Local development shortcut — never active in production (see env.ts).
      telegramId = env.devTelegramId;
    } else {
      const header = req.header("authorization");
      const initData = header?.startsWith("tma ")
        ? header.slice(4)
        : req.header("x-telegram-init-data") ?? "";
      const verified = verifyInitData(initData, env.botToken, env.initDataMaxAgeSeconds);
      telegramId = verified.user.id;
      req.telegramDisplayName = telegramDisplayName(verified.user);
      req.telegramUsername = verified.user.username;
    }

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      return res.status(403).json({
        error: "not_registered",
        message: "Your Telegram account has not been added by the CEO yet.",
      });
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
  } catch (err) {
    res.status(401).json({ error: "unauthorized", message: (err as Error).message });
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
