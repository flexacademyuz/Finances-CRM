import { Router, type Request } from "express";
import { asyncHandler } from "./helpers";
import { requirePermission } from "../auth/middleware";
import {
  insertLeadSchema,
  updateLeadSchema,
  approveLeadSchema,
  rejectLeadSchema,
  insertDraftClassSchema,
  assignTeacherSchema,
  type LeadStatus,
} from "@shared/schema";
import {
  listLeads,
  getLeadById,
  createLead,
  updateLead,
  approveLead,
  rejectLead,
  deleteLead,
  listDraftClasses,
  getDraftClassById,
  createDraftClass,
  deleteDraftClass,
  assignTeacherToDraft,
  getClassById,
  type LeadFilter,
} from "../storage";
import { recomputeStatuses } from "../services/billing";

const router = Router();

/** A teacher may only act on a group they own. */
async function assertClassWritable(req: Request, classId: string) {
  const cls = await getClassById(classId);
  if (!cls) throw new Error("Class not found");
  if (req.authUser!.role === "teacher" && cls.teacherId !== req.teacherId) {
    throw new Error("forbidden");
  }
  return cls;
}

/**
 * GET /api/leads — the intake pipeline. CEO/Accountant see every lead;
 * teachers see only leads whose target group is theirs (so they can approve
 * their own). Filterable by status and class.
 */
router.get(
  "/leads",
  asyncHandler(async (req, res) => {
    const filter: LeadFilter = {};
    const { status, classId, draftClassId } = req.query;
    if (typeof status === "string") filter.status = status as LeadStatus;
    if (typeof classId === "string") filter.classId = classId;
    if (typeof draftClassId === "string") filter.draftClassId = draftClassId;
    if (req.authUser!.role === "teacher") filter.teacherId = req.teacherId; // hard scope
    res.json(await listLeads(filter));
  }),
);

/**
 * Register a new-student lead. Anyone who can add students may register one; a
 * teacher may only target one of their own groups (or leave it unplaced).
 */
router.post(
  "/leads",
  requirePermission("add_student"),
  asyncHandler(async (req, res) => {
    const input = insertLeadSchema.parse(req.body);
    if (input.classId) await assertClassWritable(req, input.classId);
    if (input.draftClassId && !(await getDraftClassById(input.draftClassId))) {
      return res.status(404).json({ error: "not_found", message: "Draft class not found." });
    }
    const created = await createLead({
      fullName: input.fullName,
      phone: input.phone ?? null,
      subject: input.subject ?? null,
      gradeAtSchool: input.gradeAtSchool ?? null,
      level: input.level ?? null,
      shift: input.shift,
      classId: input.classId ?? null,
      draftClassId: input.draftClassId ?? null,
      createdBy: req.authUser!.id,
    });
    res.status(201).json(created);
  }),
);

/** Edit a pending lead's details, or reassign (swap) it to another group. */
router.patch(
  "/leads/:id",
  requirePermission("add_student"),
  asyncHandler(async (req, res) => {
    const existing = await getLeadById(req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    if (existing.status !== "pending") {
      return res.status(409).json({ error: "not_pending", message: "Only pending leads can be edited." });
    }
    const patch = updateLeadSchema.parse(req.body);
    // Teachers can only move a lead between their own groups.
    if (patch.classId) await assertClassWritable(req, patch.classId);
    const updated = await updateLead(req.params.id, patch);
    res.json(updated);
  }),
);

/**
 * Approve a lead into a group. Creates the student and anchors billing to the
 * approval date (they start studying from that day on). Requires approve_leads;
 * teachers may only approve into their own groups.
 */
router.post(
  "/leads/:id/approve",
  requirePermission("approve_leads"),
  asyncHandler(async (req, res) => {
    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: "not_found" });
    if (lead.status !== "pending") {
      return res.status(409).json({ error: "not_pending", message: "This lead has already been decided." });
    }
    const input = approveLeadSchema.parse(req.body);
    const classId = input.classId ?? lead.classId;
    if (!classId) {
      return res.status(400).json({ error: "no_group", message: "Choose a group to approve the student into." });
    }
    await assertClassWritable(req, classId);

    const result = await approveLead(req.params.id, {
      fullName: lead.fullName,
      phone: lead.phone,
      classId,
      approvalDate: input.approvalDate ?? new Date().toISOString().slice(0, 10),
      monthlyFee: input.monthlyFee ?? null,
      note: input.note ?? null,
    });
    // The new student is due from their approval date — refresh coverage/status.
    await recomputeStatuses();
    res.status(201).json(result);
  }),
);

/** Disapprove a lead. */
router.post(
  "/leads/:id/reject",
  requirePermission("approve_leads"),
  asyncHandler(async (req, res) => {
    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: "not_found" });
    if (lead.status !== "pending") {
      return res.status(409).json({ error: "not_pending", message: "This lead has already been decided." });
    }
    if (lead.classId) await assertClassWritable(req, lead.classId);
    const { note } = rejectLeadSchema.parse(req.body);
    const updated = await rejectLead(req.params.id, note ?? null);
    res.json(updated);
  }),
);

/** Permanently remove a lead (e.g. an accidental or duplicate registration). */
router.delete(
  "/leads/:id",
  requirePermission("add_student"),
  asyncHandler(async (req, res) => {
    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: "not_found" });
    if (lead.classId) await assertClassWritable(req, lead.classId);
    await deleteLead(req.params.id);
    res.json({ ok: true });
  }),
);

/* ─────────────────────────── Draft classes ─────────────────────────── */

/** List draft (teacherless) classes with a count of students sorted into each. */
router.get(
  "/draft-classes",
  requirePermission("add_student"),
  asyncHandler(async (_req, res) => {
    res.json(await listDraftClasses());
  }),
);

/** Create a draft class to sort new students into before a teacher exists. */
router.post(
  "/draft-classes",
  requirePermission("add_student"),
  asyncHandler(async (req, res) => {
    const input = insertDraftClassSchema.parse(req.body);
    const created = await createDraftClass({
      name: input.name,
      subject: input.subject ?? null,
      defaultFee: input.defaultFee ?? null,
      createdBy: req.authUser!.id,
    });
    res.status(201).json(created);
  }),
);

/**
 * Assign a teacher to a draft class → materialise it into a real class with its
 * students. Requires add_group (materialising creates a real group).
 */
router.post(
  "/draft-classes/:id/assign-teacher",
  requirePermission("add_group"),
  asyncHandler(async (req, res) => {
    const draft = await getDraftClassById(req.params.id);
    if (!draft) return res.status(404).json({ error: "not_found" });
    const input = assignTeacherSchema.parse(req.body);
    const result = await assignTeacherToDraft(req.params.id, {
      teacherId: input.teacherId,
      name: input.name ?? null,
      defaultFee: input.defaultFee ?? null,
      startDate: input.startDate ?? new Date().toISOString().slice(0, 10),
    });
    // New students begin their billing on the start date — refresh coverage.
    await recomputeStatuses();
    res.status(201).json(result);
  }),
);

/** Delete an empty/abandoned draft class (its leads keep their intake record). */
router.delete(
  "/draft-classes/:id",
  requirePermission("add_group"),
  asyncHandler(async (req, res) => {
    const draft = await getDraftClassById(req.params.id);
    if (!draft) return res.status(404).json({ error: "not_found" });
    await deleteDraftClass(req.params.id);
    res.json({ ok: true });
  }),
);

export default router;
