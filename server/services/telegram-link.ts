/**
 * Linking Telegram accounts to CRM students.
 *
 * A link is only ever created here, by the bot, after verification:
 *   - "phone": the user shared THEIR OWN contact (Telegram guarantees the
 *     contact's user_id; the bot checks it equals the sender) and the number
 *     matches the selected student's phone on file; or
 *   - "code":  the user entered a one-time code staff generated on that
 *     student's profile (stored hashed, single-use, expiring).
 * The Mini App later trusts only Telegram-signed initData → telegram_user_id →
 * this table; it never accepts a student id from the client.
 */
import crypto from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { studentLinkCodes, studentTelegramAccounts, students, type StudentTelegramAccount } from "@shared/schema";
import { LINK_CODE_ALPHABET, LINK_CODE_LENGTH, normalizeLinkCode } from "@shared/linking";
import { getUserByTelegramId } from "../storage";
import { audit } from "./audit";
import { emit } from "../events";

/** How long a staff-generated code stays valid. */
export const LINK_CODE_TTL_HOURS = 72;
/** Linked Telegram accounts allowed per student (student + parents). */
export const MAX_ACCOUNTS_PER_STUDENT = 3;

export class LinkError extends Error {
  constructor(
    public code:
      | "staff_account"
      | "already_linked"
      | "linked_elsewhere"
      | "too_many_accounts"
      | "invalid_code"
      | "student_inactive"
      | "rate_limited",
    message: string,
  ) {
    super(message);
  }
}

const hash = (code: string) => crypto.createHash("sha256").update(code).digest("hex");

function randomCode(): string {
  const bytes = crypto.randomBytes(LINK_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) out += LINK_CODE_ALPHABET[bytes[i] % LINK_CODE_ALPHABET.length];
  return out;
}

/**
 * Issue a fresh one-time code for a student (any older unused code for them is
 * revoked). Returns the plaintext code — shown once, never stored.
 */
export async function generateLinkCode(studentId: string, createdBy: string) {
  const code = randomCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_HOURS * 3600_000);
  await db.transaction(async (tx) => {
    await tx
      .delete(studentLinkCodes)
      .where(and(eq(studentLinkCodes.studentId, studentId), isNull(studentLinkCodes.usedAt)));
    await tx.insert(studentLinkCodes).values({ studentId, codeHash: hash(code), expiresAt, createdBy });
  });
  await audit({
    actorUserId: createdBy,
    actorType: "user",
    action: "telegram.link_code_created",
    entityType: "student",
    entityId: studentId,
    studentId,
    meta: { expiresAt },
  });
  return { code, expiresAt };
}

/* ───────────────────────── brute-force protection ───────────────────────── */

const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 30 * 60_000;
const failures = new Map<number, number[]>();

