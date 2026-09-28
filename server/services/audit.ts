import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "../db";
import { auditLogs } from "@shared/schema";

export type AuditEntry = {
  actorUserId?: string | null;
  actorType: "user" | "student" | "system" | "bot";
  action: string;
  entityType: string;
  entityId?: string | null;
  studentId?: string | null;
  branchId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
};

/**
 * Append one audit entry. Best-effort by design: an audit write must never fail
 * the business operation it describes, so errors are logged and swallowed.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: entry.actorUserId ?? null,
      actorType: entry.actorType,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      studentId: entry.studentId ?? null,
      branchId: entry.branchId ?? null,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
      meta: (entry.meta ?? null) as never,
    });
  } catch (err) {
    console.error("[audit] write failed:", (err as Error).message, entry.action);
  }
}

/** Recent audit entries, newest first, optionally narrowed. */
export async function listAudit(filter: {
  entityType?: string;
  entityId?: string;
  studentId?: string;
  branchId?: string;
  limit?: number;
}) {
  const conds: SQL[] = [];
  if (filter.entityType) conds.push(eq(auditLogs.entityType, filter.entityType));
  if (filter.entityId) conds.push(eq(auditLogs.entityId, filter.entityId));
  if (filter.studentId) conds.push(eq(auditLogs.studentId, filter.studentId));
  if (filter.branchId) conds.push(eq(auditLogs.branchId, filter.branchId));
  return db
    .select()
    .from(auditLogs)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(filter.limit ?? 100, 500));
}
