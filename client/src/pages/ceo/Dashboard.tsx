import { useQuery } from "@tanstack/react-query";
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

      <Card>
        <div className="text-xs text-tg-hint">{t("totalRevenue")}</div>
        <div className="mt-1 text-3xl font-bold">{money(data.revenue.total)}</div>
        <div className="mt-2 flex gap-4 text-sm">
          <span className="text-tg-hint">
            {t("cash")}: <span className="font-semibold text-tg-text">{money(data.revenue.cash)}</span>
          </span>
          <span className="text-tg-hint">
            {t("online")}: <span className="font-semibold text-tg-text">{money(data.revenue.online)}</span>
          </span>
        </div>
      </Card>

      <div className="flex gap-3">
        <Stat label={t("paid")} value={data.statusCounts.paid} />
        <Stat label={t("awaiting_payment")} value={data.statusCounts.awaiting_payment} />
        <Stat label={t("overdue")} value={data.statusCounts.overdue} />
      </div>

      <div className="flex gap-3">
        <Stat label={t("totalStudents")} value={data.totalStudents} />
        <Stat label={t("payrollObligation")} value={money(data.payrollObligation)} />
      </div>

      <Card>
        <div className="mb-3 text-sm font-semibold">{t("totalRevenue")} — 6M</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data.trend}>
            <XAxis
              dataKey="label"
              tickFormatter={(l: string) => l.split(" ")[0].slice(0, 3)}
              fontSize={10}
              stroke="var(--tg-hint)"
            />
            <Tooltip
              formatter={(v: number) => money(v)}
              contentStyle={{ background: "var(--tg-bg)", border: "none", borderRadius: 12 }}
            />
            <Bar dataKey="total" radius={[6, 6, 0, 0]}>
              {data.trend.map((_, i) => (
                <Cell key={i} fill="var(--tg-button)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
