import type { StudentStatus } from "@shared/schema";

export function money(value: number | string, currency = "UZS"): string {
  const n = typeof value === "string" ? Number(value) : value;
  return `${new Intl.NumberFormat("en-US").format(Math.round(n))} ${currency}`;
}

export const statusColor: Record<StudentStatus, string> = {
  paid: "bg-status-paid/15 text-status-paid",
  awaiting_payment: "bg-status-awaiting/15 text-status-awaiting",
  overdue: "bg-status-overdue/15 text-status-overdue",
  frozen: "bg-status-frozen/15 text-status-frozen",
  not_due: "bg-status-notdue/15 text-status-notdue",
};

export function formatDate(iso: string | Date, locale = "en"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(locale === "uz" ? "uz-UZ" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Two-letter initials for an avatar chip. */
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

/** Deterministic, varied avatar colour from a name. */
const AVATAR_COLORS = ["#3457f5", "#7b5cf5", "#12b76a", "#e23744", "#d18700", "#0ea5e9", "#ec4899"];
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
