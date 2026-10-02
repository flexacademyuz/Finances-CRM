/**
 * Student-portal API client. Inside Telegram the shared api() sends the signed
 * initData; the server derives the student from it. For staff "preview"
 * (CEO/accountant opening /portal?as=<studentId> in a browser) the chosen
 * student id is sent as X-Portal-Student and the server enforces read-only.
 */
import { api } from "../lib/api";
import type { AttendanceSummary } from "@shared/attendance";
import type { ScoreAnalytics } from "@shared/scores";
import type { AttendanceStatus, ScheduleSlot, StudentStatus } from "@shared/schema";

const PREVIEW_KEY = "portalPreviewStudent";
const PROFILE_KEY = "portalProfile";
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Capture ?as=<id> (staff preview) and ?profile=<id> (which group to open —
 * Telegram "Open app" buttons carry it) once, then remember them.
 */
export function initPreviewFromUrl(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    const as = q.get("as");
    if (as && UUID.test(as)) sessionStorage.setItem(PREVIEW_KEY, as);
    const profile = q.get("profile");
    if (profile && UUID.test(profile)) localStorage.setItem(PROFILE_KEY, profile);
  } catch {
    /* storage off: preview / group choice just won't persist */
  }
}

/**
 * The student record (group) the app is showing, for students linked to
 * several groups. The server only honours it if it's one of theirs.
 */
export function selectedProfile(): string | null {
  try {
    return localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
}

export function setSelectedProfile(id: string | null): void {
  try {
    if (id) localStorage.setItem(PROFILE_KEY, id);
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

export function previewStudentId(): string | null {
  try {
    return sessionStorage.getItem(PREVIEW_KEY);
  } catch {
    return null;
  }
}

export function exitPreview(): void {
  const id = previewStudentId();
  try {
    sessionStorage.removeItem(PREVIEW_KEY);
  } catch {
    /* ignore */
  }
  window.location.href = id ? `/student/${id}` : "/";
}

/** Which student (preview) or group record (profile) the request is for. */
export function portalHeaders(): Record<string, string> {
  const pid = previewStudentId();
  const profile = pid ? null : selectedProfile();
  const headers: Record<string, string> = {};
  if (pid) headers["X-Portal-Student"] = pid;
  if (profile) headers["X-Student-Id"] = profile;
  return headers;
}

export function papi<T>(path: string, opts: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {}) {
  return api<T>(`/api/student${path}`, { ...opts, headers: portalHeaders() });
}

/* ─────────────────────────────── types ─────────────────────────────── */

export type Group = {
  id: string;
  name: string;
  subject: string | null;
  room: string | null;
  schedule: string | null;
  scheduleSlots: ScheduleSlot[];
  teacherName: string | null;
  branchName: string | null;
  nextLesson: { date: string; start: string; end: string; startsAt: string } | null;
  upcomingCancellations: { date: string; reason: string | null }[];
};

export type Me = {
  student: {
    id: string;
    fullName: string;
    givenName: string;
    phone: string | null;
    enrolledAt: string;
    active: boolean;
    sponsored: boolean;
  };
  group: Group | null;
  account: { username: string | null; languageCode: string | null; verifiedAt: string } | null;
  preview: { by: string } | null;
  unread: number;
  /** Every group (student record) this Telegram account can switch between. */
  profiles: Profile[];
};

export type Profile = {
  studentId: string;
  fullName: string;
  active: boolean;
  groupName: string;
  subject: string | null;
  unread: number;
};

export type Billing = {
  startDate: string;
  monthsEnrolled: number;
  paymentsMade: number;
  effectiveFee: number;
  currency: string;
  paidThrough: string;
  nextDueDate: string;
  balance: number;
  status: StudentStatus;
  isFrozenNow: boolean;
  gracePeriodDays: number;
};

export type Discount = {
  id: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  validFrom: string;
  validTo: string | null;
  reason: string;
};

export type Freeze = { id: string; freezeFrom: string; freezeTo: string | null; reason: string };

export type AttRecord = {
  id: string;
  lessonId: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  classId: string;
  className: string;
  teacherName: string | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  topic: string | null;
};

export type Score = {
  id: string;
  category: string;
  title: string;
  score: number;
  maxScore: number;
  percent: number;
  scoreDate: string;
  comment: string | null;
  attachmentUrl: string | null;
  teacherName: string | null;
  className: string;
};

export type Notification = {
  id: string;
  type: string;
  category: string;
  params: Record<string, unknown>;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type Dashboard = Me & {
  billing: Billing & { discount: Discount | null; freeze: Freeze | null };
  attendance: { summary: AttendanceSummary; last30: AttendanceSummary; recent: AttRecord[] };
  latestScore: (Pick<Score, "id" | "category" | "title" | "score" | "maxScore" | "percent" | "scoreDate">) | null;
  notifications: Notification[];
};

export type PaymentItem = {
  id: string;
  amount: number;
  amountDue: number | null;
  remaining: number;
  status: "paid" | "partial";
  method: "cash" | "online";
  billingMonth: string;
  monthLabel: string;
  refundedAmount: number;
  createdAt: string;
};

export type PaymentDetail = PaymentItem & { installments: { at: string; amount: number }[] };

export type Progress = { analytics: ScoreAnalytics; recent: Score[] };

export type PortalSettings = {
  groups: string[];
  disabled: string[];
  partlyMandatory: string[];
  language: "uz" | "en";
};

/** What the student owes right now (partial balance, else the fee when due). */
export function amountDueNow(b: Billing): number {
  if (b.balance > 0) return b.balance;
  return b.status === "overdue" || b.status === "awaiting_payment" ? b.effectiveFee : 0;
}
