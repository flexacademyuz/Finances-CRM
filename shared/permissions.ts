import type { Role } from "./schema";

/**
 * Fine-grained abilities the CEO can grant to individual users on top of their
 * role. The CEO always has every ability. Each user carries a `permissions`
 * list of extra grants; their effective abilities are the role defaults plus
 * those grants.
 */
export const PERMISSIONS = [
  "record_payment",
  "add_student",
  "edit_student",
  "delete_student",
  "add_group",
  "edit_group",
  "add_expense",
  "manage_discounts",
  "approve_leads",
  // Student portal: take/edit attendance and enter scores for ANY group on any
  // date. Teachers always manage their own groups without these grants.
  "manage_attendance",
  "manage_scores",
  // Learning content: add/edit/move/remove vocabulary, manage stages and view
  // centre-wide learning statistics. CEO-only by default.
  "manage_learning",
  // Homework (a checklist per group): add homework for ANY group (teachers
  // always can for their own groups), and tick who did it in any group.
  "assign_homework",
  "check_homework",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Human labels for the CEO's permission toggles. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  record_payment: "Record payments",
  add_student: "Add students",
  edit_student: "Edit students",
  delete_student: "Delete students",
  add_group: "Add groups",
  edit_group: "Edit groups",
  add_expense: "Add expenses",
  manage_discounts: "Manage discounts & freezes",
  approve_leads: "Approve new-student leads",
  manage_attendance: "Manage attendance (all groups)",
  manage_scores: "Manage scores (all groups)",
  manage_learning: "Manage learning content (vocabulary)",
  assign_homework: "Add homework (all groups)",
  check_homework: "Tick homework (all groups)",
};

/** Abilities each role has by default, before any per-user grants. */
export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  ceo: [...PERMISSIONS], // CEO can do everything
  accountant: [
    "record_payment",
    "add_student",
    "edit_student",
    "add_group",
    "edit_group",
    "add_expense",
    "manage_discounts",
    "approve_leads",
  ],
  // Teachers manage their own class rosters and approve leads for their own
  // groups by default; everything else is granted per-user by the CEO.
  teacher: ["add_student", "edit_student", "approve_leads"],
  // Assistants handle the front desk: recording payments and registering /
  // approving new students. The CEO can grant more per-user.
  // They also tick homework for every group in their branches.
  assistant: ["record_payment", "add_student", "edit_student", "approve_leads", "check_homework"],
};

export function isPermission(p: string): p is Permission {
  return (PERMISSIONS as readonly string[]).includes(p);
}

/** Role defaults ∪ per-user grants. */
export function effectivePermissions(role: Role, granted: string[] = []): Set<Permission> {
  const set = new Set<Permission>(ROLE_DEFAULTS[role]);
  for (const g of granted) if (isPermission(g)) set.add(g);
  return set;
}

/** Does this user have the given ability? The CEO always does. */
export function can(
  user: { role: Role; permissions?: string[] | null },
  perm: Permission,
): boolean {
  if (user.role === "ceo") return true;
  return effectivePermissions(user.role, user.permissions ?? []).has(perm);
}
