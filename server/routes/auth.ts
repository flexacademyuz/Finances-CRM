import { Router, type Request } from "express";
import { asyncHandler } from "./helpers";
import { verifyInitData, telegramDisplayName } from "../auth/telegram";
import { hashPassword, verifyPassword } from "../auth/password";
import { env } from "../env";
import { loginSchema, signupSchema } from "@shared/schema";
import {
  getUserByLoginUsername,
  getUserByTelegramId,
  relinkTelegramId,
  createSignupRequest,
} from "../storage";

const router = Router();

/** Resolve the caller's Telegram identity from initData (or the dev bypass). */
function resolveTelegram(req: Request): { telegramId: number; displayName: string; username: string | null } {
  if (env.devAuthBypass && env.devTelegramId) {
    return { telegramId: env.devTelegramId, displayName: "Dev User", username: null };
  }
  const header = req.header("authorization");
  const initData = header?.startsWith("tma ")
    ? header.slice(4)
    : req.header("x-telegram-init-data") ?? "";
  const verified = verifyInitData(initData, env.botToken, env.initDataMaxAgeSeconds);
  return {
    telegramId: verified.user.id,
    displayName: telegramDisplayName(verified.user),
    username: verified.user.username ?? null,
  };
}

/**
 * POST /api/auth/login — recover access from a NEW Telegram account. The caller
 * proves who they are with their username + password; on success this profile is
 * re-linked to the caller's current Telegram id, so the app works again.
 */
router.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    let telegramId: number;
    try {
      ({ telegramId } = resolveTelegram(req));
    } catch (err) {
      return res.status(401).json({ error: "unauthorized", message: (err as Error).message });
    }
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
    await relinkTelegramId(user.id, telegramId);
    res.json({ ok: true });
  }),
);

/**
 * POST /api/auth/signup — a new person requests access. Creates a pending user
 * (with login credentials) for the CEO to approve and assign a role.
 */
router.post(
  "/auth/signup",
  asyncHandler(async (req, res) => {
    let tg: { telegramId: number; username: string | null };
    try {
      tg = resolveTelegram(req);
    } catch (err) {
      return res.status(401).json({ error: "unauthorized", message: (err as Error).message });
    }
    const { fullName, username, password } = signupSchema.parse(req.body);

    // Already fully registered on this Telegram account?
    const existing = await getUserByTelegramId(tg.telegramId);
    if (existing?.approved) {
      return res.status(409).json({ error: "already_registered", message: "You already have access." });
    }
    // Login username must be free (unless it's this caller's own pending row).
    const byName = await getUserByLoginUsername(username);
    if (byName && byName.telegramId !== tg.telegramId) {
      return res.status(409).json({ error: "username_taken", message: "That username is taken." });
    }

    const result = await createSignupRequest({
      telegramId: tg.telegramId,
      username: tg.username,
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
