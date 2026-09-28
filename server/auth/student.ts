/**
 * Authentication for the student portal (/api/student/*).
 *
 *   Telegram-signed initData ──verify HMAC──▶ telegram user id
 *        ──student_telegram_accounts──▶ student  ──▶ req.student
 *
 * The student is derived ONLY from the verified Telegram identity; no student
 * id is ever read from the request. Every portal query is then scoped to
 * req.student.id, so one student can never reach another's data (no IDOR).
 *
 * Staff preview: a CEO/Accountant may view the portal as a given student
 * (X-Portal-Student header) to support/QA it. Preview is strictly read-only.
 */
import type { Request, Response, NextFunction } from "express";
import type { Student, StudentTelegramAccount, User } from "@shared/schema";
import { verifyInitData } from "./telegram";
import { verifyToken } from "./token";
import { env } from "../env";
import { getStudentById, getUserById, getUserByTelegramId } from "../storage";
import { getAccountsByTelegramId } from "../services/telegram-link";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      student?: Student;
      studentAccount?: StudentTelegramAccount | null;
      /** All records (groups) the Telegram user is linked to (empty in preview). */
      studentAccounts?: StudentTelegramAccount[];
      /** Set when a staff member is previewing the portal (read-only). */
      portalPreviewBy?: User;
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function initDataFrom(req: Request): string {
  const authz = req.header("authorization") ?? "";
  return authz.startsWith("tma ") ? authz.slice(4) : req.header("x-telegram-init-data") ?? "";
}

/** Resolve a staff user from the same credentials the staff app uses. */
async function staffFrom(req: Request): Promise<User | undefined> {
  const authz = req.header("authorization") ?? "";
  if (authz.startsWith("Bearer ")) {
    const uid = verifyToken(authz.slice(7));
    return uid ? getUserById(uid) : undefined;
  }
  if (env.devAuthBypass && env.devTelegramId) return getUserByTelegramId(env.devTelegramId);
  try {
    const v = verifyInitData(initDataFrom(req), env.botToken, env.initDataMaxAgeSeconds);
    return getUserByTelegramId(v.user.id);
  } catch {
    return undefined;
  }
}

export async function authenticateStudent(req: Request, res: Response, next: NextFunction) {
  try {
    // ── Staff preview (read-only) ──
    const previewId = req.header("x-portal-student");
    if (previewId) {
      const staff = await staffFrom(req);
      if (!staff || !staff.active || !staff.approved || (staff.role !== "ceo" && staff.role !== "accountant")) {
        return res.status(403).json({ error: "forbidden", message: "Only the CEO or an accountant can preview the portal." });
      }
      const student = UUID_RE.test(previewId) ? await getStudentById(previewId) : undefined;
      if (!student) return res.status(404).json({ error: "not_found", message: "Student not found." });
      const branches = staff.branchIds ?? [];
      if (branches.length > 0 && !branches.includes(student.branchId)) {
        return res.status(403).json({ error: "forbidden", message: "That student is in another branch." });
      }
      req.student = student;
      req.studentAccount = null;
      req.studentAccounts = [];
      req.portalPreviewBy = staff;
      return next();
    }

    // ── Telegram Mini App ──
    let telegramId: number;
    if (env.devAuthBypass && env.devTelegramId) {
      telegramId = env.devTelegramId;
    } else {
      telegramId = verifyInitData(initDataFrom(req), env.botToken, env.initDataMaxAgeSeconds).user.id;
    }
    const accounts = await getAccountsByTelegramId(telegramId);
    if (accounts.length === 0) {
      return res.status(403).json({
        error: "not_linked",
        message: "Your Telegram account isn't linked to a student yet. Open the bot and press /start.",
      });
    }
    // A student in several groups has one record per group. The app picks one
    // with X-Student-Id — honoured ONLY if it's one of this Telegram account's
    // own verified records; anything else is refused, never silently swapped.
    const wanted = req.header("x-student-id");
    const account = wanted ? accounts.find((a) => a.studentId === wanted) : accounts[0];
    if (!account) {
      return res.status(403).json({ error: "profile_not_linked", message: "That group isn't linked to your account." });
    }
    req.studentAccounts = accounts;
    const student = await getStudentById(account.studentId);
    if (!student) return res.status(403).json({ error: "not_linked", message: "Student record not found." });
    req.student = student;
    req.studentAccount = account;
    next();
  } catch (err) {
    res.status(401).json({ error: "unauthorized", message: (err as Error).message });
  }
}

/** Block writes while a staff member is previewing someone's portal. */
export function forbidPreviewWrites(req: Request, res: Response, next: NextFunction) {
  if (req.portalPreviewBy && req.method !== "GET") {
    return res.status(403).json({ error: "preview_read_only", message: "Preview mode is read-only." });
  }
  next();
}
