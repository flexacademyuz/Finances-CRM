/**
 * Staff-side management of the student portal: settings, Telegram link codes,
 * linked accounts, announcements, the delivery log and the audit trail.
 */
import { Router } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { asyncHandler, httpError } from "./helpers";
import { requireRole, branchFilter, assertBranchAccess } from "../auth/middleware";
import { loadStudentViaGroup, isOwnTeacher } from "../auth/group-access";
import { db } from "../db";
import {
  announcements,
  notificationDeliveries,
  notifications,
  settings as settingsTable,
  students,
  studentTelegramAccounts,
  createAnnouncementSchema,
  portalSettingsSchema,
} from "@shared/schema";
import { can } from "@shared/permissions";
import { formatLinkCode } from "@shared/linking";
import { resolvePortalSettings } from "@shared/notifications";
import { getClassById, getSettings } from "../storage";
import { generateLinkCode, listAccountsForStudent, unlinkAccount } from "../services/telegram-link";
import { createMany, portalSettings } from "../notifications/service";
import { runDailyStudentJobs, runLessonReminders } from "../notifications/scheduler";
import { processQueue } from "../notifications/queue";
import { audit, listAudit } from "../services/audit";
import { botUsername } from "../bot/client";
import { emit } from "../events";

const router = Router();

/* ─────────────────────────────── settings ─────────────────────────────── */

router.get(
  "/portal/settings",
  requireRole("ceo", "accountant"),
  asyncHandler(async (_req, res) => {
    res.json(await portalSettings());
  }),
);

router.patch(
  "/portal/settings",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const patch = portalSettingsSchema.parse(req.body);
    const current = await getSettings();
    const before = resolvePortalSettings(current?.studentPortal);
    const merged = { ...(current?.studentPortal ?? {}), ...patch };
    if (patch.lessonReminderHours) {
      merged.lessonReminderHours = [...new Set(patch.lessonReminderHours)].sort((a, b) => b - a);
    }
    await db.update(settingsTable).set({ studentPortal: merged, updatedAt: new Date() }).where(eq(settingsTable.id, "global"));
    const after = resolvePortalSettings(merged);
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "portal.settings_changed",
      entityType: "settings",
      entityId: "global",
      before,
      after,
    });
    res.json(after);
  }),
);

/** GET /api/portal/overview — adoption + delivery health for the settings page. */
router.get(
  "/portal/overview",
  requireRole("ceo", "accountant"),
  asyncHandler(async (req, res) => {
    const bid = branchFilter(req);
    const studentScope = bid ? eq(students.branchId, bid) : undefined;
    const [[active], [linked], deliveries, failures] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(students)
        .where(and(eq(students.active, true), studentScope)),
      db
        .select({
          students: sql<number>`count(distinct ${studentTelegramAccounts.studentId})::int`,
          accounts: sql<number>`count(*)::int`,
          blocked: sql<number>`count(*) filter (where ${studentTelegramAccounts.botBlocked})::int`,
        })
        .from(studentTelegramAccounts)
        .innerJoin(students, eq(studentTelegramAccounts.studentId, students.id))
        .where(and(eq(students.active, true), studentScope)),
      db
        .select({ status: notificationDeliveries.status, n: sql<number>`count(*)::int` })
        .from(notificationDeliveries)
        .where(gte(notificationDeliveries.createdAt, new Date(Date.now() - 7 * 86_400_000)))
        .groupBy(notificationDeliveries.status),
      db
        .select({
          id: notificationDeliveries.id,
          status: notificationDeliveries.status,
          attempts: notificationDeliveries.attempts,
          lastError: notificationDeliveries.lastError,
          updatedAt: notificationDeliveries.updatedAt,
          type: notifications.type,
          studentName: students.fullName,
        })
        .from(notificationDeliveries)
        .innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
        .innerJoin(students, eq(notifications.studentId, students.id))
        .where(and(inArray(notificationDeliveries.status, ["failed", "skipped"]), studentScope))
        .orderBy(desc(notificationDeliveries.updatedAt))
        .limit(15),
    ]);
    res.json({
      activeStudents: Number(active?.n ?? 0),
      linkedStudents: Number(linked?.students ?? 0),
      linkedAccounts: Number(linked?.accounts ?? 0),
      blockedAccounts: Number(linked?.blocked ?? 0),
      deliveries7d: Object.fromEntries(deliveries.map((d) => [d.status, Number(d.n)])),
      recentProblems: failures,
      botUsername: await botUsername(),
    });
  }),
);

/** POST /api/portal/run-jobs — run reminders + daily jobs now (support/testing). */
router.post(
  "/portal/run-jobs",
  requireRole("ceo"),
  asyncHandler(async (_req, res) => {
    const reminders = await runLessonReminders();
    const daily = await runDailyStudentJobs();
    const sent = await processQueue(10_000);
    res.json({ reminders, daily, delivered: sent });
  }),
);

/* ───────────────────────── Telegram links per student ───────────────────────── */

