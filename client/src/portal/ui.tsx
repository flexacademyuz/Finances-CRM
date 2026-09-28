/** Small, mobile-first building blocks for the student portal. */
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { AlertCircle, CheckCircle2, Clock, Snowflake, CircleDollarSign, RefreshCw } from "lucide-react";
import type { AttendanceStatus, StudentStatus } from "@shared/schema";
import { fmtDay } from "@shared/notifications";
import { usePT, type PKey } from "./i18n";

/* ───────────────────────────── formatting ───────────────────────────── */

export function money(n: number, currency = "UZS"): string {
  return `${new Intl.NumberFormat("en-US").format(Math.round(n))} ${currency}`;
}

const WD = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  uz: ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"],
};
export const weekdayShort = (i: number, l: "en" | "uz") => WD[l][i] ?? "";

/** "Wed, 30 Sep" / "Ch, 30-sentabr". */
export function dayLabel(iso: string, l: "en" | "uz"): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${weekdayShort(wd, l)}, ${fmtDay(iso, l)}`;
}

export function daysFromToday(iso: string): number {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

/** "Today, 09:20" / "Yesterday, 18:42" / "5 Oct, 18:42". */
export function relTime(ts: string, t: (k: PKey) => string, l: "en" | "uz"): string {
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const diff = daysFromToday(local);
  if (diff === 0) return `${t("today")}, ${hm}`;
  if (diff === -1) return `${t("yesterday")}, ${hm}`;
  return `${fmtDay(local, l)}, ${hm}`;
}

/* ───────────────────────────── surfaces ───────────────────────────── */

export function PCard({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={twMerge(
        "block w-full rounded-[20px] bg-surface p-4 text-left shadow-card ring-1 ring-dark/[0.04]",
        onClick && "transition active:scale-[0.99]",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-1 flex items-center justify-between px-1">
      <h2 className="text-[15px] font-extrabold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={twMerge("animate-pulse rounded-[20px] bg-dark/[0.06]", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-36" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center rounded-[20px] bg-surface px-6 py-10 text-center shadow-card">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">{icon}</div>
      <div className="font-bold">{title}</div>
      {hint && <div className="mt-1 text-sm text-muted">{hint}</div>}
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const { t } = usePT();
  return (
    <div className="flex flex-col items-center rounded-[20px] bg-surface px-6 py-10 text-center shadow-card">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-danger/10 text-danger">
        <AlertCircle size={26} />
      </div>
      <div className="font-bold">{t("error")}</div>
      <div className="mt-1 text-sm text-muted">{message || t("offline")}</div>
      <button onClick={onRetry} className="btn btn-primary mt-4">
        <RefreshCw size={15} /> {t("retry")}
      </button>
    </div>
  );
}

/* ───────────────────────────── status badges ───────────────────────────── */

export const ATT_COLOR: Record<AttendanceStatus, string> = {
  present: "#12b76a",
  absent: "#e23744",
  late: "#d18700",
  excused: "#3457f5",
  left_early: "#7b5cf5",
};

const ATT_EMOJI: Record<AttendanceStatus, string> = {
  present: "🟢",
  absent: "🔴",
  late: "🟡",
  excused: "🔵",
  left_early: "🟣",
};

export function AttendancePill({ status }: { status: AttendanceStatus }) {
  const { t } = usePT();
  const c = ATT_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
      style={{ background: `${c}1a`, color: c }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: c }} />
      {t(status)}
    </span>
  );
}

export const attEmoji = (s: AttendanceStatus) => ATT_EMOJI[s];

export function BillingStatusPill({ status, partial }: { status: StudentStatus; partial?: boolean }) {
  const { t } = usePT();
  const map: Record<string, { cls: string; icon: ReactNode; label: string }> = {
    paid: { cls: "bg-status-paid/15 text-status-paid", icon: <CheckCircle2 size={14} />, label: t("statusPaid") },
    awaiting_payment: { cls: "bg-status-awaiting/15 text-status-awaiting", icon: <Clock size={14} />, label: t("statusAwaiting") },
    overdue: { cls: "bg-status-overdue/15 text-status-overdue", icon: <AlertCircle size={14} />, label: t("statusOverdue") },
    frozen: { cls: "bg-freeze/15 text-freeze", icon: <Snowflake size={14} />, label: t("statusFrozen") },
    not_due: { cls: "bg-violet/15 text-violet", icon: <Clock size={14} />, label: t("statusNotDue") },
    partial: { cls: "bg-warning/15 text-warning", icon: <CircleDollarSign size={14} />, label: t("statusPartial") },
  };
  const m = map[partial ? "partial" : status] ?? map.not_due;
  return (
    <span className={twMerge("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold", m.cls)}>
      {m.icon}
      {m.label}
    </span>
  );
}

/* ───────────────────────────── progress ring ───────────────────────────── */

/** Circular percentage (single value → not a chart; a readable gauge). */
export function Ring({
  value,
  size = 84,
  stroke = 9,
  color = "#3457f5",
  label,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  color?: string;
  label?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-dark/[0.07]" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{ transition: "stroke-dashoffset 700ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {label ?? <span className="figure text-lg font-extrabold">{value == null ? "—" : `${Math.round(v)}%`}</span>}
      </div>
    </div>
  );
}

/** Colour for a percentage: green ≥ 80, amber ≥ 60, else red (+ text label elsewhere). */
export function pctColor(p: number | null): string {
  if (p == null) return "#7a8699";
  return p >= 80 ? "#12b76a" : p >= 60 ? "#d18700" : "#e23744";
}

/** Horizontal meter with the value printed as text (never colour alone). */
export function Meter({ label, value, sub }: { label: string; value: number; sub?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="figure font-bold text-text">
          {Math.round(v)}%{sub && <span className="ml-1 text-xs font-medium text-muted">{sub}</span>}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-dark/[0.07]">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${v}%`, background: "#3457f5" }} />
      </div>
    </div>
  );
}
