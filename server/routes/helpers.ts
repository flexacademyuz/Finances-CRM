import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodError, type ZodSchema } from "zod";

/** Wrap an async handler so thrown errors hit the error middleware. */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Parse and validate a request body, throwing a 400-friendly ZodError. */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  return schema.parse(body);
}

/** Central error middleware: turns ZodError into 400, everything else 500. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "validation", issues: err.issues });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  // Honor an explicit status set on the thrown error (e.g. branch-scope guards
  // throw `Object.assign(new Error(...), { status: 403 })`).
  const explicit = (err as { status?: unknown }).status;
  if (typeof explicit === "number") {
    return res.status(explicit).json({ error: explicit === 403 ? "forbidden" : "error", message });
  }
  const known = /not found|not registered|forbidden/i.test(message);
  res.status(known ? 400 : 500).json({ error: "server_error", message });
}
