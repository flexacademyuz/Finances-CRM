import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import { insertClassSchema } from "@shared/schema";
import { listClasses, getClassById, createClass, updateClass } from "../storage";

const router = Router();

/**
 * GET /api/classes — teachers see only their own classes; CEO/Accountant see
 * all (Accountant needs them read-only to record payments).
 */
router.get(
  "/classes",
  asyncHandler(async (req, res) => {
    const { teacherId, activeOnly } = req.query;
    const filter: { teacherId?: string; activeOnly?: boolean } = {};
    if (req.authUser!.role === "teacher") {
      filter.teacherId = req.teacherId;
    } else if (typeof teacherId === "string") {
      filter.teacherId = teacherId;
    }
    if (activeOnly === "1" || activeOnly === "true") filter.activeOnly = true;
    res.json(await listClasses(filter));
  }),
);

/* Create/edit/archive: CEO and Accountant per spec §3.1. */
router.post(
  "/classes",
  requireRole("ceo", "accountant"),
  asyncHandler(async (req, res) => {
    const input = insertClassSchema.parse(req.body);
    const created = await createClass({
      name: input.name,
      subject: input.subject ?? null,
      teacherId: input.teacherId,
      defaultFee: input.defaultFee ?? 0,
      schedule: input.schedule ?? null,
    });
    res.status(201).json(created);
  }),
);

router.patch(
  "/classes/:id",
  requireRole("ceo", "accountant"),
  asyncHandler(async (req, res) => {
    const patch = z
      .object({
        name: z.string().min(1).optional(),
        subject: z.string().nullable().optional(),
        teacherId: z.string().uuid().optional(),
        defaultFee: z.coerce.number().nonnegative().optional(),
        schedule: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = await updateClass(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json(updated);
  }),
);

router.get(
  "/classes/:id",
  asyncHandler(async (req, res) => {
    const cls = await getClassById(req.params.id);
    if (!cls) return res.status(404).json({ error: "not_found" });
    if (req.authUser!.role === "teacher" && cls.teacherId !== req.teacherId) {
      return res.status(403).json({ error: "forbidden" });
    }
    res.json(cls);
  }),
);

export default router;
