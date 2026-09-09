import { describe, it, expect } from "vitest";
import { can, effectivePermissions, isPermission } from "../shared/permissions";

/**
 * The permission model: role defaults ∪ per-user grants, with the CEO always
 * allowed. These guard the CEO's "grant certain abilities to certain users"
 * flow (spec: teachers can record payments / add groups only once the CEO
 * enables it in settings).
 */
describe("permissions model", () => {
  it("CEO can do everything, regardless of stored grants", () => {
    expect(can({ role: "ceo", permissions: [] }, "delete_student")).toBe(true);
    expect(can({ role: "ceo", permissions: null }, "record_payment")).toBe(true);
  });

  it("teacher has only roster + lead-approval defaults until the CEO grants more", () => {
    const teacher = { role: "teacher" as const, permissions: [] };
    expect(can(teacher, "add_student")).toBe(true); // default
    expect(can(teacher, "edit_student")).toBe(true); // default
    expect(can(teacher, "approve_leads")).toBe(true); // default (feature #4)
    expect(can(teacher, "record_payment")).toBe(false);
    expect(can(teacher, "add_group")).toBe(false);
  });

  it("a CEO grant enables an extra ability on top of the role", () => {
    const teacher = { role: "teacher" as const, permissions: ["record_payment", "add_group"] };
    expect(can(teacher, "record_payment")).toBe(true);
    expect(can(teacher, "add_group")).toBe(true);
    // A permission not granted stays denied.
    expect(can(teacher, "delete_student")).toBe(false);
  });

  it("assistant handles payments and student registration by default", () => {
    const asst = { role: "assistant" as const, permissions: [] };
    expect(can(asst, "record_payment")).toBe(true);
    expect(can(asst, "add_student")).toBe(true);
    expect(can(asst, "edit_student")).toBe(true);
    expect(can(asst, "approve_leads")).toBe(true);
    // Not a manager: no groups/expenses/deletes unless the CEO grants them.
    expect(can(asst, "add_group")).toBe(false);
    expect(can(asst, "add_expense")).toBe(false);
    expect(can(asst, "delete_student")).toBe(false);
  });

  it("accountant defaults exclude delete_student unless granted", () => {
    expect(can({ role: "accountant", permissions: [] }, "delete_student")).toBe(false);
    expect(can({ role: "accountant", permissions: ["delete_student"] }, "delete_student")).toBe(true);
    expect(can({ role: "accountant", permissions: [] }, "record_payment")).toBe(true);
  });

  it("effectivePermissions unions defaults with valid grants and ignores junk", () => {
    const set = effectivePermissions("teacher", ["record_payment", "not_a_real_perm"]);
    expect(set.has("add_student")).toBe(true); // default
    expect(set.has("record_payment")).toBe(true); // grant
    expect(set.has("delete_student")).toBe(false);
    expect(isPermission("not_a_real_perm")).toBe(false);
  });
});
