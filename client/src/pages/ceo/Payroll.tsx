import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import type { PayrollData } from "../../lib/types";
import { Card, Empty, Spinner, Stat } from "../../components/ui";

/** Aggregate payroll view: every teacher's salary rule + estimate (spec §3.4). */
export function PayrollPage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["payroll"],
    queryFn: () => api<PayrollData>("/api/salary/payroll"),
  });

  if (isLoading || !data) return <Spinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("payroll")}</h1>
      <Stat label={t("payrollObligation")} value={money(data.total)} />

      {data.teachers.length ? (
        <div className="space-y-2">
          {data.teachers.map((tr) => (
            <Card key={tr.teacherId}>
              <div className="flex items-center justify-between">
                <div className="font-semibold">{tr.name}</div>
                <div className="font-bold">{money(tr.estimatedSalary)}</div>
              </div>
              <div className="mt-1 text-xs text-tg-hint">
                {t(tr.salaryModel)}
                {tr.salaryModel === "percentage" ? ` (${tr.salaryValue}%)` : ` (${money(tr.salaryValue)})`}
                {" · "}
                {t("collected")}: {money(tr.collectedTotal)} · {tr.paidStudents} {t("paidStudents")}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty />
      )}
    </div>
  );
}