/** Throws when this Telegram user has failed verification too often recently. */
export function assertNotRateLimited(telegramUserId: number): void {
  const now = Date.now();
  const recent = (failures.get(telegramUserId) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  failures.set(telegramUserId, recent);
  if (recent.length >= FAIL_LIMIT) {
    throw new LinkError("rate_limited", "Too many failed attempts. Please try again in 30 minutes.");
  }
}

export function recordFailure(telegramUserId: number): void {
  const list = failures.get(telegramUserId) ?? [];
  list.push(Date.now());
  failures.set(telegramUserId, list);
}

export function clearFailures(telegramUserId: number): void {
  failures.delete(telegramUserId);
}

/* ─────────────────────────────── linking ─────────────────────────────── */

export type TelegramIdentity = {
  id: number;
  username?: string | null;
  firstName?: string | null;
  languageCode?: string | null;
};

export async function getAccountByTelegramId(telegramUserId: number) {
  const [a] = await db
    .select()
    .from(studentTelegramAccounts)
    .where(eq(studentTelegramAccounts.telegramUserId, telegramUserId));
  return a ?? null;
}

export async function listAccountsForStudent(studentId: string) {
  return db
    .select()
    .from(studentTelegramAccounts)
    .where(eq(studentTelegramAccounts.studentId, studentId))
    .orderBy(studentTelegramAccounts.createdAt);
}

/** Create the link after verification succeeded. */
export async function linkAccount(
  studentId: string,
  tg: TelegramIdentity,
  method: "phone" | "code",
): Promise<StudentTelegramAccount> {
  if (await getUserByTelegramId(tg.id)) {
    throw new LinkError("staff_account", "This Telegram account belongs to a staff member.");
  }
  const [student] = await db.select().from(students).where(eq(students.id, studentId));
  if (!student || !student.active) throw new LinkError("student_inactive", "This student is not active.");

  const existing = await getAccountByTelegramId(tg.id);
  if (existing) {
    if (existing.studentId === studentId) return existing;
    throw new LinkError("linked_elsewhere", "This Telegram account is already linked to another student.");
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(studentTelegramAccounts)
    .where(eq(studentTelegramAccounts.studentId, studentId));
  if (Number(n) >= MAX_ACCOUNTS_PER_STUDENT) {
    throw new LinkError("too_many_accounts", "This student already has the maximum number of linked accounts.");
  }

  let account: StudentTelegramAccount;
  try {
    [account] = await db
      .insert(studentTelegramAccounts)
      .values({
        studentId,
        telegramUserId: tg.id,
        telegramUsername: tg.username ?? null,
        firstName: tg.firstName ?? null,
        languageCode: tg.languageCode?.startsWith("uz") ? "uz" : tg.languageCode ? "en" : "uz",
        verificationMethod: method,
      })
      .returning();
  } catch (err) {
    // Unique violation: a concurrent link of the same Telegram account won.
    if ((err as { code?: string }).code === "23505") {
      throw new LinkError("linked_elsewhere", "This Telegram account is already linked.");
    }
    throw err;
  }
  clearFailures(tg.id);
  await audit({
    actorType: "bot",
    action: "telegram.linked",
    entityType: "student",
    entityId: studentId,
    studentId,
    branchId: student.branchId,
    after: { telegramUserId: tg.id, username: tg.username ?? null, method },
  });
  emit("student.linked", { studentId, telegramAccountId: account.id });
  return account;
}

/**
 * Redeem a one-time code. When `expectedStudentId` is given (the user already
 * picked their name in the bot) the code must belong to that student; the
 * error is deliberately the same generic message either way.
 */
export async function redeemLinkCode(rawCode: string, tg: TelegramIdentity, expectedStudentId?: string) {
  assertNotRateLimited(tg.id);
  const code = normalizeLinkCode(rawCode);
  const [row] = await db
    .select()
    .from(studentLinkCodes)
    .where(
      and(
        eq(studentLinkCodes.codeHash, hash(code)),
        isNull(studentLinkCodes.usedAt),
        gt(studentLinkCodes.expiresAt, new Date()),
      ),
    );
  if (!row || (expectedStudentId && row.studentId !== expectedStudentId)) {
    recordFailure(tg.id);
    throw new LinkError("invalid_code", "That code is invalid or has expired.");
  }
  // Single use: atomically claim the code first, so two people racing with the
  // same code can't both link. Released again if the link itself is refused.
  const claimed = await db
    .update(studentLinkCodes)
    .set({ usedAt: new Date(), usedByTelegramId: tg.id })
    .where(and(eq(studentLinkCodes.id, row.id), isNull(studentLinkCodes.usedAt)))
    .returning({ id: studentLinkCodes.id });
  if (claimed.length === 0) {
    recordFailure(tg.id);
    throw new LinkError("invalid_code", "That code is invalid or has expired.");
  }
  try {
    return await linkAccount(row.studentId, tg, "code");
  } catch (err) {
    await db
      .update(studentLinkCodes)
      .set({ usedAt: null, usedByTelegramId: null })
      .where(eq(studentLinkCodes.id, row.id));
    throw err;
  }
}

/** Remove a link (student "log out" from the bot, or staff revoking it). */
export async function unlinkAccount(
  account: StudentTelegramAccount,
  actor: { userId?: string | null; type: "user" | "student" | "bot" },
) {
  await db.delete(studentTelegramAccounts).where(eq(studentTelegramAccounts.id, account.id));
  await audit({
    actorUserId: actor.userId ?? null,
    actorType: actor.type,
    action: "telegram.unlinked",
    entityType: "student",
    entityId: account.studentId,
    studentId: account.studentId,
    before: { telegramUserId: account.telegramUserId, username: account.telegramUsername },
  });
}

/** Clear the "blocked" flag when a user talks to the bot again. */
export async function markReachable(telegramUserId: number) {
  await db
    .update(studentTelegramAccounts)
    .set({ botBlocked: false, updatedAt: new Date() })
    .where(and(eq(studentTelegramAccounts.telegramUserId, telegramUserId), eq(studentTelegramAccounts.botBlocked, true)));
}

export async function setAccountLanguage(telegramUserId: number, lang: "uz" | "en") {
  await db
    .update(studentTelegramAccounts)
    .set({ languageCode: lang, updatedAt: new Date() })
    .where(eq(studentTelegramAccounts.telegramUserId, telegramUserId));
}
