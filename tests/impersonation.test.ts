import { describe, it, expect, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

/**
 * CEO impersonation (X-Impersonate-User): only a CEO may use it, only on an
 * approved, active, non-CEO user; the request then runs as that user.
 */
const USERS: Record<string, Record<string, unknown>> = {
  "00000000-0000-4000-8000-000000000001": { role: "ceo", fullName: "Boss" },
  "00000000-0000-4000-8000-000000000002": { role: "teacher", fullName: "Tina" },
  "00000000-0000-4000-8000-000000000003": { role: "accountant", fullName: "Acc" },
  "00000000-0000-4000-8000-000000000004": { role: "teacher", fullName: "Gone", active: false },
  "00000000-0000-4000-8000-000000000005": { role: "ceo", fullName: "Other CEO" },
};
const [CEO, TEACHER, ACCOUNTANT, DISABLED, CEO2] = Object.keys(USERS);

vi.mock("../server/storage", () => ({
  getUserById: async (id: string) =>
    USERS[id] ? { id, approved: true, active: true, branchIds: [], ...USERS[id] } : undefined,
  getUserByTelegramId: async () => undefined,
  getTeacherByUserId: async (userId: string) => ({ id: `t-${userId}` }),
}));

const { authenticate } = await import("../server/auth/middleware");
const { signToken } = await import("../server/auth/token");

function makeApp() {
  const app = express();
  app.use(authenticate);
  app.get("/who", (req, res) =>
    res.json({
      id: req.authUser!.id,
      teacherId: req.teacherId ?? null,
      impersonator: req.impersonator?.id ?? null,
    }),
  );
  return app;
}

async function who(asUser: string, impersonate?: string) {
  const server = makeApp().listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/who`, {
      headers: {
        Authorization: `Bearer ${signToken(asUser)}`,
        ...(impersonate ? { "X-Impersonate-User": impersonate } : {}),
      },
    });
    return { status: r.status, body: await r.json() };
  } finally {
    server.close();
  }
}

describe("CEO impersonation", () => {
  it("CEO acts as the target user, with the target's teacherId", async () => {
    const r = await who(CEO, TEACHER);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: TEACHER, teacherId: `t-${TEACHER}`, impersonator: CEO });
  });

  it("non-CEO header is ignored", async () => {
    const r = await who(ACCOUNTANT, TEACHER);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: ACCOUNTANT, teacherId: null, impersonator: null });
  });

  it("rejects disabled, CEO, unknown and malformed targets", async () => {
    for (const target of [DISABLED, CEO2, "00000000-0000-4000-8000-00000000ffff", "nope"]) {
      const r = await who(CEO, target);
      expect(r.status).toBe(403);
      expect(r.body.error).toBe("impersonation_invalid");
    }
  });

  it("impersonating yourself is a no-op", async () => {
    const r = await who(CEO, CEO);
    expect(r.body).toEqual({ id: CEO, teacherId: null, impersonator: null });
  });
});
