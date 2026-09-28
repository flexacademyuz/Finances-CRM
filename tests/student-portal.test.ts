import { describe, it, expect } from "vitest";
import { summarize, summaryFromCounts, currentStreak, shouldWarnAttendance } from "@shared/attendance";
import { analyzeScores, scorePercent, isScoreCategory } from "@shared/scores";
import {
  renderNotification,
  renderTelegram,
  shouldNotify,
  resolvePortalSettings,
  DEFAULT_PORTAL_SETTINGS,
  NOTIFICATION_TYPES,
  fmtDay,
} from "@shared/notifications";
import { phonesMatch, maskStudentName, normalizeLinkCode, looksLikeLinkCode, formatLinkCode } from "@shared/linking";
import { lessonsBetween, nextLesson, slotForDate, tashkentDate, tashkentInstant, weekdayMon0 } from "@shared/lesson-schedule";

describe("attendance math", () => {
  it("counts late + left early as attended and leaves excused out of the rate", () => {
    const s = summarize(["present", "present", "late", "absent", "excused", "left_early"]);
    expect(s).toMatchObject({ total: 6, present: 2, late: 1, absent: 1, excused: 1, leftEarly: 1, counted: 5 });
    expect(s.rate).toBe(80); // 4 attended / 5 counted
  });

  it("has no rate when only excused lessons exist", () => {
    expect(summarize(["excused", "excused"]).rate).toBeNull();
    expect(summarize([]).rate).toBeNull();
  });

  it("builds the same summary from SQL-style counts", () => {
    expect(summaryFromCounts({ present: 18, absent: 2 }).rate).toBe(90);
  });

  it("streak skips excused and stops at an absence", () => {
    expect(currentStreak(["present", "excused", "late", "absent", "present"])).toBe(2);
    expect(currentStreak(["absent", "present"])).toBe(0);
  });

  it("warns only below the threshold and after enough lessons", () => {
    const low = summarize(["absent", "absent", "present"]);
    expect(shouldWarnAttendance(low, 75, 6)).toBe(false); // too few lessons
    expect(shouldWarnAttendance(low, 75, 3)).toBe(true);
    expect(shouldWarnAttendance(summarize(["present", "present", "present"]), 75, 3)).toBe(false);
  });
});

describe("score analytics", () => {
  it("percent and categories", () => {
    expect(scorePercent(34, 40)).toBe(85);
    expect(scorePercent(5, 0)).toBe(0);
    expect(isScoreCategory("reading")).toBe(true);
    expect(isScoreCategory("astrology")).toBe(false);
  });

  it("averages, ranks categories and reports the monthly trend", () => {
    const a = analyzeScores([
      { category: "reading", score: 34, maxScore: 40, scoreDate: "2026-08-10" },
      { category: "reading", score: 32, maxScore: 40, scoreDate: "2026-09-10" },
      { category: "writing", score: 6, maxScore: 9, scoreDate: "2026-09-12" },
    ]);
    expect(a.count).toBe(3);
    expect(a.byCategory[0].category).toBe("reading");
    expect(a.strongest?.category).toBe("reading");
    expect(a.weakest?.category).toBe("writing");
    expect(a.trend.map((t) => t.month)).toEqual(["2026-08", "2026-09"]);
    expect(a.trendDelta).not.toBeNull();
  });

  it("does not call a single category both strongest and weakest", () => {
    const a = analyzeScores([{ category: "quiz", score: 8, maxScore: 10, scoreDate: "2026-09-01" }]);
    expect(a.strongest).toBeNull();
    expect(a.weakest).toBeNull();
    expect(analyzeScores([]).average).toBeNull();
  });
});

