import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Check, Users2, Wallet, BadgeDollarSign } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money, moneyShort, initials, avatarColor } from "../../lib/format";
import { monthKey, shiftMonth, monthLabel, academicYearStart } from "@shared/date";
import type { PayrollData } from "../../lib/types";
import { Button, Empty, Modal, Spinner, StatTile } from "../../components/ui";
import { SalaryCard } from "../../components/SalaryCard";

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
  const atStart = month <= academicYearStart(); // don't page before September

  const teachers = data?.teachers ?? [];
  const paidCount = teachers.filter((tr) => tr.paid).length;
  const paidSum = teachers.reduce((s, tr) => s + (tr.paid ? tr.paidAmount ?? 0 : 0), 0);

  return (
    <div className="space-y-4">
      {/* Header + month navigator */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t("payroll")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("payrollSubtitle")}</p>
        </div>
        <div className="flex items-center gap-1 rounded-pill bg-surface px-1.5 py-1 shadow-card ring-1 ring-border">
          <button className="rounded-full p-1.5 text-primary hover:bg-bg disabled:opacity-30" disabled={atStart} onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-[104px] text-center text-sm font-bold">{monthLabel(month)}</div>
          <button className="rounded-full p-1.5 text-primary hover:bg-bg disabled:opacity-30" disabled={atCurrent} onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile tint="blue" label={t("teacher_count")} value={teachers.length} icon={<Users2 size={18} />} />
            <StatTile tint="amber" label={t("toPay")} value={moneyShort(data.total)} icon={<Wallet size={18} />} />
            <StatTile tint="green" label={t("paidThisMonth")} value={moneyShort(paidSum)} icon={<BadgeDollarSign size={18} />} sub={`${paidCount} / ${teachers.length}`} />
          </div>

          {teachers.length ? (
            <div className="space-y-2">
              {teachers.map((tr) => (
                <button
                  key={tr.teacherId}
                  onClick={() => setOpenTeacher({ id: tr.teacherId, name: tr.name })}
                  className="relative flex w-full items-center gap-3 overflow-hidden rounded-card bg-surface p-3 pl-4 text-left shadow-card ring-1 ring-dark/[0.04] transition hover:shadow-card-hover"
                >
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: tr.paid ? "#12b76a" : "#3457f5" }} />
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: avatarColor(tr.name) }}>
                    {initials(tr.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{tr.name}</div>
                    <div className="truncate text-xs text-muted">
                      {t(tr.salaryModel)}
                      {tr.salaryModel === "percentage" ? ` (${tr.salaryValue}%)` : ` (${money(tr.salaryValue)})`}
                      {" · "}{tr.paidStudents} {t("paidStudents")}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="figure font-bold">{money(tr.paid ? tr.paidAmount ?? 0 : tr.netOwed)}</div>
                    {tr.paid ? (
                      <span className="inline-flex items-center gap-1 rounded-pill bg-status-paid/12 px-2 py-0.5 text-[11px] font-semibold text-status-paid">
                        <Check size={11} /> {t("salaryPaid")}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-pill bg-warning/12 px-2 py-0.5 text-[11px] font-semibold text-warning">{t("notPaid")}</span>
                    )}
                  </div>
                  <ChevronRight size={18} className="hidden shrink-0 text-muted sm:block" />
                </button>
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
