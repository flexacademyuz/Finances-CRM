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
