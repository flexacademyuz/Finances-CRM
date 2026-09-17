import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Wallet,
  GraduationCap,
  CheckCircle2,
  Clock,
  AlertTriangle,
  BadgeDollarSign,
  ArrowUpRight,
  ArrowRight,
  UserPlus,
  BookOpen,
  BarChart3,
  Sparkles,
  Send,
} from "lucide-react";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
} from "recharts";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { money } from "../../lib/format";
import type { DashboardData, PaymentRow } from "../../lib/types";
import { Card, Spinner, MethodTag, StatTile, Delta } from "../../components/ui";

/** Twelve most-recent months as { value: YYYY-MM-01, label: "September 2026" }. */
function monthOptions(count = 12): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  });
}

const chartAxis = { fontSize: 10, stroke: "var(--text-muted)", tickLine: false as const, axisLine: false as const };
const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "0 6px 24px rgba(16,24,40,0.10)",
};
const compact = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${Math.round(n / 1000)}K` : String(n);

/** CEO center-wide overview — redesigned dashboard: KPIs, quick actions, charts,
 *  recent activity and a payments table. */
export function CeoDashboard() {
  const { t } = useI18n();
  const { user } = useSession();
  const months = monthOptions();
  const [month, setMonth] = useState(months[0].value);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", month],
    queryFn: () => api<DashboardData>("/api/dashboard", { query: { month } }),
  });
  const recent = useQuery({
    queryKey: ["dashboard-recent-payments"],
    queryFn: () => api<PaymentRow[]>("/api/payments", { query: { scope: "all" } }),
  });

  if (isLoading || !data) return <Spinner />;

  const firstName = user.fullName.split(/\s+/)[0] || user.fullName;
  // Real month-over-month revenue delta from the trend (last vs previous month).
  const trend = data.trend;
  const cur = trend[trend.length - 1]?.total ?? 0;
  const prev = trend[trend.length - 2]?.total ?? 0;
  const revDelta = prev > 0 ? +(((cur - prev) / prev) * 100).toFixed(1) : null;

  const recentPayments = (recent.data ?? [])
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 8);
  const activity = recentPayments.slice(0, 5);

  const actions = [
    { label: t("addStudentAction"), href: "/leads?register=1", icon: <UserPlus size={16} />, color: "#12b76a", soft: "#d6f2e3" },
    { label: t("recordPayment"), href: "/record", icon: <Wallet size={16} />, color: "#3457f5", soft: "#e3e9ff" },
    { label: t("createGroup"), href: "/classes", icon: <BookOpen size={16} />, color: "#7b5cf5", soft: "#ece4fe" },
    { label: t("generateReport"), href: "/finances", icon: <BarChart3 size={16} />, color: "#3457f5", soft: "#e3e9ff" },
  ];

  return (
    <div className="space-y-4">
      {/* Greeting + month picker */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">
            {t("greeting")} {firstName}, <span className="align-middle">👋</span>
          </h1>
          <p className="mt-0.5 text-sm text-muted">{t("dashboardSubtitle")}</p>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="select w-auto rounded-pill py-2 text-sm font-semibold"
          aria-label={t("selectMonth")}
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* KPI band: 6 uniform tiles on the left, Quick Actions on the right */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Revenue tile — gradient, same shape as the others */}
          <div className="relative overflow-hidden rounded-card p-4 text-white shadow-brand" style={{ background: "var(--brand-gradient)" }}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20"><Wallet size={18} /></span>
              <span className="text-sm font-semibold text-white/85">{t("totalRevenue")}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="figure text-2xl font-extrabold leading-none">{money(data.revenue.total)}</span>
              <Delta pct={revDelta} light />
            </div>
            <div className="mt-1.5 truncate text-xs text-white/80">
              {t("cash")} {money(data.revenue.cash)} · {t("online")} {money(data.revenue.online)}
            </div>
            <ArrowUpRight className="pointer-events-none absolute right-3 top-3 text-white/25" size={24} />
          </div>

          <StatTile tint="violet" label={t("totalStudents")} value={data.totalStudents} icon={<GraduationCap size={18} />} href="/students" sub={months.find((m) => m.value === month)?.label} />
          <StatTile tint="green" label={t("paid")} value={data.statusCounts.paid} icon={<CheckCircle2 size={18} />} href="/students?status=paid" sub={t("paid")} />
          <StatTile tint="amber" label={t("awaiting_payment")} value={data.statusCounts.awaiting_payment} icon={<Clock size={18} />} href="/students?status=awaiting_payment" sub={t("awaiting")} />
          <StatTile tint="red" label={t("overdue")} value={data.statusCounts.overdue} icon={<AlertTriangle size={18} />} href="/students?status=overdue" sub={t("overdue")} />
          <StatTile tint="violet" label={t("payrollObligation")} value={money(data.payrollObligation)} icon={<BadgeDollarSign size={18} />} href="/payroll" sub={months.find((m) => m.value === month)?.label} />
        </div>

        {/* Quick Actions */}
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center gap-3 p-4 text-white" style={{ background: "var(--brand-gradient)" }}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/20"><Sparkles size={18} /></span>
            <div>
              <div className="text-sm font-bold">{t("quickActions")}</div>
              <div className="text-xs text-white/80">{t("quickActionsSub")}</div>
            </div>
          </div>
          <div className="space-y-1 p-2">
            {actions.map((a) => (
              <Link key={a.href + a.label} href={a.href} className="flex items-center gap-3 rounded-input px-3 py-2.5 transition hover:bg-bg">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: a.soft, color: a.color }}>{a.icon}</span>
                <span className="flex-1 text-sm font-semibold">{a.label}</span>
                <ArrowRight size={16} className="text-muted" />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Charts + Recent activity */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-bold">{t("revenueTrend")}</div>
              <Link href="/finances" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                {t("financialDetail")} <ArrowUpRight size={13} />
              </Link>
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={trend} margin={{ top: 18 }}>
                <defs>
                  <linearGradient id="barBrand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7256f2" />
                    <stop offset="100%" stopColor="#3b6ef5" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tickFormatter={(l: string) => l.split(" ")[0].slice(0, 3)} {...chartAxis} />
                <YAxis width={30} tickFormatter={compact} {...chartAxis} />
                <Tooltip cursor={{ fill: "rgba(52,87,245,0.06)" }} formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                <Bar dataKey="total" radius={[8, 8, 0, 0]} maxBarSize={44}>
                  <LabelList dataKey="total" position="top" formatter={compact} style={{ fill: "var(--text-muted)", fontSize: 10, fontWeight: 700 }} />
                  {trend.map((_, i) => (
                    <Cell key={i} fill="url(#barBrand)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-bold">{t("paymentsTrend")}</div>
              <Link href="/payments" className="text-xs font-semibold text-primary hover:underline">{t("viewAll")}</Link>
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={trend} margin={{ top: 18 }}>
                <XAxis dataKey="label" tickFormatter={(l: string) => l.split(" ")[0].slice(0, 3)} {...chartAxis} />
                <YAxis width={24} {...chartAxis} />
                <Tooltip cursor={{ fill: "rgba(18,183,106,0.08)" }} formatter={(v: number) => String(v)} contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#12b76a" maxBarSize={44}>
                  <LabelList dataKey="count" position="top" style={{ fill: "var(--text-muted)", fontSize: 10, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Recent activity — built from the latest payments */}
        <Card>
          <div className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Clock size={16} className="text-primary" /> {t("recentActivity")}
          </div>
          {recent.isLoading ? (
            <Spinner />
          ) : activity.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted">{t("noActivity")}</div>
          ) : (
            <div className="space-y-1">
              {activity.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-status-paid/15 text-status-paid">
                    <Send size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{t("paymentReceived")}</div>
                    <div className="truncate text-xs text-muted">{p.studentName}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="figure text-sm font-bold text-status-paid">+{money(p.amount)}</div>
                    <div className="text-[11px] text-muted">
                      {formatDistanceToNowStrict(new Date(p.createdAt))} {t("ago")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent payments table */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="text-sm font-bold">{t("recentPayments")}</div>
          <Link href="/payments" className="text-xs font-semibold text-primary hover:underline">{t("viewAll")}</Link>
        </div>
        {recent.isLoading ? (
          <div className="px-5 pb-4"><Spinner /></div>
        ) : recentPayments.length === 0 ? (
          <div className="px-5 pb-6 text-center text-sm text-muted">{t("noData")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-y border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-5 py-2">{t("student")}</th>
                  <th className="px-3 py-2">{t("class")}</th>
                  <th className="px-3 py-2 text-right">{t("amount")}</th>
                  <th className="px-3 py-2">{t("method")}</th>
                  <th className="px-3 py-2">{t("date")}</th>
                  <th className="px-5 py-2">{t("status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentPayments.map((p) => (
                  <tr key={p.id} className="transition hover:bg-bg">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
                          {p.studentName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                        </span>
                        <span className="font-medium">{p.studentName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{p.className}</td>
                    <td className="figure px-3 py-2.5 text-right font-bold">{money(p.amount)}</td>
                    <td className="px-3 py-2.5"><MethodTag method={p.method} /></td>
                    <td className="px-3 py-2.5 text-muted">
                      {new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-5 py-2.5">
                      {p.voided ? (
                        <span className="rounded-full bg-freeze/15 px-2 py-0.5 text-xs font-semibold text-freeze">{t("voided")}</span>
                      ) : (
                        <span className="rounded-full bg-status-paid/15 px-2 py-0.5 text-xs font-semibold text-status-paid">{t("paid")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
