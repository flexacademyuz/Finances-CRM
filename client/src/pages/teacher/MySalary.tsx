import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import { monthLabel } from "@shared/date";
import type { SalaryEstimate } from "../../lib/types";
import type { SalaryRecord } from "@shared/schema";
import { Card, Empty, Spinner, Stat } from "../../components/ui";

/** Teacher's estimated salary this month + breakdown + history (spec §3.4). */
export function MySalary() {
  const { t, locale } = useI18n();
  const est = useQuery({ queryKey: ["salary-me"], queryFn: () => api<SalaryEstimate>("/api/salary/me") });
  const history = useQuery({
    queryKey: ["salary-history"],
    queryFn: () => api<SalaryRecord[]>("/api/salary/history"),
  });

  if (est.isLoading || !est.data) return <Spinner />;
  const s = est.data;

  const modelLabel =
    s.salaryModel === "percentage"
      ? `${t("percentage")} (${s.salaryValue}%)`
      : s.salaryModel === "per_student"
        ? `${t("per_student")} (${money(s.salaryValue)})`
        : `${t("fixed")} (${money(s.salaryValue)})`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("mySalary")}</h1>
      <div className="text-sm text-tg-hint">{monthLabel(s.month, locale)}</div>

      <Card>
        <div className="text-xs text-tg-hint">{t("estimatedSalary")}</div>
        <div className="mt-1 text-3xl font-bold">{money(s.estimatedSalary)}</div>
        <div className="mt-1 text-xs text-tg-hint">{modelLabel}</div>
      </Card>

      <div className="flex gap-3">
        <Stat label={t("collected")} value={money(s.collectedTotal)} sub={`${t("cash")} ${money(s.cashTotal)} · ${t("online")} ${money(s.onlineTotal)}`} />
        <Stat label={t("paidStudents")} value={s.paidStudents} />
      </div>

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
                {s.salaryModel !== "fixed" && (
                  <div className="font-semibold">{money(b.teacherShare)}</div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </div>

      {!!history.data?.length && (
        <div>
          <div className="mb-2 text-sm font-semibold">History</div>
          <div className="space-y-2">
            {history.data.map((h) => (
              <Card key={h.id} className="flex items-center justify-between">
                <div className="text-sm">{monthLabel(h.month, locale)}</div>
                <div className="font-semibold">{money(h.estimatedSalary)}</div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
