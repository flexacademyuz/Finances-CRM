/**
 * Homework API (staff): per group, homework (parts × students, each marked
 * done or not done) and task tables (tasks × students, ticked when done).
 *
 *  add / edit / delete homework and task tables
 *                                 the group's own teacher, or assign_homework (CEO)
 *  mark / tick students           the group's own teacher, or check_homework
 *                                 (assistants by default) / assign_homework
 *
 * Students never hand anything in here. Branch scoping always applies
 * (loadGroup → assertBranchAccess).
 */
import { Router, type Request } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { asyncHandler, httpError } from "./helpers";
import { branchFilter } from "../auth/middleware";
import { canOnGroup, loadGroup, loadStudentViaGroup } from "../auth/group-access";
import { db } from "../db";
import { classes, homework, homeworkTrackers, teachers, users, type Homework, type HomeworkTracker } from "@shared/schema";
import { can } from "@shared/permissions";
import {
  createHomeworkSchema,
  createTrackerSchema,
  homeworkState,
  markHomeworkSchema,
  reconcileParts,
  splitParts,
  tickTrackerSchema,
  trackerColumns,
  updateHomeworkSchema,
  updateTrackerSchema,
} from "@shared/homework";
import { nextLesson } from "@shared/lesson-schedule";
import { personRecordIds } from "../learning/learner";
import {
  getHomework,
  getTracker,
  groupGrid,
  groupTrackers,
  homeworkTitle,
  markHomework,
  marksFor,
  notifyAssigned,
  partsOf,
  pruneMarks,
  pruneTrackerTicks,
  publicHomework,
  publicTracker,
  queueTeacherReport,
  studentHomeworkSummary,
  tally,
  tickTracker,
} from "../services/homework";
import { audit } from "../services/audit";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checks or sets homework beyond their own groups. */
const groupWide = (req: Request) => can(req.authUser!, "check_homework") || can(req.authUser!, "assign_homework");

async function hwOr404(id: string): Promise<Homework> {
  const hw = UUID_RE.test(id) ? await getHomework(id) : undefined;
  if (!hw) throw httpError(404, "not_found", "Homework not found.");
  return hw;
}

async function trackerOr404(id: string): Promise<HomeworkTracker> {
  const t = UUID_RE.test(id) ? await getTracker(id) : undefined;
  if (!t) throw httpError(404, "not_found", "Task table not found.");
  return t;
}

/** The groups this user works with on the Homework page. */
router.get(
  "/homework/groups",
  asyncHandler(async (req, res) => {
    const u = req.authUser!;
    const conds = [eq(classes.active, true)];
    if (!groupWide(req)) {
      if (u.role !== "teacher" || !req.teacherId) throw httpError(403, "forbidden", "You don't have access to homework.");
      conds.push(eq(classes.teacherId, req.teacherId));
    } else {
      const branch = branchFilter(req);
      if (branch) conds.push(eq(classes.branchId, branch));
    }
    const groups = await db
      .select({ cls: classes, teacherName: users.fullName })
      .from(classes)
      .leftJoin(teachers, eq(teachers.id, classes.teacherId))
      .leftJoin(users, eq(users.id, teachers.userId))
      .where(and(...conds))
      .orderBy(asc(classes.name));
    res.json(
      groups.map(({ cls, teacherName }) => {
        const next = nextLesson(cls.scheduleSlots);
        return {
          id: cls.id,
          name: cls.name,
          teacherName,
          canAssign: canOnGroup(req, cls, "assign_homework"),
          canCheck: canOnGroup(req, cls, "homework"),
          nextLessonAt: next ? next.startsAt.toISOString() : null,
        };
      }),
    );
  }),
);

/** The group's homework with every student's marks. ?view=active|all */
router.get(
  "/groups/:id/homework",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "homework");
    const view = req.query.view === "all" ? "all" : "active";
    const next = nextLesson(cls.scheduleSlots);
    res.json({
      group: { id: cls.id, name: cls.name, nextLessonAt: next ? next.startsAt.toISOString() : null },
      canAssign: canOnGroup(req, cls, "assign_homework"),
      canCheck: true,
      ...(await groupGrid(cls.id, view)),
    });
  }),
);

