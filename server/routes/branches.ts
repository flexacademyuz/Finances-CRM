import { Router } from "express";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import { insertBranchSchema, updateBranchSchema } from "@shared/schema";
import {
  listBranches,
  getBranchById,
  createBranch,
  updateBranch,
  setBranchPaymentGroupChatId,
} from "../storage";
import { getChatTitle } from "../bot/client";

const router = Router();

/**
 * GET /api/branches — every branch. Available to all authenticated users so the
 * client can label a pinned user's branch and render the CEO's branch switcher.
 */
router.get(
  "/branches",
  asyncHandler(async (_req, res) => {
    res.json(await listBranches());
  }),
);

// Branch administration is CEO-only.
router.use("/branches", requireRole("ceo"));

/** POST /api/branches — create a new branch. */
router.post(
  "/branches",
  asyncHandler(async (req, res) => {
    const input = insertBranchSchema.parse(req.body);
    res.status(201).json(await createBranch({ name: input.name }));
  }),
);

/** PATCH /api/branches/:id — rename a branch or activate/deactivate it. */
router.patch(
  "/branches/:id",
  asyncHandler(async (req, res) => {
    const patch = updateBranchSchema.parse(req.body);
    const updated = await updateBranch(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json(updated);
  }),
);

/**
 * GET /api/branches/:id/payment-group — whether this branch has a Telegram group
 * linked for payment notifications, and its title if the bot can still see it.
 */
router.get(
  "/branches/:id/payment-group",
  asyncHandler(async (req, res) => {
    const branch = await getBranchById(req.params.id);
    if (!branch) return res.status(404).json({ error: "not_found" });
    const chatId = branch.paymentGroupChatId ?? null;
    const title = chatId ? await getChatTitle(chatId) : null;
    res.json({ linked: !!chatId, chatId, title });
  }),
);

/** POST /api/branches/:id/payment-group/unlink — stop posting to the group. */
router.post(
  "/branches/:id/payment-group/unlink",
  asyncHandler(async (req, res) => {
    const branch = await getBranchById(req.params.id);
    if (!branch) return res.status(404).json({ error: "not_found" });
    await setBranchPaymentGroupChatId(req.params.id, null);
    res.json({ linked: false, chatId: null, title: null });
  }),
);

export default router;
