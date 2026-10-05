/**
 * Student homework API — mounted at /api/student/homework inside the student
 * router. Read-only: students see their group's homework (each part with the
 * tick / X their teacher or assistant gave it) and the group's task tables;
 * nothing is handed in through the app. Only the group record the student is
 * viewing is visible.
 */
import { Router } from "express";
import { asyncHandler } from "./helpers";
import { listForStudent, trackersForStudent } from "../services/homework";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await listForStudent(req.student!));
  }),
);

router.get(
  "/tables",
  asyncHandler(async (req, res) => {
    res.json(await trackersForStudent(req.student!));
  }),
);

export default router;