describe("notification templates", () => {
  it("renders every type in both languages without throwing", () => {
    const params = {
      amount: 500000, currency: "UZS", remaining: 0, dueDate: "2026-10-05", days: 3, balance: 1000,
      discountType: "percentage", value: 10, validTo: "2026-10-31", from: "2026-09-01", to: "2026-09-30",
      category: "reading", title: "Reading Test", score: 34, maxScore: 40, percent: 85, status: "absent",
      group: "IELTS 18:00", date: "2026-09-28", rate: 72, streak: 10, start: "18:00", hours: 2, room: "204",
      reason: "Holiday", schedule: "Mon 18:00", body: "Hello", kind: "general", name: "A", account: "@a",
    };
    for (const type of Object.keys(NOTIFICATION_TYPES)) {
      for (const l of ["en", "uz"] as const) {
        const r = renderNotification(type, params, l);
        expect(r.title.length).toBeGreaterThan(0);
      }
    }
  });

  it("formats the payment receipt", () => {
    const r = renderNotification("payment_recorded", { amount: 500000, currency: "UZS" }, "en");
    expect(r.title).toBe("Payment received");
    expect(r.body).toContain("500,000 UZS");
  });

  it("escapes HTML in Telegram output (user-provided text)", () => {
    const html = renderTelegram("announcement", { title: "<b>x</b>", body: "a & b <script>" }, "en");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("a &amp; b &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("uses Uzbek month names", () => {
    expect(fmtDay("2026-10-05", "uz")).toBe("5-oktabr");
    expect(fmtDay("2026-10-05", "en")).toBe("5 Oct");
  });

  it("respects student prefs, center switches and mandatory types", () => {
    const portal = resolvePortalSettings({});
    expect(shouldNotify("attendance_marked", {}, portal, ["attendance"])).toBe(false);
    expect(shouldNotify("attendance_marked", {}, portal, [])).toBe(true);
    // Overdue is mandatory even if reminders are switched off by the student.
    expect(shouldNotify("payment_overdue", {}, portal, ["payment_reminders"])).toBe(true);
    // …but the CEO can disable a type center-wide.
    expect(shouldNotify("payment_overdue", {}, { disabledTypes: ["payment_overdue"] }, [])).toBe(false);
    // Important announcements bypass a student's opt-out.
    expect(shouldNotify("announcement", { kind: "important" }, portal, ["announcements"])).toBe(true);
    expect(shouldNotify("announcement", { kind: "general" }, portal, ["announcements"])).toBe(false);
    expect(shouldNotify("not_a_type", {}, portal, [])).toBe(false);
  });

  it("merges stored portal settings over defaults", () => {
    expect(resolvePortalSettings(null)).toEqual(DEFAULT_PORTAL_SETTINGS);
    expect(resolvePortalSettings({ attendanceWarningThreshold: 60 }).attendanceWarningThreshold).toBe(60);
  });
});

describe("telegram linking helpers", () => {
  it("matches phones across formats but never on short numbers", () => {
    expect(phonesMatch("+998 90 123-45-67", "901234567")).toBe(true);
    expect(phonesMatch("998901234567", "+998901234567")).toBe(true);
    expect(phonesMatch("998901234567", "998911234567")).toBe(false);
    expect(phonesMatch("1234", "1234")).toBe(false);
    expect(phonesMatch(null, "901234567")).toBe(false);
  });

  it("masks names for the public pick-list", () => {
    expect(maskStudentName("Rahimov Abdulloh Karimovich")).toBe("Rahimov A. K.");
    expect(maskStudentName("Madina")).toBe("Madina");
  });

  it("normalizes and recognizes link codes", () => {
    expect(normalizeLinkCode("k7m2-q9xp")).toBe("K7M2Q9XP");
    expect(looksLikeLinkCode("K7M2-Q9XP")).toBe(true);
    expect(looksLikeLinkCode("hello there")).toBe(false);
    expect(looksLikeLinkCode("K7M2Q9X0")).toBe(false); // 0 is not in the alphabet
    expect(formatLinkCode("K7M2Q9XP")).toBe("K7M2-Q9XP");
  });
});

describe("lesson schedule (Tashkent)", () => {
  const slots = [{ days: [0, 2, 4], start: "18:00", end: "19:30" }]; // Mon/Wed/Fri

  it("weekday is Monday-based", () => {
    expect(weekdayMon0("2026-09-28")).toBe(0); // a Monday
    expect(weekdayMon0("2026-10-04")).toBe(6); // Sunday
  });

  it("converts Tashkent local time to UTC", () => {
    expect(tashkentInstant("2026-09-28", "18:00").toISOString()).toBe("2026-09-28T13:00:00.000Z");
    expect(tashkentDate(new Date("2026-09-28T20:00:00Z"))).toBe("2026-09-29"); // 01:00 next day local
  });

  it("finds the slot for a date and the next lesson", () => {
    expect(slotForDate(slots, "2026-09-28")).toEqual({ start: "18:00", end: "19:30" });
    expect(slotForDate(slots, "2026-09-29")).toBeNull();
    // Monday 19:00 local (after the lesson started) → next is Wednesday.
    const n = nextLesson(slots, new Date("2026-09-28T14:00:00Z"));
    expect(n?.date).toBe("2026-09-30");
    expect(n?.start).toBe("18:00");
  });

  it("lists occurrences in a window", () => {
    const occ = lessonsBetween(slots, new Date("2026-09-28T00:00:00Z"), 7);
    expect(occ.map((o) => o.date)).toEqual(["2026-09-28", "2026-09-30", "2026-10-02"]);
    expect(lessonsBetween(null, new Date(), 7)).toEqual([]);
  });
});

describe("input validation", () => {
  it("only accepts http(s) attachment links (no javascript: URLs)", async () => {
    const { createScoreSchema } = await import("@shared/schema");
    const base = { studentId: "00000000-0000-4000-8000-000000000001", category: "quiz", title: "Q", maxScore: 10, score: 5, scoreDate: "2026-09-01" };
    expect(createScoreSchema.safeParse({ ...base, attachmentUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(createScoreSchema.safeParse({ ...base, attachmentUrl: "https://drive.example.com/x" }).success).toBe(true);
    expect(createScoreSchema.safeParse({ ...base, score: 11 }).success).toBe(false);
  });
});
