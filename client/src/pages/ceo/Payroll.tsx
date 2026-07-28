import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HandCoins, BadgeDollarSign } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { haptic } from "../../lib/telegram";
import { money } from "../../lib/format";
import type { PayrollData } from "../../lib/types";
import type { PaymentMethod } from "@shared/schema";
import { Button, Card, Empty, Field, Input, Modal, Segmented, Spinner, Stat } from "../../components/ui";

type TeacherRow = PayrollData["teachers"][number];

/**
 * Payroll hub (V17): every teacher's live salary cycle — earned since their last
 * payment, minus open advances, giving the net owed. The CEO can hand out an
 * advance or record a salary payment (which settles the cycle) from here.
 */
export function PayrollPage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["payroll"],
    queryFn: () => api<PayrollData>("/api/salary/payroll"),
  });
  const [advanceFor, setAdvanceFor] = useState<TeacherRow | null>(null);
  const [payFor, setPayFor] = useState<TeacherRow | null>(null);

  if (isLoading || !data) return <Spinner />;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t("payroll")}</h1>
      <Stat label={t("payrollObligation")} value={money(data.total)} accent="primary" />

      {data.teachers.length ? (
        <div className="space-y-2">
          {data.teachers.map((tr) => (
            <Card key={tr.teacherId} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{tr.name}</div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wide text-muted">{t("netOwed")}</div>
                  <div className="figure font-bold">{money(tr.netOwed)}</div>
                </div>
              </div>
              <div className="text-xs text-muted">
                {t("earned")}: {money(tr.earned)}
                {tr.advancesTotal > 0 && <> · {t("advances")}: −{money(tr.advancesTotal)}</>}
                {" · "}
                {t(tr.salaryModel)}
                {tr.salaryModel === "percentage" ? ` (${tr.salaryValue}%)` : ` (${money(tr.salaryValue)})`}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setAdvanceFor(tr)}>
                  <HandCoins size={16} /> {t("advance")}
                </Button>
                <Button
                  className="flex-1"
                  disabled={tr.earned <= 0 && tr.advancesTotal <= 0}
                  onClick={() => setPayFor(tr)}
                >
                  <BadgeDollarSign size={16} /> {t("paySalary")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty />
      )}

      {advanceFor && <AdvanceModal teacher={advanceFor} onClose={() => setAdvanceFor(null)} />}
      {payFor && <PayModal teacher={payFor} onClose={() => setPayFor(null)} />}
    </div>
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

/** Hand a teacher money against future salary. */
function AdvanceModal({ teacher, onClose }: { teacher: TeacherRow; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");

  const give = useMutation({
    mutationFn: () =>
      api("/api/advances", {
        method: "POST",
        body: { teacherId: teacher.teacherId, amount: Number(amount), method, note: note || undefined },
      }),
    onSuccess: () => {
      haptic("success");
      qc.invalidateQueries();
      onClose();
    },
    onError: () => haptic("error"),
  });

  return (
    <Modal open onClose={onClose} title={`${t("advanceToTeacher")} — ${teacher.name}`}>
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

/** Record a salary payment, which settles the current cycle. */
function PayModal({ teacher, onClose }: { teacher: TeacherRow; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const suggested = Math.max(0, teacher.netOwed);
  const [amount, setAmount] = useState(String(suggested));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");

  const pay = useMutation({
    mutationFn: () =>
      api("/api/salary/payout", {
        method: "POST",
        body: { teacherId: teacher.teacherId, amount: Number(amount), method, note: note || undefined },
      }),
    onSuccess: () => {
      haptic("success");
      qc.invalidateQueries();
      onClose();
    },
    onError: () => haptic("error"),
  });

  return (
    <Modal open onClose={onClose} title={`${t("recordSalaryPayment")} — ${teacher.name}`}>
      <div className="space-y-3">
        <div className="rounded-btn border border-border bg-bg p-3 text-sm">
          <Row label={t("earnedThisCycle")} value={money(teacher.earned)} />
          {teacher.advancesTotal > 0 && (
            <Row label={t("advancesDeducted")} value={`−${money(teacher.advancesTotal)}`} />
          )}
          <div className="mt-1 border-t border-border pt-1">
            <Row label={t("netOwed")} value={money(suggested)} bold />
          </div>
        </div>
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

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-bold" : "text-muted"}`}>
      <span>{label}</span>
      <span className={bold ? "figure" : "figure text-text"}>{value}</span>
    </div>
  );
}
