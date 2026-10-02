/**
 * Student portal API — mounted at /api/student, BEFORE the staff auth gate.
 *
 * Security model: authenticateStudent derives the student from verified
 * Telegram initData only. No route here accepts a student id; every query is
 * filtered by req.student.id, and item routes (/payments/:id, …) look the item
 * up together with that owner id, answering 404 for anything else — so a
 * student can never read another student's data by changing an id.
 */
import { Router } from "express";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { asyncHandler } from "./helpers";
import { authenticateStudent, forbidPreviewWrites } from "../auth/student";
import { db } from "../db";
import {
  payments,
  studentNotificationPrefs,
  studentScores,
  attendanceRecords,
  students,
  classes,
  notifications,
} from "@shared/schema";
import { studentPrefsSchema } from "@shared/schema";
import { analyzeScores, scorePercent } from "@shared/scores";
import { NOTIFICATION_PREF_GROUPS, NOTIFICATION_TYPES } from "@shared/notifications";
import { summarize } from "@shared/attendance";
import { monthLabel } from "@shared/date";
import { tashkentDate, addDaysIso } from "@shared/lesson-schedule";
import { z } from "zod";
import { computeStudentBilling } from "../services/student-billing";
import { studentGroup, givenName } from "../services/student-portal";
import { studentRecords, studentSummary } from "../services/attendance";
import { listScores } from "../services/scores";
import { listForStudent, unreadCount, markAsRead, markAllRead } from "../notifications/service";
import { setAccountLanguage, unlinkAccount } from "../services/telegram-link";
import { isMonthSettled } from "@shared/billing";
import learnRouter from "./learn";
import studentHomeworkRouter from "./student-homework";
import { studentLeaderboardRouter } from "./leaderboard";

const router = Router();
router.use(authenticateStudent);
router.use(forbidPreviewWrites);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (id: string) => UUID_RE.test(id);

/** Map a payment row to the fields a student may see (no salary/staff data). */
function publicPayment(p: {
  id: string;
  amount: string;
  amountDue: string | null;
  method: string;
  billingMonth: string;
  createdAt: Date;
  refundedAmount: string | null;
}) {
  const amount = Number(p.amount);
  const due = p.amountDue == null ? null : Number(p.amountDue);
  const settled = isMonthSettled(amount, due);
  return {
    id: p.id,
    amount,
    amountDue: due,
    remaining: due == null ? 0 : Math.max(due - amount, 0),
    status: settled ? ("paid" as const) : ("partial" as const),
    method: p.method,
    type: "monthly" as const,
    billingMonth: p.billingMonth,
    monthLabel: monthLabel(p.billingMonth),
    refundedAmount: Number(p.refundedAmount ?? 0),
    createdAt: p.createdAt,
  };
}

/* ─────────────────────────────── profile ─────────────────────────────── */

async function profile(req: import("express").Request) {
  const s = req.student!;
  const group = await studentGroup(s);
  return {
    student: {
      id: s.id,
      fullName: s.fullName,
      givenName: givenName(s.fullName),
      phone: s.phone,
      enrolledAt: s.enrolledAt,
      active: s.active,
      sponsored: s.sponsored,
    },
    group,
    account: req.studentAccount
      ? {
          username: req.studentAccount.telegramUsername,
          languageCode: req.studentAccount.languageCode,
          verifiedAt: req.studentAccount.verifiedAt,
        }
      : null,
    preview: req.portalPreviewBy ? { by: req.portalPreviewBy.fullName } : null,
  };
}

/**
 * The groups this Telegram account can switch between (one student record per
 * group), each with its unread count. In preview it's just the viewed record.
 */
async function profilesFor(req: import("express").Request) {
  const ids = req.studentAccounts?.length ? req.studentAccounts.map((a) => a.studentId) : [req.student!.id];
  const rows = await db
    .select({
      studentId: students.id,
      fullName: students.fullName,
      active: students.active,
      groupName: classes.name,
      subject: classes.subject,
      unread: sql<number>`(select count(*)::int from ${notifications} n where n.student_id = ${students.id} and n.read_at is null)`,
    })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(inArray(students.id, ids));
  // Keep the link order (first linked first).
  return ids.map((id) => rows.find((r) => r.studentId === id)).filter(Boolean).map((r) => ({ ...r!, unread: Number(r!.unread) }));
}

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    res.json({
      ...(await profile(req)),
      unread: await unreadCount(req.student!.id),
      profiles: await profilesFor(req),
    });
  }),
);

/**
 * Everything the Home screen needs in one round trip: profile, money summary,
 * attendance summary, latest score, and the newest notifications.
 */
