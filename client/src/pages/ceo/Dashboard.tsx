import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
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
import { money } from "../../lib/format";
import type { DashboardData } from "../../lib/types";
import { Card, Spinner, Stat } from "../../components/ui";

/** CEO center-wide overview (spec §3.5). */
export function CeoDashboard() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/api/dashboard"),
  });

  if (isLoading || !data) return <Spinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("dashboard")}</h1>

      <Link href="/finances" className="block">
        <div className="hero cursor-pointer transition hover:brightness-105">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide text-white/70">{t("totalRevenue")}</div>
            <ChevronRight size={18} className="text-white/70" />
          </div>
          <div className="figure mt-1 text-3xl font-bold text-white">{money(data.revenue.total)}</div>
          <div className="mt-3 flex gap-3">
            <div className="flex-1 rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
              <div className="text-[11px] text-white/70">{t("cash")}</div>
              <div className="figure text-sm font-semibold text-white">{money(data.revenue.cash)}</div>
            </div>
            <div className="flex-1 rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
              <div className="text-[11px] text-white/70">{t("online")}</div>
              <div className="figure text-sm font-semibold text-white">{money(data.revenue.online)}</div>
            </div>
          </div>
        </div>
      </Link>

      <div className="flex gap-3">
        <Stat label={t("paid")} value={data.statusCounts.paid} accent="accent" href="/students?status=paid" />
        <Stat label={t("awaiting_payment")} value={data.statusCounts.awaiting_payment} accent="warning" href="/students?status=awaiting_payment" />
        <Stat label={t("overdue")} value={data.statusCounts.overdue} accent="danger" href="/students?status=overdue" />
      </div>

      <div className="flex gap-3">
        <Stat label={t("totalStudents")} value={data.totalStudents} accent="primary" href="/students" />
        <Stat label={t("payrollObligation")} value={money(data.payrollObligation)} accent="discount" href="/payroll" />
      </div>

      <Link href="/analytics" className="block">
      <Card className="cursor-pointer transition hover:border-primary/40 hover:shadow-card-hover">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">{t("totalRevenue")} — 6M</div>
          <ChevronRight size={18} className="text-tg-hint" />
        </div>
        <ResponsiveContainer width="100%" height={160}>
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
              fontSize={10}
              stroke="var(--text-muted)"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(52,87,245,0.06)" }}
              formatter={(v: number) => money(v)}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 6px 24px rgba(16,24,40,0.10)" }}
            />
            <Bar dataKey="total" radius={[8, 8, 0, 0]}>
              {data.trend.map((_, i) => (
                <Cell key={i} fill="url(#barBrand)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      </Link>
    </div>
  );
}
