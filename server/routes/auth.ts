import { Router, type Request } from "express";
import { asyncHandler } from "./helpers";
import { verifyInitData } from "../auth/telegram";
import { hashPassword, verifyPassword } from "../auth/password";
import { signToken } from "../auth/token";
import { env } from "../env";
import { loginSchema, signupSchema } from "@shared/schema";
import {
  getUserByLoginUsername,
  getUserByTelegramId,
  relinkTelegramId,
  createSignupRequest,
} from "../storage";

const router = Router();

/**
 * Try to resolve the caller's Telegram identity from initData. Returns null when
 * there's none or it's invalid — i.e. a plain browser (website) session, which
 * is fine: credential auth doesn't require Telegram.
 */
function tryResolveTelegram(req: Request): { telegramId: number; username: string | null } | null {
  if (env.devAuthBypass && env.devTelegramId) {
    return { telegramId: env.devTelegramId, username: null };
  }
  const header = req.header("authorization");
  const initData = header?.startsWith("tma ")
    ? header.slice(4)
    : req.header("x-telegram-init-data") ?? "";
  if (!initData) return null;
  try {
    const verified = verifyInitData(initData, env.botToken, env.initDataMaxAgeSeconds);
    return { telegramId: verified.user.id, username: verified.user.username ?? null };
  } catch {
    return null;
  }
}

/**
 * POST /api/auth/login — sign in with username + password. Works in a browser
 * (returns a session token) and inside Telegram (also re-links this profile to
 * the caller's current Telegram id, for account recovery).
 */
router.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const user = await getUserByLoginUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "invalid_credentials", message: "Wrong username or password." });
    }
    if (!user.approved) {
      return res.status(403).json({ error: "pending", message: "Your access request is awaiting approval." });
    }
    if (!user.active) {
      return res.status(403).json({ error: "inactive", message: "Account disabled." });
    }
    // Inside Telegram, re-link this profile to the caller's current id.
    const tg = tryResolveTelegram(req);
    if (tg) await relinkTelegramId(user.id, tg.telegramId);
    // Always issue a web session token so the browser stays signed in.
    res.json({ ok: true, token: signToken(user.id) });
  }),
);

/**
 * POST /api/auth/signup — request access. Creates a pending user (with login
 * credentials) for the CEO to approve. Works from a browser (no Telegram) too.
 */
router.post(
  "/auth/signup",
  asyncHandler(async (req, res) => {
    const { fullName, username, password } = signupSchema.parse(req.body);
    const tg = tryResolveTelegram(req);

    if (tg) {
      const existing = await getUserByTelegramId(tg.telegramId);
      if (existing?.approved) {
        return res.status(409).json({ error: "already_registered", message: "You already have access." });
      }
    }
    const byName = await getUserByLoginUsername(username);
    if (byName && byName.telegramId !== (tg?.telegramId ?? null)) {
      return res.status(409).json({ error: "username_taken", message: "That username is taken." });
    }

    const result = await createSignupRequest({
      telegramId: tg?.telegramId ?? null,
      username: tg?.username ?? null,
      fullName,
      loginUsername: username,
      passwordHash: hashPassword(password),
    });
    if (result.alreadyApproved) {
      return res.status(409).json({ error: "already_registered", message: "You already have access." });
    }
    res.status(201).json({ ok: true, pending: true });
  }),
);

export default router;
