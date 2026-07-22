import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import { EXPENSE_CATEGORY_NAMES } from "@shared/expense-categories";
import type { FinanceOverview } from "../../lib/types";
import { Card, Select, Spinner, Stat } from "../../components/ui";

/**
 * Live REVENUE / EXPENSES / NET PROFIT grid for an academic year (Sep → Aug),
 * mirroring the original spreadsheet (V2 Change 5). All cells computed from DB.
 */
export function FinancesPage() {
  const { t } = useI18n();
  const now = new Date();
  const defaultYear = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const [year, setYear] = useState(defaultYear);

  const { data, isLoading } = useQuery({
    queryKey: ["finance-overview", year],
    queryFn: () => api<FinanceOverview>("/api/finance/overview", { query: { year: String(year) } }),
  });

  if (isLoading || !data) return <Spinner />;

  const short = (label: string) => label.split(" ")[0].slice(0, 3);
  const fmt = (n: number) => (n === 0 ? "—" : money(n).replace(" UZS", ""));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("finances")}</h1>
        <Select className="w-36" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
          {[defaultYear + 1, defaultYear, defaultYear - 1, defaultYear - 2].map((y) => (
            <option key={y} value={y}>{`${y}–${y + 1}`}</option>
          ))}
        </Select>
      </div>

      <div className="flex gap-3">
        <Stat label={t("revenue")} value={money(data.yearTotals.revenue)} />
        <Stat label={t("totalExpenses")} value={money(data.yearTotals.expenses)} />
      </div>
      <Card
        className={`flex items-center justify-between ${
          data.yearTotals.netProfit >= 0 ? "text-status-paid" : "text-status-overdue"
        }`}
      >
        <span className="font-semibold">{t("netProfit")} ({data.label})</span>
        <span className="text-lg font-bold">{money(data.yearTotals.netProfit)}</span>
      </Card>

      {/* Scrollable spreadsheet-style grid */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead>
            <tr className="text-tg-hint">
              <th className="sticky left-0 z-10 bg-tg-bg px-2 py-2 text-left">&nbsp;</th>
              {data.months.map((m) => (
                <th key={m.month} className="px-2 py-2 text-right font-semibold">{short(m.label)}</th>
              ))}
              <th className="px-2 py-2 text-right font-bold">YEAR</th>
            </tr>
          </thead>
          <tbody>
            <Row
              label={t("revenue")}
              values={data.revenue}
              total={data.yearTotals.revenue}
              fmt={fmt}
              bold
              accent="text-status-paid"
            />
            <tr>
              <td className="sticky left-0 z-10 bg-tg-bg px-2 pt-3 text-left font-bold uppercase text-tg-hint">
                {t("expenses")}
              </td>
              {data.months.map((m) => <td key={m.month} />)}
              <td />
            </tr>
            {EXPENSE_CATEGORY_NAMES.map((cat) => {
              const vals = data.expensesByCategory[cat] ?? [];
              const total = vals.reduce((a, b) => a + b, 0);
              if (total === 0) return null;
              return <Row key={cat} label={cat} values={vals} total={total} fmt={fmt} indent />;
            })}
            <Row
              label={t("totalExpenses")}
              values={data.totalExpenses}
              total={data.yearTotals.expenses}
              fmt={fmt}
              bold
            />
            <Row
              label={t("netProfit")}
              values={data.netProfit}
              total={data.yearTotals.netProfit}
              fmt={fmt}
              bold
              highlight
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  label,
  values,
  total,
  fmt,
  bold,
  indent,
  highlight,
  accent,
}: {
  label: string;
  values: number[];
  total: number;
  fmt: (n: number) => string;
  bold?: boolean;
  indent?: boolean;
  highlight?: boolean;
  accent?: string;
}) {
  const color = highlight ? (total >= 0 ? "text-status-paid" : "text-status-overdue") : accent ?? "";
  return (
    <tr className={`${bold ? "font-semibold" : ""} ${color}`}>
      <td className={`sticky left-0 z-10 bg-tg-bg px-2 py-1.5 text-left ${indent ? "pl-5 text-tg-hint" : ""}`}>
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className="px-2 py-1.5 text-right tabular-nums">{fmt(v)}</td>
      ))}
      <td className="px-2 py-1.5 text-right font-bold tabular-nums">{fmt(total)}</td>
    </tr>
  );
}
