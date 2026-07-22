import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import { Card, Empty, Spinner, Stat } from "../../components/ui";

type Tab = "revenue" | "payments" | "students" | "groups" | "teachers" | "expenses";
const TABS: Tab[] = ["revenue", "payments", "students", "groups", "teachers", "expenses"];

const chartAxis = { fontSize: 10, stroke: "var(--tg-hint)" };
const tooltipStyle = { background: "var(--tg-bg)", border: "none", borderRadius: 12, fontSize: 12 };

export function AnalyticsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("revenue");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("analytics")}</h1>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === tb ? "btn-primary" : "bg-tg-secondary-bg text-tg-hint"
            }`}
          >
            {t(tb)}
          </button>
        ))}
      </div>

      {tab === "revenue" && <RevenueTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "students" && <StudentsTab />}
      {tab === "groups" && <GroupsTab />}
      {tab === "teachers" && <TeachersTab />}
      {tab === "expenses" && <ExpensesTab />}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: T[]; onChange: (v: T) => void }) {
  const { t } = useI18n();
  return (
    <div className="inline-flex rounded-xl bg-tg-secondary-bg p-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-lg px-3 py-1 text-xs font-semibold ${value === o ? "btn-primary" : "text-tg-hint"}`}
        >
          {t(o as never)}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────── Revenue ───────────────────────────── */

function RevenueTab() {
  const { t } = useI18n();
  const [gran, setGran] = useState<"daily" | "monthly" | "yearly">("monthly");
  return (
    <div className="space-y-3">
      <Segmented value={gran} options={["daily", "monthly", "yearly"]} onChange={setGran} />
      {gran === "daily" && <RevenueDaily />}
      {gran === "monthly" && <RevenueMonthly />}
      {gran === "yearly" && <RevenueYearly />}
    </div>
  );
}

function RevenueDaily() {
  const { data, isLoading } = useQuery({
    queryKey: ["an-rev-daily"],
    queryFn: () => api<{ date: string; total: number; count: number }[]>("/api/analytics/revenue/daily"),
  });
  if (isLoading || !data) return <Spinner />;
  const withAvg = data.map((d, i) => {
    const slice = data.slice(Math.max(0, i - 6), i + 1);
    return { ...d, avg7: Math.round(slice.reduce((a, b) => a + b.total, 0) / slice.length) };
  });
  const total = data.reduce((a, b) => a + b.total, 0);
  const peak = data.reduce((a, b) => (b.total > a.total ? b : a), data[0]);
  return (
    <>
      <SummaryRow total={total} extra={peak ? { label: "Peak", value: money(peak.total) } : undefined} />
      <ChartCard>
        <ComposedChart data={withAvg}>
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} {...chartAxis} interval={4} />
          <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
          <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="var(--tg-button)" />
          <Line dataKey="avg7" stroke="#10B981" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ChartCard>
    </>
  );
}

function RevenueMonthly() {
  const { data, isLoading } = useQuery({
    queryKey: ["an-rev-monthly"],
    queryFn: () =>
      api<{ average: number; data: { label: string; total: number; changePct: number | null }[] }>(
        "/api/analytics/revenue/monthly",
      ),
  });
  if (isLoading || !data) return <Spinner />;
  const total = data.data.reduce((a, b) => a + b.total, 0);
  return (
    <>
      <SummaryRow total={total} extra={{ label: "Avg/mo", value: money(data.average) }} />
      <ChartCard>
        <BarChart data={data.data}>
          <XAxis dataKey="label" tickFormatter={(l: string) => l.split(" ")[0].slice(0, 3)} {...chartAxis} />
          <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
          <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="var(--tg-button)" />
        </BarChart>
      </ChartCard>
    </>
  );
}

function RevenueYearly() {
  const { data, isLoading } = useQuery({
    queryKey: ["an-rev-yearly"],
    queryFn: () =>
      api<{ years: { label: string; total: number }[]; yoyPct: number | null }>("/api/analytics/revenue/yearly"),
  });
  if (isLoading || !data) return <Spinner />;
  return (
    <>
      {data.yoyPct != null && (
        <Card>
          <div className="text-xs text-tg-hint">Year over year</div>
          <div className={`text-xl font-bold ${data.yoyPct >= 0 ? "text-status-paid" : "text-status-overdue"}`}>
            {data.yoyPct >= 0 ? "+" : ""}{data.yoyPct}%
          </div>
        </Card>
      )}
      <ChartCard>
        <BarChart data={data.years}>
          <XAxis dataKey="label" {...chartAxis} />
          <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
            {data.years.map((_, i) => (
              <Cell key={i} fill={i === data.years.length - 1 ? "var(--tg-button)" : "#818CF8"} />
            ))}
          </Bar>
        </BarChart>
      </ChartCard>
    </>
  );
}

/* ─────────────────────────────── Payments ──────────────────────────── */

function PaymentsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["an-pay-daily"],
    queryFn: () =>
      api<{ date: string; count: number; cashCount: number; onlineCount: number; avgSize: number }[]>(
        "/api/analytics/payments/daily",
      ),
  });
  if (isLoading || !data) return <Spinner />;
  const totalTx = data.reduce((a, b) => a + b.count, 0);
  return (
    <div className="space-y-3">
      <SummaryRow totalLabel="Transactions" totalRaw={totalTx} />
      <ChartCard>
        <BarChart data={data}>
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} {...chartAxis} interval={4} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="cashCount" stackId="a" fill="#10B981" />
          <Bar dataKey="onlineCount" stackId="a" fill="var(--tg-button)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
    </div>
  );
}

/* ─────────────────────────────── Students ──────────────────────────── */

