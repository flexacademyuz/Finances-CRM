import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import { monthKey, shiftMonth, monthLabel } from "@shared/date";
import type { PayrollData } from "../../lib/types";
import { Button, Card, Empty, Modal, Spinner, Stat } from "../../components/ui";
import { SalaryCard } from "../../components/SalaryCard";

type TeacherRow = PayrollData["teachers"][number];

/**
 * Payroll (month-based): pick a month and see every teacher's salary for it and
 * whether it's been paid. Open a teacher's salary card for the full monthly
 * table, analytics, per-month student justification, and to pay or advance.
 */
export function PayrollPage() {
  const { t } = useI18n();
  const [month, setMonth] = useState(monthKey());
  const [openTeacher, setOpenTeacher] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", month],
    queryFn: () => api<PayrollData>("/api/salary/payroll", { query: { month } }),
  });

  const atCurrent = month >= monthKey();

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t("payroll")}</h1>

      {/* Month navigator */}
      <div className="flex items-center justify-between rounded-btn border border-border bg-surface px-2 py-1.5">
        <button className="rounded-lg p-1.5 text-tg-link hover:bg-bg" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={18} />
        </button>
        <div className="text-sm font-semibold">{monthLabel(month)}</div>
        <button
          className="rounded-lg p-1.5 text-tg-link hover:bg-bg disabled:opacity-30"
          disabled={atCurrent}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <Stat label={t("unpaidMonths") /* outstanding for this month */} value={money(data.total)} accent="primary" />

          {data.teachers.length ? (
            <div className="space-y-2">
              {data.teachers.map((tr) => (
                <Card key={tr.teacherId} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{tr.name}</div>
                      <div className="text-xs text-muted">
                        {t(tr.salaryModel)}
                        {tr.salaryModel === "percentage" ? ` (${tr.salaryValue}%)` : ` (${money(tr.salaryValue)})`}
                        {" · "}
                        {tr.paidStudents} {t("paidStudents")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="figure font-bold">{money(tr.paid ? (tr.paidAmount ?? 0) : tr.netOwed)}</div>
                      {tr.paid ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-paid">
                          <Check size={11} /> {t("salaryPaid")}
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-muted">{t("notPaid")}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setOpenTeacher({ id: tr.teacherId, name: tr.name })}
                  >
                    {t("openSalaryCard")}
                  </Button>
                </Card>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </>
      )}

      {openTeacher && (
        <Modal open onClose={() => setOpenTeacher(null)} title={`${t("salaries")} — ${openTeacher.name}`}>
          <SalaryCard teacherId={openTeacher.id} canManage />
        </Modal>
      )}
    </div>
  );
}
