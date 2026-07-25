import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { ArrowLeft, Phone, CalendarClock, CalendarCheck, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { money, formatDate } from "../lib/format";
import type { StudentDetail as StudentDetailData, PaymentRow } from "../lib/types";
import { Button, Card, Empty, Field, Input, Modal, Spinner, StatusBadge, MethodTag } from "../components/ui";
import { StudentActions } from "../components/StudentActions";

/** Full student profile: start date, next-due, and complete payment history. */
export function StudentDetail() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const params = useParams();
  const id = params.id!;
  const [removeFor, setRemoveFor] = useState<PaymentRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["student-detail", id],
    queryFn: () => api<StudentDetailData>(`/api/students/${id}/detail`),
  });

  if (isLoading || !data) return <Spinner />;
  const { student, billing, payments, discounts, freezes } = data;

  // Days until (or since) the next payment is due.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const due = new Date(billing.nextDueDate + "T00:00:00Z");
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  const dueNote =
    days > 0
      ? t("dueInDays").replace("{n}", String(days))
      : days === 0
        ? t("dueToday")
        : t("overdueByDays").replace("{n}", String(-days));

  const canManage = user.role === "ceo" || user.role === "accountant";

  return (
    <div className="space-y-4">
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-1 text-sm text-tg-link"
      >
        <ArrowLeft size={16} /> {t("back")}
      </button>

      {/* Header */}
      <Card className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{student.fullName}</div>
            <div className="text-sm text-tg-hint">{student.className}</div>
            {student.phone && (
              <div className="mt-1 inline-flex items-center gap-1 text-sm text-tg-hint">
                <Phone size={13} /> {student.phone}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <StatusBadge status={billing.status} />
            {canManage && (
              <StudentActions
                student={{
                  id: student.id,
                  classId: student.classId,
                  fullName: student.fullName,
                  effectiveFee: String(billing.effectiveFee),
                }}
              />
            )}
          </div>
        </div>
        {(discounts.length > 0 || freezes.length > 0) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {discounts.map((d) => (
              <span key={d.id} className="rounded-full bg-status-discount/10 px-2.5 py-0.5 text-xs font-semibold text-status-discount">
                🏷️ {d.discountType === "percentage" ? `${d.discountValue}%` : money(d.discountValue)} off
              </span>
            ))}
            {freezes.map((f) => (
              <span key={f.id} className="rounded-full bg-status-frozen/10 px-2.5 py-0.5 text-xs font-semibold text-status-frozen">
                🔵 {formatDate(f.freezeFrom, locale)} → {f.freezeTo ? formatDate(f.freezeTo, locale) : t("untilLifted")}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Key billing facts */}
      <div className="grid grid-cols-2 gap-3">
        <Info icon={<CalendarCheck size={15} />} label={t("startDate")} value={formatDate(billing.startDate, locale)} />
        <Info icon={<CalendarClock size={15} />} label={t("nextPayment")} value={formatDate(billing.nextDueDate, locale)} sub={dueNote} subDanger={days < 0} />
        <Info label={t("fee")} value={money(billing.effectiveFee, billing.currency)} />
        <Info label={t("paidThrough")} value={billing.paymentsMade > 0 ? formatDate(billing.paidThrough, locale) : "—"} />
        <Info label={t("monthsEnrolled")} value={String(billing.monthsEnrolled)} />
        <Info label={t("paymentsMade")} value={String(billing.paymentsMade)} />
      </div>

      {/* Payment history */}
      <div>
        <div className="mb-2 text-base font-bold">{t("paymentHistory")}</div>
        {payments.length === 0 ? (
          <Empty>{t("noPayments")}</Empty>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => {
              const refunded = Number(p.refundedAmount ?? 0);
              return (
                <Card key={p.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {money(p.amount, billing.currency)}
                      {refunded > 0 && (
                        <span className="text-status-discount"> · −{money(refunded, billing.currency)} {t("refunded")}</span>
                      )}
                    </div>
                    <div className="text-xs text-tg-hint">{formatDate(p.createdAt, locale)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MethodTag method={p.method} />
                    {canManage && (
                      <button
                        className="rounded-lg bg-tg-bg p-1.5 text-status-overdue"
                        title={t("removePayment")}
                        onClick={() => setRemoveFor(p)}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {removeFor && <RemovePaymentModal payment={removeFor} onClose={() => setRemoveFor(null)} />}
    </div>
  );
}

/** Remove an accidental payment: voids it (drops from totals) and hides it. */
function RemovePaymentModal({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const remove = useMutation({
    mutationFn: () =>
      api(`/api/payments/${payment.id}/void`, {
        method: "POST",
        body: { reason: reason || "Accidental entry" },
      }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });

  return (
    <Modal open onClose={onClose} title={`${t("removePayment")} — ${money(payment.amount)}`}>
      <div className="space-y-4">
        <div className="rounded-lg bg-status-overdue/10 px-3 py-2 text-sm text-tg-text">
          {t("removePaymentConfirm")}
        </div>
        <Field label={t("reason")}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Accidental entry" />
        </Field>
        {remove.isError && (
          <div className="text-sm text-status-overdue">{(remove.error as Error).message}</div>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>{t("cancel")}</Button>
          <Button className="flex-1" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {t("remove")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Info({
  icon,
  label,
  value,
  sub,
  subDanger,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  subDanger?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center gap-1.5 text-xs text-tg-hint">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-bold">{value}</div>
      {sub && <div className={`text-xs ${subDanger ? "text-status-overdue" : "text-tg-hint"}`}>{sub}</div>}
    </Card>
  );
}
