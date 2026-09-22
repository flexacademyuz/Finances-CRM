import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { ArrowLeft, Phone, CalendarClock, CalendarCheck, Trash2, MessageSquare } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { can } from "@shared/permissions";
import { money, formatDate } from "../lib/format";
import type {
  StudentDetail as StudentDetailData,
  PaymentRow,
  SmsMessage,
  SmsTemplate,
  SmsSendResult,
} from "../lib/types";
import { Button, Card, Empty, Field, Input, Modal, Spinner, StatusBadge, MethodTag } from "../components/ui";
import { StudentActions } from "../components/StudentActions";

/** Full student profile: start date, next-due, and complete payment history. */
export function StudentDetail() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const params = useParams();
  const id = params.id!;
  const [removeFor, setRemoveFor] = useState<PaymentRow | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["student-detail", id],
    queryFn: () => api<StudentDetailData>(`/api/students/${id}/detail`),
  });

  // Parent SMS is a finance-staff feature.
  const canSms = user.role === "ceo" || user.role === "accountant";
  const smsHistory = useQuery({
    queryKey: ["student-sms", id],
    queryFn: () => api<SmsMessage[]>(`/api/sms/student/${id}`),
    enabled: canSms,
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

  const canEdit = can(user, "edit_student");
  const canDiscount = can(user, "manage_discounts");
  const canDelete = can(user, "delete_student");
  // Voiding (removing) a recorded payment is a correction reserved for the
  // CEO/Accountant; teachers record and view but don't undo payments.
  const canVoidPayment = user.role === "ceo" || user.role === "accountant";
  // Show the actions cluster if the user can do at least one of them.
  const canManage = canEdit || canDiscount || canDelete;

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
            <StatusBadge status={billing.status} balance={billing.balance} />
            {canManage && (
              <StudentActions
                student={{
                  id: student.id,
                  classId: student.classId,
                  fullName: student.fullName,
                  effectiveFee: String(billing.effectiveFee),
                }}
                canEdit={canEdit}
                canDiscount={canDiscount}
                canDelete={canDelete}
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

      {/* Outstanding balance — a partial payment leaves charges to complete. */}
      {billing.balance > 0 && (
        <Card className="border-status-overdue/30 bg-status-overdue/10">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-status-overdue">
                {t("balanceDue")}
              </div>
              <div className="text-xs text-tg-hint">{t("remainingToComplete")}</div>
            </div>
            <div className="text-lg font-bold text-status-overdue">
              {money(billing.balance, billing.currency)}
            </div>
          </div>
        </Card>
      )}

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
              const due = p.amountDue == null ? null : Number(p.amountDue);
              const partial = due != null && Number(p.amount) + 1e-6 < due;
              return (
                <Card key={p.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {money(p.amount, billing.currency)}
                      {partial && (
                        <span className="text-tg-hint"> {t("ofDue")} {money(due!, billing.currency)}</span>
                      )}
                      {refunded > 0 && (
                        <span className="text-status-discount"> · −{money(refunded, billing.currency)} {t("refunded")}</span>
                      )}
                    </div>
                    <div className="text-xs text-tg-hint">
                      {formatDate(p.createdAt, locale)}
                      {partial && (
                        <span className="text-status-overdue">
                          {" · "}
                          {t("partiallyPaid")} · {money(due! - Number(p.amount), billing.currency)} {t("balanceRemaining")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MethodTag method={p.method} />
                    {canVoidPayment && (
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

      {/* Parent SMS (finance staff only) */}
      {canSms && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-base font-bold">{t("smsHistory")}</div>
            <Button
              variant="ghost"
              disabled={!student.phone}
              onClick={() => setSmsOpen(true)}
            >
              <span className="inline-flex items-center gap-1">
                <MessageSquare size={15} /> {t("sendSms")}
              </span>
            </Button>
          </div>
          <Card className="space-y-2">
            <div className="text-sm text-tg-hint">
              {student.phone ? (
                <span className="inline-flex items-center gap-1">
                  <Phone size={13} /> {student.phone}
                  {student.smsOptOut && (
                    <span className="text-status-overdue"> · {t("parentOptedOut")}</span>
                  )}
                </span>
              ) : (
                t("noParentPhone")
              )}
            </div>
            {(smsHistory.data ?? []).length === 0 ? (
              <div className="text-sm text-tg-hint">{t("noSmsYet")}</div>
            ) : (
              <div className="space-y-2">
                {smsHistory.data!.map((m) => (
                  <div key={m.id} className="rounded-btn bg-tg-bg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-tg-hint">{formatDate(m.createdAt, locale)}</span>
                      <span className={`text-xs font-semibold ${smsStatusColor(m.status)}`}>
                        {m.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm">{m.body}</div>
                    {m.error && <div className="mt-0.5 text-xs text-status-overdue">{m.error}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {removeFor && <RemovePaymentModal payment={removeFor} onClose={() => setRemoveFor(null)} />}
      {smsOpen && (
        <SendSmsModal
          studentId={student.id}
          studentName={student.fullName}
          phone={student.phone}
          optedOut={student.smsOptOut}
          onClose={() => setSmsOpen(false)}
        />
      )}
    </div>
  );
}

function smsStatusColor(status: string): string {
  switch (status) {
    case "sent":
      return "text-status-paid";
    case "failed":
      return "text-status-overdue";
    case "skipped":
      return "text-tg-hint";
    default:
      return "text-status-awaiting";
  }
}

/** Placeholders in a template look like [ism] or {name} — pull the unique ones. */
function findPlaceholders(text: string): string[] {
  const found = text.match(/\[[^\]]+\]|\{[^}]+\}/g) ?? [];
  return Array.from(new Set(found));
}

/** Guess which placeholder is the student's name, to pre-fill it. */
function looksLikeName(token: string): boolean {
  return /ism|name|farzand|o'quvchi|student/i.test(token);
}

/**
 * Send a manual SMS to a student's parent. Because Eskiz only delivers approved
 * wording, the operator picks one of the account's templates; any [placeholders]
 * in it become inputs (the name one is pre-filled), and the assembled text is
 * sent as-is.
 */
function SendSmsModal({
  studentId,
  studentName,
  phone,
  optedOut,
  onClose,
}: {
  studentId: string;
  studentName: string;
  phone: string | null;
  optedOut: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [fills, setFills] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SmsSendResult | null>(null);

  const templates = useQuery({
    queryKey: ["sms-templates"],
    queryFn: () => api<SmsTemplate[]>("/api/sms/templates"),
  });

  const selected = templates.data?.find((tpl) => tpl.id === selectedId) ?? null;
  const placeholders = selected ? findPlaceholders(selected.text) : [];
  const finalText = selected
    ? placeholders.reduce((s, p) => s.split(p).join(fills[p] ?? p), selected.text)
    : "";
  const ready = Boolean(selected) && placeholders.every((p) => (fills[p] ?? "").trim().length > 0);

  const choose = (tpl: SmsTemplate) => {
    setSelectedId(tpl.id);
    setResult(null);
    // Pre-fill a name-like placeholder with the student's first name.
    const first = studentName.trim().split(/\s+/)[0] ?? studentName;
    const seed: Record<string, string> = {};
    for (const p of findPlaceholders(tpl.text)) if (looksLikeName(p)) seed[p] = first;
    setFills(seed);
  };

  const send = useMutation({
    mutationFn: () =>
      api<SmsSendResult>(`/api/sms/student/${studentId}`, {
        method: "POST",
        body: { text: finalText },
      }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["student-sms", studentId] });
    },
  });

  return (
    <Modal open onClose={onClose} title={`${t("sendSms")} — ${studentName}`}>
      <div className="space-y-3">
        <div className="text-sm text-tg-hint">
          {phone}
          {optedOut && <span className="text-status-overdue"> · {t("parentOptedOut")}</span>}
        </div>

        {templates.isLoading && <div className="text-sm text-tg-hint">Loading templates…</div>}
        {templates.data && templates.data.length === 0 && (
          <div className="rounded-btn bg-status-awaiting/10 px-3 py-2 text-sm">
            No approved templates found. Add and get a message approved in Eskiz first.
          </div>
        )}

        {/* Template picker */}
        <div className="space-y-2">
          {(templates.data ?? []).map((tpl) => {
            const approved = tpl.status === "service" || tpl.status === "reklama";
            const active = tpl.id === selectedId;
            return (
              <button
                key={tpl.id}
                onClick={() => choose(tpl)}
                className={`w-full rounded-btn border px-3 py-2 text-left text-sm transition ${
                  active ? "border-primary bg-primary-soft" : "border-border hover:border-primary"
                }`}
              >
                <div>{tpl.text}</div>
                <div className={`mt-0.5 text-xs ${approved ? "text-status-paid" : "text-status-awaiting"}`}>
                  {approved ? "approved" : `status: ${tpl.status}`}
                </div>
              </button>
            );
          })}
        </div>

        {/* Fill placeholders */}
        {placeholders.map((p) => (
          <Field key={p} label={p}>
            <Input
              value={fills[p] ?? ""}
              onChange={(e) => setFills((f) => ({ ...f, [p]: e.target.value }))}
            />
          </Field>
        ))}

        {selected && (
          <div className="rounded-btn bg-tg-bg px-3 py-2 text-sm">
            <div className="mb-1 text-xs text-tg-hint">Preview</div>
            {finalText}
          </div>
        )}

        {send.isError && (
          <div className="text-sm text-status-overdue">{(send.error as Error).message}</div>
        )}
        {result && (
          <div
            className={`rounded-btn px-3 py-2 text-sm ${
              result.ok ? "bg-status-paid/10 text-status-paid" : "bg-status-overdue/10 text-status-overdue"
            }`}
          >
            {result.status === "sent"
              ? `✅ Sent to ${result.to}`
              : result.status === "logged"
                ? `Logged (dry-run) for ${result.to} — not actually sent`
                : `❌ Failed: ${result.error ?? "error"}`}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button className="flex-1" disabled={!ready || send.isPending} onClick={() => send.mutate()}>
            {t("sendSms")}
          </Button>
        </div>
      </div>
    </Modal>
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
