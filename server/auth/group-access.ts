/**
 * Who may see / manage a group's attendance and scores.
 *
 *  - view:       the group's own teacher, or any non-teacher staff (CEO,
 *                accountant, assistant), or a teacher granted manage_*.
 *  - attendance: the group's own teacher, or anyone with manage_attendance.
 *  - scores:     the group's own teacher, or anyone with manage_scores.
 *
 * Branch scoping always applies on top (restricted users only reach their
 * branches). Teachers never gain finance access through these routes.
 */
import type { Request } from "express";
import { can } from "@shared/permissions";
import type { Class, Student } from "@shared/schema";
import { getClassById, getStudentById } from "../storage";
import { assertBranchAccess } from "./middleware";
import { httpError } from "../routes/helpers";

export type GroupNeed = "view" | "attendance" | "scores" | "homework" | "assign_homework";

export function canOnGroup(req: Request, cls: Class, need: GroupNeed): boolean {
  const u = req.authUser!;
  const own = u.role === "teacher" && !!req.teacherId && cls.teacherId === req.teacherId;
  if (own) return true;
  if (need === "attendance") return can(u, "manage_attendance");
  if (need === "scores") return can(u, "manage_scores");
  // See + check submissions.
  if (need === "homework") return can(u, "check_homework") || can(u, "assign_homework");
  if (need === "assign_homework") return can(u, "assign_homework");
  // view
  if (u.role !== "teacher") return true;
  return can(u, "manage_attendance") || can(u, "manage_scores");
}

export async function loadGroup(req: Request, classId: string, need: GroupNeed): Promise<Class> {
  const cls = await getClassById(classId);
  if (!cls) throw httpError(404, "not_found", "Group not found.");
  assertBranchAccess(req, cls.branchId);
  if (!canOnGroup(req, cls, need)) throw httpError(403, "forbidden", "You don't have access to this group.");
  return cls;
}

/** Load a student and check the caller may act on them through their group. */
export async function loadStudentViaGroup(
  req: Request,
  studentId: string,
  need: GroupNeed,
): Promise<{ student: Student; cls: Class }> {
  const student = await getStudentById(studentId);
  if (!student) throw httpError(404, "not_found", "Student not found.");
  const cls = await loadGroup(req, student.classId, need);
  return { student, cls };
}

/** Is the caller the group's own teacher (vs. management acting on it)? */
export function isOwnTeacher(req: Request, cls: Class): boolean {
  return req.authUser!.role === "teacher" && cls.teacherId === req.teacherId;
}
