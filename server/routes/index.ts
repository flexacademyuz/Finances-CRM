import { Router } from "express";
import { authenticate } from "../auth/middleware";
import usersRouter from "./users";
import classesRouter from "./classes";
import studentsRouter from "./students";
import paymentsRouter from "./payments";
import salariesRouter from "./salaries";
import dashboardRouter from "./dashboard";
import pricingRouter from "./pricing";
import expensesRouter from "./expenses";
import analyticsRouter from "./analytics";

const api = Router();

// Public health check (no auth) for hosting platforms. `version` lets you
// confirm which build is live: open <your-url>/api/health in a browser.
api.get("/health", (_req, res) => res.json({ ok: true, version: "2.0.0" }));

// Everything else requires a verified Telegram user.
api.use(authenticate);

api.use(usersRouter);
api.use(classesRouter);
api.use(studentsRouter);
api.use(paymentsRouter);
api.use(salariesRouter);
api.use(dashboardRouter);
api.use(pricingRouter);
api.use(expensesRouter);
api.use(analyticsRouter);

export default api;