function StudentsTab() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["an-students"],
    queryFn: () =>
      api<{
        enrollments: { label: string; count: number }[];
        statusCounts: Record<string, number>;
        discounts: { id: string; student: string; type: string; value: number; reason: string }[];
        freezes: { id: string; student: string; freezeFrom: string; freezeTo: string; reason: string }[];
      }>("/api/analytics/students/overview"),
  });
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Stat label={t("paid")} value={data.statusCounts.paid} />
        <Stat label={t("overdue")} value={data.statusCounts.overdue} />
        <Stat label={t("frozen")} value={data.statusCounts.frozen} />
      </div>
      <div className="text-sm font-semibold">{t("newEnrollments")}</div>
      <ChartCard height={140}>
        <BarChart data={data.enrollments}>
          <XAxis dataKey="label" tickFormatter={(l: string) => l.split(" ")[0].slice(0, 3)} {...chartAxis} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="var(--tg-button)" />
        </BarChart>
      </ChartCard>

      <ListCard title={`${t("activeDiscounts")} (${data.discounts.length})`}>
        {data.discounts.map((d) => (
          <li key={d.id} className="flex justify-between py-1 text-sm">
            <span>{d.student}</span>
            <span className="text-status-discount">{d.type === "percentage" ? `${d.value}%` : money(d.value)}</span>
          </li>
        ))}
      </ListCard>
      <ListCard title={`${t("activeFreezes")} (${data.freezes.length})`}>
        {data.freezes.map((f) => (
          <li key={f.id} className="flex justify-between py-1 text-sm">
            <span>{f.student}</span>
            <span className="text-status-frozen">{f.freezeFrom} → {f.freezeTo}</span>
          </li>
        ))}
      </ListCard>
    </div>
  );
}

/* ──────────────────────────────── Groups ───────────────────────────── */

function GroupsTab() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["an-groups"],
    queryFn: () =>
      api<{ groupId: string; name: string; revenue: number; studentCount: number; complianceRate: number }[]>(
        "/api/analytics/groups/revenue",
      ),
  });
  if (isLoading || !data) return <Spinner />;
  if (!data.length) return <Empty />;
  return (
    <div className="space-y-2">
      {data.map((g) => (
        <Card key={g.groupId}>
          <div className="flex items-center justify-between">
            <div className="font-semibold">{g.name}</div>
            <div className="font-bold">{money(g.revenue)}</div>
          </div>
          <div className="mt-1 text-xs text-tg-hint">
            {g.studentCount} {t("students")} · {g.complianceRate}% {t("complianceRate")}
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-tg-bg">
            <div className="h-full rounded-full bg-status-paid" style={{ width: `${g.complianceRate}%` }} />
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ─────────────────────────────── Teachers ──────────────────────────── */

function TeachersTab() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["an-teachers"],
    queryFn: () =>
      api<{ teacherId: string; name: string; revenue: number; estimatedSalary: number; salaryRatio: number | null; groupCount: number }[]>(
        "/api/analytics/teachers/revenue",
      ),
  });
  if (isLoading || !data) return <Spinner />;
  if (!data.length) return <Empty />;
  return (
    <div className="space-y-2">
      {data.map((tr) => (
        <Card key={tr.teacherId}>
          <div className="flex items-center justify-between">
            <div className="font-semibold">{tr.name}</div>
            <div className="font-bold">{money(tr.revenue)}</div>
          </div>
          <div className="mt-1 text-xs text-tg-hint">
            {t("mySalary")}: {money(tr.estimatedSalary)}
            {tr.salaryRatio != null ? ` · ${t("salaryRatio")} ${tr.salaryRatio}%` : ""} · {tr.groupCount}{" "}
            {t("groupCount")}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ─────────────────────────────── Expenses ──────────────────────────── */

function ExpensesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["an-exp-monthly"],
    queryFn: () =>
      api<{ data: { label: string; revenue: number; expenses: number; netProfit: number }[] }>(
        "/api/analytics/expenses/monthly",
      ),
  });
  if (isLoading || !data) return <Spinner />;
  return (
    <ChartCard>
      <LineChart data={data.data}>
        <CartesianGrid vertical={false} stroke="var(--tg-hint)" strokeOpacity={0.15} />
        <XAxis dataKey="label" tickFormatter={(l: string) => l.split(" ")[0].slice(0, 3)} {...chartAxis} />
        <YAxis hide />
        <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
        <Line dataKey="revenue" stroke="var(--tg-button)" dot={false} strokeWidth={2} />
        <Line dataKey="expenses" stroke="#F43F5E" dot={false} strokeWidth={2} />
        <Line dataKey="netProfit" stroke="#10B981" dot={false} strokeWidth={2} />
      </LineChart>
    </ChartCard>
  );
}

/* ──────────────────────────────── Bits ─────────────────────────────── */

function ChartCard({ children, height = 180 }: { children: ReactNode; height?: number }) {
  return (
    <Card>
      <ResponsiveContainer width="100%" height={height}>
        {children as any}
      </ResponsiveContainer>
    </Card>
  );
}

function SummaryRow({
  total,
  totalRaw,
  totalLabel,
  extra,
}: {
  total?: number;
  totalRaw?: number;
  totalLabel?: string;
  extra?: { label: string; value: string };
}) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2">
      <Stat label={totalLabel ?? t("revenue")} value={totalRaw != null ? totalRaw : money(total ?? 0)} />
      {extra && <Stat label={extra.label} value={extra.value} />}
    </div>
  );
}

function ListCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-1 text-sm font-semibold">{title}</div>
      <ul className="divide-y divide-tg-hint/10">{children}</ul>
    </Card>
  );
}
