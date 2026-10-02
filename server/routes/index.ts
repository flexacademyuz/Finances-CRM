import { Router } from "express";
import { authenticate } from "../auth/middleware";
import authRouter from "./auth";
import branchesRouter from "./branches";
import usersRouter from "./users";
import classesRouter from "./classes";
import studentsRouter from "./students";
import leadsRouter from "./leads";
import paymentsRouter from "./payments";
import salariesRouter from "./salaries";
import dashboardRouter from "./dashboard";
import pricingRouter from "./pricing";
import expensesRouter from "./expenses";
import analyticsRouter from "./analytics";
import smsRouter from "./sms";
import studentPortalRouter from "./student";
import attendanceRouter from "./attendance";
import scoresRouter from "./scores";
import portalAdminRouter from "./portal-admin";
import learningAdminRouter from "./learning-admin";
import leaderboardRouter from "./leaderboard";
import homeworkRouter from "./homework";

const api = Router();

// Public health check (no auth) for hosting platforms. `version` lets you
// confirm which build is live: open <your-url>/api/health in a browser.
api.get("/health", (_req, res) => res.json({ ok: true, version: "2.0.0" }));

// Credential login / sign-up: reachable WITHOUT an existing linked account, so
// they must come before the authenticate gate.
api.use(authRouter);

// Student portal: students are not staff users, so it authenticates on its own
// (Telegram initData → linked student) and must be mounted before the staff
// gate. It answers every /student/* path itself (404s never fall through).
api.use("/student", studentPortalRouter);

// Everything else requires a verified Telegram user.
api.use(authenticate);

api.use(branchesRouter);
api.use(usersRouter);
api.use(classesRouter);
api.use(studentsRouter);
api.use(leadsRouter);
api.use(paymentsRouter);
api.use(salariesRouter);
api.use(dashboardRouter);
api.use(pricingRouter);
api.use(expensesRouter);
api.use(analyticsRouter);
api.use(smsRouter);
api.use(attendanceRouter);
api.use(scoresRouter);
api.use(portalAdminRouter);
api.use(learningAdminRouter);
api.use(leaderboardRouter);
api.use(homeworkRouter);

export default api;
