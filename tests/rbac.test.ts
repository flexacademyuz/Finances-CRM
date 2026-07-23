import { describe, it, expect } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import usersRouter from "../server/routes/users";

/**
 * Regression test: the CEO-only guard inside the users router must NOT leak
 * onto other routes. The users router is mounted first in the API, so a
 * path-less `router.use(requireRole("ceo"))` there would 403 accountants and
 * teachers on students/classes/teachers/etc. Here we mount usersRouter and a
 * stand-in "later" route (like /students) and assert an accountant can reach it.
 */
function makeApp(role: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { authUser: unknown }).authUser = {
      id: "u1",
      role,
      telegramId: 1,
      fullName: "T",
      active: true,
    };
    next();
  });
  app.use(usersRouter);
  // Simulate a router mounted AFTER usersRouter (e.g. students).
  app.get("/students", (_req, res) => res.json([{ id: "s1" }]));
  return app;
}

async function get(app: express.Express, path: string): Promise<number> {
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    const r = await fetch(`http://127.0.0.1:${port}${path}`);
    return r.status;
  } finally {
    server.close();
  }
}

describe("RBAC guard scoping (users router)", () => {
  it("accountant can reach a non-/users route — guard does not leak", async () => {
    expect(await get(makeApp("accountant"), "/students")).toBe(200);
  });

  it("teacher can reach a non-/users route — guard does not leak", async () => {
    expect(await get(makeApp("teacher"), "/students")).toBe(200);
  });

  it("accountant is still forbidden from /users management", async () => {
    expect(await get(makeApp("accountant"), "/users")).toBe(403);
  });
});
