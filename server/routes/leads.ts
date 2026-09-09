import { Router, type Request } from "express";
import { asyncHandler } from "./helpers";
import { requirePermission } from "../auth/middleware";
import {
  insertLeadSchema,
  updateLeadSchema,
  approveLeadSchema,
  rejectLeadSchema,
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
    const { status, classId } = req.query;
    if (typeof status === "string") filter.status = status as LeadStatus;
    if (typeof classId === "string") filter.classId = classId;
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
    const created = await createLead({
      fullName: input.fullName,
      phone: input.phone ?? null,
      gradeAtSchool: input.gradeAtSchool ?? null,
      level: input.level ?? null,
      shift: input.shift,
      classId: input.classId ?? null,
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

export default router;
