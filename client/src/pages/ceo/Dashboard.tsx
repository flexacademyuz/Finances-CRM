import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Wallet,
  GraduationCap,
  CheckCircle2,
  Clock,
  AlertTriangle,
  BadgeDollarSign,
  ArrowUpRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  Tooltip,
  Cell,
} from "recharts";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { money } from "../../lib/format";
import type { DashboardData, PaymentRow } from "../../lib/types";
import { Card, Spinner, MethodTag } from "../../components/ui";

/**
 * Soft pastel gradient tints keyed to the CRM's semantic colors. The cards are
 * always light (the app has a fixed light identity), so dark text sits on them.
 */
type Tint = "blue" | "violet" | "green" | "amber" | "red";
const TINTS: Record<Tint, { bg: string; fg: string; icon: string }> = {
  blue: { bg: "linear-gradient(135deg,#eef2ff 0%,#dbe4ff 100%)", fg: "#2440d4", icon: "#3457f5" },
  violet: { bg: "linear-gradient(135deg,#f3edfe 0%,#e7dcfe 100%)", fg: "#5a3fd0", icon: "#7b5cf5" },
  green: { bg: "linear-gradient(135deg,#e8f7ef 0%,#d3efe0 100%)", fg: "#0e9d63", icon: "#12b76a" },
  amber: { bg: "linear-gradient(135deg,#fdf4dd 0%,#fbe8bf 100%)", fg: "#a56708", icon: "#d18700" },
  red: { bg: "linear-gradient(135deg,#fdebed 0%,#fbd9dd 100%)", fg: "#c0212f", icon: "#e23744" },
};

/** LimeTalk-style KPI tile: soft tint, label, big figure, icon in a soft disc. */
function KpiCard({
  label,
  value,
  sub,
  icon,
  tint,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  tint: Tint;
  href?: string;
}) {
  const c = TINTS[tint];
  const inner = (
    <div
      className="h-full rounded-card p-4 shadow-card transition hover:shadow-card-hover"
      style={{ background: c.bg }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold text-black/60">{label}</div>
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/70"
          style={{ color: c.icon }}
        >
          {icon}
        </span>
      </div>
      <div className="figure mt-2 text-2xl font-bold leading-tight" style={{ color: c.fg }}>
        {value}
      </div>
      {sub != null && <div className="mt-1 truncate text-xs text-black/45">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

const chartAxis = {
  fontSize: 10,
  stroke: "var(--text-muted)",
  tickLine: false as const,
  axisLine: false as const,
};
const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "0 6px 24px rgba(16,24,40,0.10)",
};

/** CEO center-wide overview — LimeTalk-style greeting, KPI tiles + analytics. */
export function CeoDashboard() {
  const { t } = useI18n();
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/api/dashboard"),
  });
  const recent = useQuery({
    queryKey: ["dashboard-recent-payments"],
    queryFn: () => api<PaymentRow[]>("/api/payments", { query: { scope: "all" } }),
  });

  if (isLoading || !data) return <Spinner />;

  const firstName = user.fullName.split(/\s+/)[0] || user.fullName;
  const monthLabel = data.trend[data.trend.length - 1]?.label ?? "";
  const recentPayments = (recent.data ?? [])
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 6);

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">
          {t("greeting")} {firstName},
        </h1>
        <p className="mt-0.5 text-sm text-muted">{t("dashboardSubtitle")}</p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard
          tint="blue"
          label={t("totalRevenue")}
          value={money(data.revenue.total)}
          sub={`${t("cash")} ${money(data.revenue.cash)} · ${t("online")} ${money(data.revenue.online)}`}
          icon={<Wallet size={16} />}
          href="/finances"
        />
        <KpiCard
          tint="violet"
          label={t("totalStudents")}
          value={data.totalStudents}
          sub={monthLabel}
          icon={<GraduationCap size={16} />}
          href="/students"
        />
        <KpiCard
          tint="green"
          label={t("paid")}
          value={data.statusCounts.paid}
          icon={<CheckCircle2 size={16} />}
          href="/students?status=paid"
        />
        <KpiCard
          tint="amber"
          label={t("awaiting_payment")}
          value={data.statusCounts.awaiting_payment}
          icon={<Clock size={16} />}
          href="/students?status=awaiting_payment"
        />
        <KpiCard
          tint="red"
          label={t("overdue")}
          value={data.statusCounts.overdue}
          icon={<AlertTriangle size={16} />}
          href="/students?status=overdue"
        />
        <KpiCard
          tint="violet"
          label={t("payrollObligation")}
          value={money(data.payrollObligation)}
          icon={<BadgeDollarSign size={16} />}
          href="/payroll"
        />
      </div>

      {/* Analytics band — revenue (wide) + payment-count trend. */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold">{t("revenueTrend")}</div>
            <Link
              href="/finances"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              {t("financialDetail")} <ArrowUpRight size={14} />
            </Link>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={data.trend}>
              <defs>
                <linearGradient id="barBrand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7256f2" />
                  <stop offset="100%" stopColor="#3b6ef5" />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tickFormatter={(l: string) => l.split(" ")[0].slice(0, 3)}
                {...chartAxis}
              />
              <Tooltip
                cursor={{ fill: "rgba(52,87,245,0.06)" }}
                formatter={(v: number) => money(v)}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                {data.trend.map((_, i) => (
                  <Cell key={i} fill="url(#barBrand)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <div className="mb-3 text-sm font-bold">{t("paymentsTrend")}</div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={data.trend}>
              <XAxis
                dataKey="label"
                tickFormatter={(l: string) => l.split(" ")[0].slice(0, 3)}
                {...chartAxis}
              />
              <Tooltip
                cursor={{ fill: "rgba(123,92,245,0.08)" }}
                formatter={(v: number) => String(v)}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="var(--violet)" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Recent payments */}
      <Card className="!p-0">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="text-sm font-bold">{t("recentPayments")}</div>
          <Link href="/payments" className="text-xs font-semibold text-primary hover:underline">
            {t("viewAll")}
          </Link>
        </div>
        {recent.isLoading ? (
          <div className="px-5 pb-4">
            <Spinner />
          </div>
        ) : recentPayments.length === 0 ? (
          <div className="px-5 pb-6 text-center text-sm text-muted">{t("noData")}</div>
        ) : (
          <div className="divide-y divide-border">
            {recentPayments.map((p) => (
              <Link
                key={p.id}
                href="/payments"
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-bg"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.studentName}</div>
                  <div className="truncate text-xs text-muted">{p.className}</div>
                </div>
                <MethodTag method={p.method} />
                {p.voided ? (
                  <span className="rounded-full bg-freeze/15 px-2 py-0.5 text-xs font-semibold text-freeze">
                    {t("voided")}
                  </span>
                ) : (
                  <span className="rounded-full bg-status-paid/15 px-2 py-0.5 text-xs font-semibold text-status-paid">
                    {t("paid")}
                  </span>
                )}
                <div className="figure w-28 shrink-0 text-right text-sm font-bold">{money(p.amount)}</div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