router.get(
  "/students/:id/telegram",
  asyncHandler(async (req, res) => {
    const { student } = await loadStudentViaGroup(req, req.params.id, "view");
    const accounts = await listAccountsForStudent(student.id);
    res.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        username: a.telegramUsername,
        firstName: a.firstName,
        method: a.verificationMethod,
        verifiedAt: a.verifiedAt,
        botBlocked: a.botBlocked,
        languageCode: a.languageCode,
      })),
      botUsername: await botUsername(),
    });
  }),
);

/**
 * POST /api/students/:id/telegram/code — issue a one-time link code (shown
 * once). The student's own teacher, or staff who can edit students.
 */
router.post(
  "/students/:id/telegram/code",
  asyncHandler(async (req, res) => {
    const { student, cls } = await loadStudentViaGroup(req, req.params.id, "view");
    if (!isOwnTeacher(req, cls) && !can(req.authUser!, "edit_student")) {
      throw httpError(403, "forbidden", "You can't issue link codes for this student.");
    }
    if (!student.active) throw httpError(400, "student_inactive", "This student is stopped.");
    const { code, expiresAt } = await generateLinkCode(student.id, req.authUser!.id);
    const username = await botUsername();
    res.status(201).json({
      code,
      formatted: formatLinkCode(code),
      expiresAt,
      deepLink: username ? `https://t.me/${username}?start=link_${code}` : null,
    });
  }),
);

router.delete(
  "/students/:id/telegram/:accountId",
  requireRole("ceo", "accountant"),
  asyncHandler(async (req, res) => {
    const { student } = await loadStudentViaGroup(req, req.params.id, "view");
    const [acc] = await db
      .select()
      .from(studentTelegramAccounts)
      .where(and(eq(studentTelegramAccounts.id, req.params.accountId), eq(studentTelegramAccounts.studentId, student.id)));
    if (!acc) throw httpError(404, "not_found", "Linked account not found.");
    await unlinkAccount(acc, { userId: req.authUser!.id, type: "user" });
    res.json({ ok: true });
  }),
);

/* ─────────────────────────────── announcements ─────────────────────────────── */

router.get(
  "/announcements",
  requireRole("ceo", "accountant", "assistant"),
  asyncHandler(async (req, res) => {
    const bid = branchFilter(req);
    const rows = await db
      .select()
      .from(announcements)
      .where(bid ? sql`(${announcements.branchId} = ${bid} or ${announcements.branchId} is null)` : undefined)
      .orderBy(desc(announcements.createdAt))
      .limit(50);
    res.json(rows);
  }),
);

/**
 * POST /api/announcements — send to one group, one branch, or everyone the
 * sender can reach (restricted users are clamped to their branch).
 */
router.post(
  "/announcements",
  requireRole("ceo", "accountant"),
  asyncHandler(async (req, res) => {
    const input = createAnnouncementSchema.parse(req.body);
    let branchId = input.branchId ?? null;
    const classId = input.classId ?? null;
    if (classId) {
      const cls = await getClassById(classId);
      if (!cls) throw httpError(404, "not_found", "Group not found.");
      assertBranchAccess(req, cls.branchId);
      branchId = cls.branchId;
    } else if (branchId) {
      assertBranchAccess(req, branchId);
    } else if ((req.userBranches ?? []).length > 0) {
      // Restricted users can't broadcast company-wide: use their current branch.
      branchId = branchFilter(req) ?? null;
    }

    const conds = [eq(students.active, true)];
    if (classId) conds.push(eq(students.classId, classId));
    else if (branchId) conds.push(eq(students.branchId, branchId));
    const recipients = await db.select({ id: students.id }).from(students).where(and(...conds));

    const [ann] = await db
      .insert(announcements)
      .values({
        title: input.title,
        body: input.body,
        kind: input.kind,
        branchId,
        classId,
        recipients: recipients.length,
        createdBy: req.authUser!.id,
      })
      .returning();
    const created = await createMany(
      recipients.map((r) => ({
        studentId: r.id,
        type: "announcement" as const,
        params: { title: input.title, body: input.body, kind: input.kind },
        entityType: "announcement",
        entityId: ann.id,
        dedupeKey: `announcement:${ann.id}:${r.id}`,
      })),
    );
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "announcement.created",
      entityType: "announcement",
      entityId: ann.id,
      branchId,
      after: { title: input.title, kind: input.kind, classId, recipients: recipients.length, delivered: created.length },
    });
    emit("announcement.created", { announcementId: ann.id, actorUserId: req.authUser!.id });
    res.status(201).json({ ...ann, notified: created.length });
  }),
);

/* ─────────────────────────────── audit log ─────────────────────────────── */

router.get(
  "/audit",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const q = req.query;
    res.json(
      await listAudit({
        entityType: typeof q.entityType === "string" ? q.entityType : undefined,
        entityId: typeof q.entityId === "string" ? q.entityId : undefined,
        studentId: typeof q.studentId === "string" ? q.studentId : undefined,
        limit: Number(q.limit) || 100,
      }),
    );
  }),
);

export default router;
