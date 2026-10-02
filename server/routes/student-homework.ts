/**
 * Student homework API — mounted at /api/student/homework inside the student
 * router. Read-only: students see their group's homework and whether their
 * teacher / assistant ticked it; nothing is handed in through the app.
 * Only the group record the student is viewing is visible.
 */
import { Router } from "express";
import { asyncHandler } from "./helpers";
import { listForStudent } from "../services/homework";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await listForStudent(req.student!));
  }),
);

export default router;
