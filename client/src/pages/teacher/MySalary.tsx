import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money, formatDate } from "../../lib/format";
import type { SalaryCycle, PayoutRow } from "../../lib/types";
import { Card, Empty, Spinner, Stat } from "../../components/ui";

/** Teacher's live salary cycle: earned since last payment − advances = net owed. */
export function MySalary() {
  const { t, locale } = useI18n();
  const cycle = useQuery({ queryKey: ["salary-cycle"], queryFn: () => api<SalaryCycle>("/api/salary/cycle") });
  const payouts = useQuery({ queryKey: ["salary-payouts"], queryFn: () => api<PayoutRow[]>("/api/salary/payouts") });

  if (cycle.isLoading || !cycle.data) return <Spinner />;
  const s = cycle.data;

  const modelLabel =
    s.salaryModel === "percentage"
      ? `${t("percentage")} (${s.salaryValue}%)`
      : s.salaryModel === "per_student"
        ? `${t("per_student")} (${money(s.salaryValue)})`
        : `${t("fixed")} (${money(s.salaryValue)})`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("mySalary")}</h1>

      <Card>
        <div className="text-xs text-tg-hint">{t("netOwed")}</div>
        <div className="mt-1 text-3xl font-bold">{money(Math.max(0, s.netOwed))}</div>
        <div className="mt-1 text-xs text-tg-hint">
          {modelLabel}
          {s.periodStart && <> · {t("sinceLastPayout")} {formatDate(s.periodStart, locale)}</>}
        </div>
      </Card>

      <div className="flex gap-3">
        <Stat label={t("earnedThisCycle")} value={money(s.earned)} accent="primary" />
        <Stat label={t("advances")} value={money(s.advancesTotal)} accent="warning" />
      </div>

      {s.advances.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-semibold">{t("advances")}</div>
          <div className="space-y-2">
            {s.advances.map((a) => (
              <Card key={a.id} className="flex items-center justify-between">
                <div className="text-sm">
                  {formatDate(a.paidOn, locale)}
                  {a.note && <span className="text-tg-hint"> · {a.note}</span>}
                </div>
                <div className="font-semibold text-status-awaiting">−{money(a.amount)}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 text-sm font-semibold">{t("classes")}</div>
        {s.breakdown.length ? (
          <div className="space-y-2">
            {s.breakdown.map((b) => (
              <Card key={b.classId} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{b.className}</div>
                  <div className="text-xs text-tg-hint">
                    {b.paidStudents} {t("paidStudents")} · {money(b.collected)}
                  </div>
                </div>
                {s.salaryModel !== "fixed" && <div className="font-semibold">{money(b.teacherShare)}</div>}
              </Card>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </div>

      {!!payouts.data?.length && (
        <div>
          <div className="mb-2 text-sm font-semibold">{t("payoutHistory")}</div>
          <div className="space-y-2">
            {payouts.data.map((p) => (
              <Card key={p.id} className="flex items-center justify-between">
                <div className="text-sm">
                  {formatDate(p.paidOn, locale)}
                  {Number(p.advancesDeducted) > 0 && (
                    <span className="text-tg-hint"> · {t("advancesDeducted")} {money(Number(p.advancesDeducted))}</span>
                  )}
                </div>
                <div className="font-semibold">{money(Number(p.amount))}</div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
