/**
 * Homework API (staff) — a checklist per group.
 *
 *  add / edit / delete homework   the group's own teacher, or assign_homework (CEO)
 *  tick who did it                the group's own teacher, or check_homework
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
import { classes, homework, homeworkSubmissions, teachers, users, type Homework } from "@shared/schema";
import { can } from "@shared/permissions";
import { createHomeworkSchema, homeworkState, markHomeworkSchema, updateHomeworkSchema } from "@shared/homework";
import { nextLesson } from "@shared/lesson-schedule";
import { personRecordIds } from "../learning/learner";
import {
  getHomework,
  groupGrid,
  markHomework,
  notifyAssigned,
  publicHomework,
  queueTeacherReport,
  studentHomeworkSummary,
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

/** The tick grid: the group's homework × its students. ?view=active|all */
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

router.post(
  "/groups/:id/homework",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "assign_homework");
    const input = createHomeworkSchema.parse(req.body);
    const [hw] = await db
      .insert(homework)
      .values({
        classId: cls.id,
        branchId: cls.branchId,
        teacherId: cls.teacherId,
        title: input.title,
        instructions: input.instructions,
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
      after: { title: hw.title, dueAt: hw.dueAt, classId: cls.id },
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
    if (p.title !== undefined) patch.title = p.title;
    if (p.instructions !== undefined) patch.instructions = p.instructions;
    if (p.dueAt !== undefined) patch.dueAt = p.dueAt;
    if (p.status !== undefined) patch.status = p.status;
    const [updated] = await db.update(homework).set(patch).where(eq(homework.id, hw.id)).returning();
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "homework.updated",
      entityType: "homework",
      entityId: hw.id,
      branchId: hw.branchId,
      before: { title: hw.title, dueAt: hw.dueAt, status: hw.status },
      after: { title: updated.title, dueAt: updated.dueAt, status: updated.status },
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
      before: { title: hw.title, dueAt: hw.dueAt, classId: hw.classId },
    });
    res.json({ ok: true });
  }),
);

/** Tick / untick students: { studentIds, done }. */
router.post(
  "/homework/:id/marks",
  asyncHandler(async (req, res) => {
    const hw = await hwOr404(req.params.id);
    const cls = await loadGroup(req, hw.classId, "homework");
    const { studentIds, done } = markHomeworkSchema.parse(req.body);
    const changed = await markHomework(hw, studentIds, done, req.authUser!.id);
    if (changed.length) {
      await audit({
        actorUserId: req.authUser!.id,
        actorType: "user",
        action: done ? "homework.ticked" : "homework.unticked",
        entityType: "homework",
        entityId: hw.id,
        branchId: hw.branchId,
        after: { studentIds: changed },
      });
      // Ticked by someone other than the group's teacher: keep the teacher informed.
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
      .select({ h: homework, tick: homeworkSubmissions.id })
      .from(homework)
      .leftJoin(
        homeworkSubmissions,
        and(eq(homeworkSubmissions.homeworkId, homework.id), eq(homeworkSubmissions.studentId, student.id), eq(homeworkSubmissions.status, "done")),
      )
      .where(and(eq(homework.classId, cls.id), eq(homework.status, "active")))
      .orderBy(desc(homework.dueAt))
      .limit(20);
    res.json({
      summary,
      recent: list.map(({ h, tick }) => ({ id: h.id, title: h.title, dueAt: h.dueAt.toISOString(), state: homeworkState(!!tick, h.dueAt, now) })),
    });
  }),
);

export default router;