/** Add homework: { text (one part per line), dueAt, notify }. */
router.post(
  "/groups/:id/homework",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "assign_homework");
    const input = createHomeworkSchema.parse(req.body);
    const parts = reconcileParts([], splitParts(input.text));
    const [hw] = await db
      .insert(homework)
      .values({
        classId: cls.id,
        branchId: cls.branchId,
        teacherId: cls.teacherId,
        title: homeworkTitle(parts),
        parts,
        dueAt: input.dueAt,
        createdBy: req.authUser!.id,
      })
      .returning();
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "homework.created",
      entityType: "homework",
      entityId: hw.id,
      branchId: cls.branchId,
      after: { parts: hw.parts, dueAt: hw.dueAt, classId: cls.id },
    });
    if (input.notify) void notifyAssigned(hw).catch((err) => console.warn("[homework] assign notify failed:", (err as Error).message));
    res.status(201).json(publicHomework(hw));
  }),
);

router.patch(
  "/homework/:id",
  asyncHandler(async (req, res) => {
    const hw = await hwOr404(req.params.id);
    await loadGroup(req, hw.classId, "assign_homework");
    const p = updateHomeworkSchema.parse(req.body);
    const patch: Partial<typeof homework.$inferInsert> = { updatedAt: new Date() };
    if (p.text !== undefined) {
      // Parts that stayed keep their id, and so their marks.
      patch.parts = reconcileParts(partsOf(hw), splitParts(p.text));
      patch.title = homeworkTitle(patch.parts);
    }
    if (p.dueAt !== undefined) patch.dueAt = p.dueAt;
    if (p.status !== undefined) patch.status = p.status;
    const [updated] = await db.update(homework).set(patch).where(eq(homework.id, hw.id)).returning();
    if (p.text !== undefined) await pruneMarks(updated);
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "homework.updated",
      entityType: "homework",
      entityId: hw.id,
      branchId: hw.branchId,
      before: { parts: hw.parts, dueAt: hw.dueAt, status: hw.status },
      after: { parts: updated.parts, dueAt: updated.dueAt, status: updated.status },
    });
    res.json(publicHomework(updated));
  }),
);

router.delete(
  "/homework/:id",
  asyncHandler(async (req, res) => {
    const hw = await hwOr404(req.params.id);
    await loadGroup(req, hw.classId, "assign_homework");
    await db.delete(homework).where(eq(homework.id, hw.id));
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "homework.deleted",
      entityType: "homework",
      entityId: hw.id,
      branchId: hw.branchId,
      before: { parts: hw.parts, dueAt: hw.dueAt, classId: hw.classId },
    });
    res.json({ ok: true });
  }),
);

/** Mark students: { studentIds, partIds?, status: "done" | "missed" | null }. */
router.post(
  "/homework/:id/marks",
  asyncHandler(async (req, res) => {
    const hw = await hwOr404(req.params.id);
    const cls = await loadGroup(req, hw.classId, "homework");
    const { studentIds, partIds, status } = markHomeworkSchema.parse(req.body);
    const changed = await markHomework(hw, studentIds, partIds, status, req.authUser!.id);
    if (changed.length) {
      await audit({
        actorUserId: req.authUser!.id,
        actorType: "user",
        action: status ? `homework.marked_${status}` : "homework.cleared",
        entityType: "homework",
        entityId: hw.id,
        branchId: hw.branchId,
        after: { studentIds: changed, partIds: partIds ?? null },
      });
      // Marked by someone other than the group's teacher: keep the teacher informed.
      const ownTeacher = req.authUser!.role === "teacher" && cls.teacherId === req.teacherId;
      if (!ownTeacher) queueTeacherReport(hw.id, req.authUser!.fullName);
    }
    res.json({ changed });
  }),
);