router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const s = req.student!;
    const since30 = addDaysIso(tashkentDate(), -30);
    const [p, bill, att, att30, recentAtt, latestScores, notes, unread] = await Promise.all([
      profile(req),
      computeStudentBilling(s),
      studentSummary(s.id),
      studentSummary(s.id, since30),
      studentRecords(s.id, { limit: 10 }),
      listScores({ studentId: s.id }, 1),
      listForStudent(s.id, { limit: 3 }),
      unreadCount(s.id),
    ]);
    const latest = latestScores[0];
    res.json({
      ...p,
      billing: {
        ...bill.billing,
        discount: bill.discounts[0] ?? null,
        freeze: bill.freezes[0] ?? null,
      },
      attendance: { summary: att, last30: att30, recent: recentAtt },
      latestScore: latest
        ? {
            id: latest.id,
            category: latest.category,
            title: latest.title,
            score: Number(latest.score),
            maxScore: Number(latest.maxScore),
            percent: scorePercent(Number(latest.score), Number(latest.maxScore)),
            scoreDate: latest.scoreDate,
          }
        : null,
      notifications: notes.items,
      unread,
    });
  }),
);

/* ─────────────────────────────── payments ─────────────────────────────── */

router.get(
  "/billing",
  asyncHandler(async (req, res) => {
    const bill = await computeStudentBilling(req.student!);
    res.json({ billing: bill.billing, discounts: bill.discounts, freezes: bill.freezes });
  }),
);

/** Payment history, newest first, paginated by `before` (an ISO timestamp). */
router.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
    const conds = [eq(payments.studentId, req.student!.id), eq(payments.voided, false), eq(payments.sponsored, false)];
    if (before && !Number.isNaN(before.getTime())) conds.push(lt(payments.createdAt, before));
    const rows = await db
      .select()
      .from(payments)
      .where(and(...conds))
      .orderBy(desc(payments.createdAt))
      .limit(limit + 1);
    const page = rows.slice(0, limit).map(publicPayment);
    res.json({
      items: page,
      nextBefore: rows.length > limit ? page[page.length - 1].createdAt : null,
    });
  }),
);

router.get(
  "/payments/:id",
  asyncHandler(async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: "not_found" });
    const [p] = await db
      .select()
      .from(payments)
      .where(
        and(eq(payments.id, req.params.id), eq(payments.studentId, req.student!.id), eq(payments.voided, false)),
      );
    if (!p) return res.status(404).json({ error: "not_found" });
    // Installments toward this month: the first payment, then each top-up
    // (amounts + dates only — never staff names or internal reasons).
    const topUps = (p.editHistory ?? [])
      .filter((h) => h.action === "edit" && /^top-up/i.test(h.reason ?? ""))
      .map((h) => ({
        at: h.at,
        amount: +(
          Number((h.after as { amount?: unknown })?.amount ?? 0) - Number((h.before as { amount?: unknown })?.amount ?? 0)
        ).toFixed(2),
      }));
    const first = topUps.length
      ? Number(((p.editHistory ?? []).find((h) => /^top-up/i.test(h.reason ?? ""))?.before as { amount?: unknown })?.amount ?? p.amount)
      : Number(p.amount);
    res.json({ ...publicPayment(p), installments: [{ at: p.createdAt, amount: first }, ...topUps] });
  }),
);

/* ────────────────────────────── attendance ────────────────────────────── */

router.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const from = typeof req.query.from === "string" && iso.test(req.query.from) ? req.query.from : undefined;
    const to = typeof req.query.to === "string" && iso.test(req.query.to) ? req.query.to : undefined;
    const [all, records] = await Promise.all([
      studentSummary(req.student!.id),
      studentRecords(req.student!.id, { from, to, limit: 500 }),
    ]);
    res.json({ summary: all, range: from || to ? summarize(records.map((r) => r.status)) : all, records });
  }),
);

router.get(
  "/attendance/:id",
  asyncHandler(async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: "not_found" });
    const [own] = await db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.id, req.params.id), eq(attendanceRecords.studentId, req.student!.id)));
    if (!own) return res.status(404).json({ error: "not_found" });
    const rows = await studentRecords(req.student!.id, { limit: 1000 });
    const rec = rows.find((r) => r.id === own.id);
    if (!rec) return res.status(404).json({ error: "not_found" });
    res.json(rec);
  }),
);

/* ─────────────────────────────── scores ─────────────────────────────── */

const publicScore = (s: Awaited<ReturnType<typeof listScores>>[number]) => ({
  id: s.id,
  category: s.category,
  title: s.title,
  score: Number(s.score),
  maxScore: Number(s.maxScore),
  percent: scorePercent(Number(s.score), Number(s.maxScore)),
  scoreDate: s.scoreDate,
  comment: s.comment,
  attachmentUrl: s.attachmentUrl,
  teacherName: s.teacherName,
  className: s.className,
  updatedAt: s.updatedAt,
});

