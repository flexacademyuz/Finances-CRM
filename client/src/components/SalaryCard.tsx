import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HandCoins, BadgeDollarSign, Check, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { haptic } from "../lib/telegram";
import { money, formatDate } from "../lib/format";
import type { MonthlySalary, SalaryMonthRow } from "../lib/types";
import type { PaymentMethod } from "@shared/schema";
import { Button, Card, Field, Input, Modal, Segmented, Spinner, Stat } from "./ui";

/**
 * A teacher's functional salary card: a monthly table, salary analytics, and the
 * per-student justification for each month. When `canManage` (CEO), a month can
 * be paid (once) and advances handed out from here. Salaries are strictly
 * per-month — paying one month never affects another.
 */
export function SalaryCard({
  teacherId,
  canManage = false,
}: {
  teacherId?: string;
  canManage?: boolean;
}) {
  const { t } = useI18n();
  const q = teacherId ? { teacherId } : undefined;

  const months = useQuery({
    queryKey: ["salary-months", teacherId ?? "me"],
    queryFn: () => api<SalaryMonthRow[]>("/api/salary/months", { query: q }),
  });

  const [month, setMonth] = useState<string | null>(null);
  const selected = month ?? months.data?.[0]?.month ?? null;

  if (months.isLoading || !months.data) return <Spinner />;

  const rows = months.data;
  const paidRows = rows.filter((r) => r.paid);
  const totalPaid = paidRows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
  const avg = paidRows.length ? totalPaid / paidRows.length : 0;
  const unpaid = rows.filter((r) => !r.paid && r.estimatedSalary > 0).length;

  return (
    <div className="space-y-4">
      {/* Analytics */}
      <div className="flex gap-3">
        <Stat label={t("totalPaidSalary")} value={money(totalPaid)} accent="primary" />
        <Stat label={t("avgMonthly")} value={money(avg)} />
        <Stat label={t("unpaidMonths")} value={String(unpaid)} accent={unpaid ? "warning" : undefined} />
      </div>

      {/* Monthly table */}
      <div>
        <div className="mb-2 text-sm font-semibold">{t("monthlySalaries")}</div>
        <div className="space-y-1.5">
          {rows.map((r) => {
            const active = r.month === selected;
            return (
              <button
                key={r.month}
                onClick={() => setMonth(r.month)}
                className={`flex w-full items-center justify-between rounded-btn border px-3 py-2 text-left text-sm transition ${
                  active ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-primary"
                }`}
              >
                <span className="font-medium">{r.label}</span>
                <span className="flex items-center gap-2">
                  <span className="figure font-semibold">
                    {money(r.paid ? (r.paidAmount ?? 0) : r.estimatedSalary)}
                  </span>
                  {r.paid && r.remaining > 0.5 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                      +{money(r.remaining)}
                    </span>
                  ) : r.paid ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-status-paid/15 px-2 py-0.5 text-[11px] font-semibold text-status-paid">
                      <Check size={11} /> {t("salaryPaid")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-semibold text-muted">
                      {t("notPaid")}
                    </span>
                  )}
                  <ChevronRight size={15} className={active ? "text-primary" : "text-tg-hint"} />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected month detail + justification */}
      {selected && (
        <MonthDetail teacherId={teacherId} month={selected} canManage={canManage} />
      )}
    </div>
  );
}

function MonthDetail({
  teacherId,
  month,
  canManage,
}: {
  teacherId?: string;
  month: string;
  canManage: boolean;
}) {
  const { t, locale } = useI18n();
  const q = teacherId ? { teacherId, month } : { month };
  const [paying, setPaying] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const detail = useQuery({
    queryKey: ["salary-month", teacherId ?? "me", month],
    queryFn: () => api<MonthlySalary>("/api/salary/month", { query: q }),
  });

  if (detail.isLoading || !detail.data) return <Spinner />;
  const s = detail.data;
  // What you'd pay now = this month's earned + earlier late remainders − advances.
  const net = Math.max(0, s.grossPayable - s.advancesTotal);
  // Once paid, the justification is the stored snapshot; otherwise it's live.
  const students = s.paid ? s.paid.students : s.students;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{s.monthLabel}</div>
        {s.paid ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-status-paid/15 px-2.5 py-0.5 text-xs font-semibold text-status-paid">
            <Check size={12} /> {t("salaryPaid")}
          </span>
        ) : (
          <span className="rounded-full bg-bg px-2.5 py-0.5 text-xs font-semibold text-muted">{t("notPaid")}</span>
        )}
      </div>

      <div className="rounded-btn border border-border bg-bg p-3 text-sm">
        {s.paid ? (
          <>
            <Row label={t("earned")} value={money(s.paid.grossEarned)} />
            {s.paid.advancesDeducted > 0 && (
              <Row label={t("advancesDeducted")} value={`−${money(s.paid.advancesDeducted)}`} />
            )}
            <div className="mt-1 border-t border-border pt-1">
              <Row label={t("salaryPaid")} value={money(s.paid.amount)} bold />
            </div>
            <div className="mt-1 text-xs text-muted">{formatDate(s.paid.paidOn, locale)}</div>
            {s.remaining > 0.5 && (
              <div className="mt-2 rounded-lg bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
                {t("owedRemaining")}: {money(s.remaining)} · {t("rollsNext")}
              </div>
            )}
          </>
        ) : (
          <>
            <Row label={t("earned")} value={money(s.estimatedSalary)} />
            {s.carryover.map((c) => (
              <Row key={c.month} label={`${t("carriedFrom")} ${c.label}`} value={`+${money(c.amount)}`} />
            ))}
            {s.advancesTotal > 0 && (
              <Row label={t("advancesDeducted")} value={`−${money(s.advancesTotal)}`} />
            )}
            <div className="mt-1 border-t border-border pt-1">
              <Row label={t("netOwed")} value={money(net)} bold />
            </div>
            {s.carryover.length > 0 && (
              <div className="mt-1 text-xs text-tg-hint">{t("includesCarryover")}</div>
            )}
          </>
        )}
      </div>

      {/* Student justification list */}
      <div>
        <div className="mb-1 text-sm font-semibold">{t("salaryStudents")}</div>
        <div className="mb-2 text-xs text-tg-hint">{t("justifyNote")}</div>
        {students.length ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg text-xs text-muted">
                  <th className="px-3 py-1.5 text-left font-semibold">{t("student")}</th>
                  <th className="px-3 py-1.5 text-right font-semibold">{t("share")}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((st) => (
                  <tr key={st.studentId} className="border-t border-border">
                    <td className="px-3 py-1.5">
                      <div className="font-medium">{st.studentName}</div>
                      <div className="text-xs text-tg-hint">{st.className}</div>
                    </td>
                    <td className="figure px-3 py-1.5 text-right font-semibold">
                      {money(s.salaryModel === "fixed" ? st.paid : st.credit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg bg-bg px-3 py-2 text-xs text-tg-hint">{t("noSalaryStudents")}</div>
        )}
      </div>

      {canManage && teacherId && (
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setAdvancing(true)}>
            <HandCoins size={16} /> {t("advance")}
          </Button>
          <Button
            className="flex-1"
            disabled={!!s.paid}
            onClick={() => setPaying(true)}
          >
            <BadgeDollarSign size={16} /> {s.paid ? t("salaryPaid") : t("payThisMonth")}
          </Button>
        </div>
      )}

      {paying && teacherId && (
        <PayMonthModal teacherId={teacherId} detail={s} net={net} onClose={() => setPaying(false)} />
      )}
      {advancing && teacherId && (
        <AdvanceModal teacherId={teacherId} onClose={() => setAdvancing(false)} />
      )}
    </Card>
  );
}

function MethodPicker({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  const { t } = useI18n();
  return (
    <Segmented
      full
      value={value}
      onChange={onChange}
      options={[
        { value: "cash", label: t("cash") },
        { value: "online", label: t("online") },
      ]}
    />
  );
}

function PayMonthModal({
  teacherId,
  detail,
  net,
  onClose,
}: {
  teacherId: string;
  detail: MonthlySalary;
  net: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(net));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");

  const pay = useMutation({
    mutationFn: () =>
      api("/api/salary/payout", {
        method: "POST",
        body: { teacherId, month: detail.month, amount: Number(amount), method, note: note || undefined },
      }),
    onSuccess: () => {
      haptic("success");
      qc.invalidateQueries();
      onClose();
    },
    onError: () => haptic("error"),
  });

  return (
    <Modal open onClose={onClose} title={`${t("payThisMonth")} — ${detail.monthLabel}`}>
      <div className="space-y-3">
        <div className="rounded-btn border border-border bg-bg p-3 text-sm">
          <Row label={`${t("earned")} · ${detail.monthLabel}`} value={money(detail.estimatedSalary)} />
          {detail.carryover.map((c) => (
            <Row key={c.month} label={`${t("carriedFrom")} ${c.label}`} value={`+${money(c.amount)}`} />
          ))}
          {detail.advancesTotal > 0 && (
            <Row label={t("advancesDeducted")} value={`−${money(detail.advancesTotal)}`} />
          )}
          <div className="mt-1 border-t border-border pt-1">
            <Row label={t("netOwed")} value={money(net)} bold />
          </div>
        </div>

        {/* Justification the CEO is paying against. */}
        {detail.students.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border text-sm">
            {detail.students.map((st) => (
              <div key={st.studentId} className="flex items-center justify-between border-b border-border px-3 py-1.5 last:border-0">
                <span className="min-w-0 truncate">{st.studentName} <span className="text-tg-hint">· {st.className}</span></span>
                <span className="figure shrink-0 font-medium">
                  {money(detail.salaryModel === "fixed" ? st.paid : st.credit)}
                </span>
              </div>
            ))}
          </div>
        )}

        <Field label={t("amountToPay")}>
          <Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("method")}>
          <MethodPicker value={method} onChange={setMethod} />
        </Field>
        <Field label={`${t("note")} (${t("optional")})`}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {pay.isError && <div className="text-sm text-status-overdue">{(pay.error as Error).message}</div>}
        <Button className="w-full" disabled={pay.isPending} onClick={() => pay.mutate()}>
          {t("recordSalaryPayment")}
        </Button>
      </div>
    </Modal>
  );
}

function AdvanceModal({ teacherId, onClose }: { teacherId: string; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");

  const give = useMutation({
    mutationFn: () =>
      api("/api/advances", {
        method: "POST",
        body: { teacherId, amount: Number(amount), method, note: note || undefined },
      }),
    onSuccess: () => {
      haptic("success");
      qc.invalidateQueries();
      onClose();
    },
    onError: () => haptic("error"),
  });

  return (
    <Modal open onClose={onClose} title={t("advanceToTeacher")}>
      <div className="space-y-3">
        <Field label={t("amount")}>
          <Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("method")}>
          <MethodPicker value={method} onChange={setMethod} />
        </Field>
        <Field label={`${t("note")} (${t("optional")})`}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {give.isError && <div className="text-sm text-status-overdue">{(give.error as Error).message}</div>}
        <Button className="w-full" disabled={!Number(amount) || give.isPending} onClick={() => give.mutate()}>
          {t("giveAdvance")}
        </Button>
      </div>
    </Modal>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-bold" : "text-muted"}`}>
      <span>{label}</span>
      <span className={bold ? "figure" : "figure text-text"}>{value}</span>
    </div>
  );
}