/** A student's homework record (their profile page). */
router.get(
  "/students/:id/homework",
  asyncHandler(async (req, res) => {
    const { student, cls } = await loadStudentViaGroup(req, req.params.id, "view");
    const summary = await studentHomeworkSummary(await personRecordIds(student));
    const now = new Date();
    const list = await db
      .select()
      .from(homework)
      .where(and(eq(homework.classId, cls.id), eq(homework.status, "active")))
      .orderBy(desc(homework.dueAt))
      .limit(20);
    const marks = await marksFor(list.map((h) => h.id));
    res.json({
      summary,
      recent: list.map((h) => {
        const parts = partsOf(h);
        const t = tally(parts, marks.get(h.id)?.get(student.id));
        return {
          id: h.id,
          title: homeworkTitle(parts),
          dueAt: h.dueAt.toISOString(),
          partsDone: t.done,
          partsTotal: t.total,
          state: homeworkState(t, h.dueAt, now),
        };
      }),
    });
  }),
);

/* ─────────────────────────────── task tables ─────────────────────────────── */

/** A group's task tables with every student's ticks. ?view=active|all */
router.get(
  "/groups/:id/homework-tables",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "homework");
    const view = req.query.view === "all" ? "all" : "active";
    res.json({ canAssign: canOnGroup(req, cls, "assign_homework"), canCheck: true, ...(await groupTrackers(cls.id, view)) });
  }),
);

/** Make a task table: { title, columns: { count } | { labels (one per line) } }. */
router.post(
  "/groups/:id/homework-tables",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "assign_homework");
    const input = createTrackerSchema.parse(req.body);
    const [t] = await db
      .insert(homeworkTrackers)
      .values({ classId: cls.id, branchId: cls.branchId, title: input.title, columns: trackerColumns([], input.columns), createdBy: req.authUser!.id })
      .returning();
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "homework_table.created",
      entityType: "homework_table",
      entityId: t.id,
      branchId: cls.branchId,
      after: { title: t.title, columns: t.columns.length, classId: cls.id },
    });
    res.status(201).json(publicTracker(t));
  }),
);

router.patch(
  "/homework-tables/:id",
  asyncHandler(async (req, res) => {
    const t = await trackerOr404(req.params.id);
    await loadGroup(req, t.classId, "assign_homework");
    const p = updateTrackerSchema.parse(req.body);
    const patch: Partial<typeof homeworkTrackers.$inferInsert> = { updatedAt: new Date() };
    if (p.title !== undefined) patch.title = p.title;
    if (p.columns !== undefined) patch.columns = trackerColumns(t.columns, p.columns);
    if (p.status !== undefined) patch.status = p.status;
    const [updated] = await db.update(homeworkTrackers).set(patch).where(eq(homeworkTrackers.id, t.id)).returning();
    if (p.columns !== undefined) await pruneTrackerTicks(updated);
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "homework_table.updated",
      entityType: "homework_table",
      entityId: t.id,
      branchId: t.branchId,
      before: { title: t.title, columns: t.columns, status: t.status },
      after: { title: updated.title, columns: updated.columns, status: updated.status },
    });
    res.json(publicTracker(updated));
  }),
);

router.delete(
  "/homework-tables/:id",
  asyncHandler(async (req, res) => {
    const t = await trackerOr404(req.params.id);
    await loadGroup(req, t.classId, "assign_homework");
    await db.delete(homeworkTrackers).where(eq(homeworkTrackers.id, t.id));
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "homework_table.deleted",
      entityType: "homework_table",
      entityId: t.id,
      branchId: t.branchId,
      before: { title: t.title, columns: t.columns.length, classId: t.classId },
    });
    res.json({ ok: true });
  }),
);

/** Tick / untick one task: { studentIds, columnId, done }. */
router.post(
  "/homework-tables/:id/ticks",
  asyncHandler(async (req, res) => {
    const t = await trackerOr404(req.params.id);
    await loadGroup(req, t.classId, "homework");
    const { studentIds, columnId, done } = tickTrackerSchema.parse(req.body);
    const changed = await tickTracker(t, studentIds, columnId, done, req.authUser!.id);
    if (changed.length) {
      await audit({
        actorUserId: req.authUser!.id,
        actorType: "user",
        action: done ? "homework_table.ticked" : "homework_table.unticked",
        entityType: "homework_table",
        entityId: t.id,
        branchId: t.branchId,
        after: { studentIds: changed, columnId },
      });
    }
    res.json({ changed });
  }),
);

export default router;