router.get(
  "/scores",
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const rows = await listScores({ studentId: req.student!.id, category }, 300);
    res.json(rows.map(publicScore));
  }),
);

router.get(
  "/scores/:id",
  asyncHandler(async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: "not_found" });
    const [own] = await db
      .select({ id: studentScores.id })
      .from(studentScores)
      .where(and(eq(studentScores.id, req.params.id), eq(studentScores.studentId, req.student!.id)));
    if (!own) return res.status(404).json({ error: "not_found" });
    const rows = await listScores({ studentId: req.student!.id }, 1000);
    const s = rows.find((r) => r.id === own.id);
    if (!s) return res.status(404).json({ error: "not_found" });
    res.json(publicScore(s));
  }),
);

/** Simple, student-friendly analytics over all their scores. */
router.get(
  "/progress",
  asyncHandler(async (req, res) => {
    const rows = await listScores({ studentId: req.student!.id }, 1000);
    const analytics = analyzeScores(
      rows.map((r) => ({
        category: r.category,
        score: Number(r.score),
        maxScore: Number(r.maxScore),
        scoreDate: r.scoreDate,
      })),
    );
    res.json({ analytics, recent: rows.slice(0, 10).map(publicScore) });
  }),
);

/* ──────────────────────────── notifications ──────────────────────────── */

router.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const page = await listForStudent(req.student!.id, {
      cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
      limit: Number(req.query.limit) || 20,
      unreadOnly: req.query.unread === "1",
    });
    res.json({ ...page, unread: await unreadCount(req.student!.id) });
  }),
);

router.post(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    const n = await markAllRead(req.student!.id);
    res.json({ ok: true, marked: n, unread: 0 });
  }),
);

router.post(
  "/notifications/:id/read",
  asyncHandler(async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: "not_found" });
    const ok = await markAsRead(req.student!.id, req.params.id);
    if (!ok) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, unread: await unreadCount(req.student!.id) });
  }),
);

/* ─────────────────────────────── settings ─────────────────────────────── */

router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    const [row] = await db
      .select()
      .from(studentNotificationPrefs)
      .where(eq(studentNotificationPrefs.studentId, req.student!.id));
    // Which groups contain only mandatory types (shown as locked "always on").
    const mandatoryGroups = NOTIFICATION_PREF_GROUPS.filter((g) =>
      Object.values(NOTIFICATION_TYPES).some((t) => t.prefGroup === g && "mandatory" in t && t.mandatory),
    );
    res.json({
      groups: NOTIFICATION_PREF_GROUPS,
      disabled: row?.disabled ?? [],
      partlyMandatory: mandatoryGroups,
      language: req.studentAccount?.languageCode ?? "uz",
    });
  }),
);

router.put(
  "/settings",
  asyncHandler(async (req, res) => {
    const body = studentPrefsSchema.extend({ language: z.enum(["uz", "en"]).optional() }).parse(req.body);
    const disabled = [...new Set(body.disabled)].filter((g) =>
      (NOTIFICATION_PREF_GROUPS as readonly string[]).includes(g),
    );
    await db
      .insert(studentNotificationPrefs)
      .values({ studentId: req.student!.id, disabled })
      .onConflictDoUpdate({
        target: studentNotificationPrefs.studentId,
        set: { disabled, updatedAt: new Date() },
      });
    if (body.language && req.studentAccount) {
      await setAccountLanguage(req.studentAccount.telegramUserId, body.language);
    }
    res.json({ ok: true, disabled, language: body.language ?? req.studentAccount?.languageCode ?? "uz" });
  }),
);

/** Disconnect this Telegram account from all its linked groups (log out). */
router.post(
  "/unlink",
  asyncHandler(async (req, res) => {
    if (!req.studentAccounts?.length) return res.status(400).json({ error: "no_account" });
    for (const acc of req.studentAccounts) await unlinkAccount(acc, { type: "student" });
    res.json({ ok: true, unlinked: req.studentAccounts.length });
  }),
);

/* ─────────────────────────────── learning ─────────────────────────────── */

// Vocabulary & practice (inherits the student auth + preview guard above).
router.use("/learn", learnRouter);

// Homework: see, hand in, get feedback (own group record only).
router.use("/homework", studentHomeworkRouter);

// Group + centre leaderboards (read-only; public names for other students).
router.use("/leaderboard", studentLeaderboardRouter);

// Anything else under /api/student is unknown — never fall through to staff routes.
router.use((_req, res) => res.status(404).json({ error: "not_found" }));

export default router;
