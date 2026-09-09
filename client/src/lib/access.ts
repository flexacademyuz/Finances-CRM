import type { User } from "@shared/schema";
import { can } from "@shared/permissions";

/**
 * What the current user can reach in the UI — a single source of truth shared by
 * the navigation (Layout) and the router (App), so a CEO-granted permission
 * actually surfaces the matching page and menu item instead of being enforced
 * only on the server. Role gives the baseline; per-user grants add to it.
 */
export type Access = {
  role: User["role"];
  // Where the role's home ("/") lands, and the label to show for it.
  students: boolean;
  groups: boolean;
  groupsPath: "/classes" | "/groups";
  record: boolean; // a dedicated Record page/menu item (accountant records from home)
  recordPath: "/record" | "/";
  payments: boolean;
  awaiting: boolean;
  expenses: boolean;
  leads: boolean;
  payroll: boolean;
  finances: boolean;
  analytics: boolean;
  users: boolean;
  salary: boolean;
};

export function accessFor(user: User): Access {
  const role = user.role;
  const ceo = role === "ceo";
  const accountant = role === "accountant";

  return {
    role,
    students: ceo || accountant || can(user, "add_student") || can(user, "edit_student") || can(user, "delete_student"),
    groups: ceo || accountant || can(user, "add_group") || can(user, "edit_group"),
    groupsPath: ceo ? "/classes" : "/groups",
    // Accountant records from the home screen; everyone else granted the ability
    // gets a dedicated Record page.
    record: ceo || can(user, "record_payment"),
    recordPath: accountant ? "/" : "/record",
    payments: ceo || accountant || can(user, "record_payment"),
    awaiting: accountant,
    expenses: ceo || accountant || can(user, "add_expense"),
    leads: true, // page self-scopes; every role can at least register or approve
    payroll: ceo,
    finances: ceo,
    analytics: ceo,
    users: ceo,
    salary: role === "teacher",
  };
}
