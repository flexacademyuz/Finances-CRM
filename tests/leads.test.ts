import { describe, it, expect } from "vitest";
import {
  insertLeadSchema,
  approveLeadSchema,
  insertDraftClassSchema,
  assignTeacherSchema,
} from "../shared/schema";

/**
 * Lead intake validation (feature #4). The registration form collects full
 * name, phone, grade, level and a required shift; approval optionally names a
 * group and a start date that anchors billing.
 */
describe("lead schemas", () => {
  it("accepts a full registration and defaults optionals to undefined", () => {
    const parsed = insertLeadSchema.parse({
      fullName: "Ali Valiyev",
      phone: "+998901234567",
      gradeAtSchool: "9th grade",
      level: "Intermediate",
      shift: "afternoon",
    });
    expect(parsed.fullName).toBe("Ali Valiyev");
    expect(parsed.shift).toBe("afternoon");
    expect(parsed.classId).toBeUndefined();
  });

  it("requires a name and a valid shift", () => {
    expect(() => insertLeadSchema.parse({ fullName: "", shift: "morning" })).toThrow();
    expect(() => insertLeadSchema.parse({ fullName: "A", shift: "evening" })).toThrow();
  });

  it("carries subject and a draft-class placement", () => {
    const parsed = insertLeadSchema.parse({
      fullName: "Dilnoza",
      subject: "English",
      shift: "morning",
      draftClassId: "22222222-2222-2222-2222-222222222222",
    });
    expect(parsed.subject).toBe("English");
    expect(parsed.draftClassId).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("draft class needs a name; assigning a teacher needs a teacher id", () => {
    expect(insertDraftClassSchema.parse({ name: "Beginners A" }).name).toBe("Beginners A");
    expect(() => insertDraftClassSchema.parse({ subject: "Math" })).toThrow();
    expect(() =>
      assignTeacherSchema.parse({ teacherId: "33333333-3333-3333-3333-333333333333" }),
    ).not.toThrow();
    expect(() => assignTeacherSchema.parse({})).toThrow();
  });

  it("approval accepts an optional group and an ISO start date", () => {
    const ok = approveLeadSchema.parse({
      classId: "11111111-1111-1111-1111-111111111111",
      approvalDate: "2026-02-01",
    });
    expect(ok.approvalDate).toBe("2026-02-01");
    // Empty body is valid — the route falls back to the lead's group and today.
    expect(approveLeadSchema.parse({})).toEqual({});
    // A malformed date is rejected.
    expect(() => approveLeadSchema.parse({ approvalDate: "02/01/2026" })).toThrow();
  });
});
