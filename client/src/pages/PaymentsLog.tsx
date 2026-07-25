import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { api, downloadCsv } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { money, formatDate } from "../lib/format";
import type { PaymentRow, RefundPreview } from "../lib/types";
import { Button, Card, Empty, Field, Input, Modal, Spinner } from "../components/ui";

/** Payments log. CEO sees all + can void/refund; Accountant sees own entries. */
export function PaymentsLog() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const isCeo = user.role === "ceo";
  const [voidFor, setVoidFor] = useState<PaymentRow | null>(null);
  const [refundFor, setRefundFor] = useState<PaymentRow | null>(null);

  const payments = useQuery({
    queryKey: ["payments", user.role],
    queryFn: () => api<PaymentRow[]>("/api/payments", { query: isCeo ? { scope: "all" } : {} }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("payments")}</h1>
        {isCeo && (
          <Button variant="ghost" onClick={() => downloadCsv("/api/reports/payments.csv", "payments.csv")}>
            <Download size={16} /> {t("exportCsv")}
          </Button>
        )}
      </div>

      {payments.isLoading ? (
        <Spinner />
      ) : payments.data?.length ? (
        <div className="space-y-2">
          {payments.data.map((p) => {
            const refunded = Number(p.refundedAmount);
            const net = Number(p.amount) - refunded;
            const fullyRefunded = refunded > 0 && net <= 0;
            return (
              <Card key={p.id} className={p.voided ? "opacity-50" : ""}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">
                      {p.studentName} {p.voided && <span className="text-status-overdue">(void)</span>}
                    </div>
                    <div className="text-xs text-tg-hint">
                      {p.className} · {formatDate(p.createdAt, locale)} · {t(p.method)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${fullyRefunded ? "line-through text-tg-hint" : ""}`}>
                      {money(p.amount)}
                    </div>
                    {refunded > 0 && !p.voided && (
                      <div className="text-xs text-status-overdue">
                        −{money(refunded)} {t("refunded")} · {t("netAmount")} {money(net)}
                      </div>
                    )}
                    {isCeo && !p.voided && (
                      <div className="flex justify-end gap-2">
                        {net > 0 && (
                          <button className="text-xs text-status-discount" onClick={() => setRefundFor(p)}>
                            {t("refund")}
                          </button>
                        )}
                        <button className="text-xs text-status-overdue" onClick={() => setVoidFor(p)}>
                          {t("void")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty />
      )}

      {voidFor && <VoidModal payment={voidFor} onClose={() => setVoidFor(null)} />}
      {refundFor && <RefundModal payment={refundFor} onClose={() => setRefundFor(null)} />}
    </div>
  );
}

function RefundModal({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  // Pro-rata suggestion from the server (value of the unused part of the month).
  const preview = useQuery({
    queryKey: ["refund-preview", payment.id],
    queryFn: () => api<RefundPreview>(`/api/payments/${payment.id}/refund-preview`),
  });

  // Pre-fill with the suggested pro-rata amount once it loads.
  useEffect(() => {
    if (preview.data && amount === "") setAmount(String(preview.data.suggestedRefund));
  }, [preview.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const doRefund = useMutation({
    mutationFn: () =>
      api(`/api/payments/${payment.id}/refund`, {
        method: "POST",
        body: { amount: Number(amount), reason },
      }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });

  const max = preview.data?.maxRefundable ?? Number(payment.amount);
  const over = Number(amount) > max + 1e-9;

  return (
    <Modal open onClose={onClose} title={`${t("refund")} — ${payment.studentName}`}>
      <div className="space-y-3">
        {preview.isLoading ? (
          <Spinner />
        ) : preview.data ? (
          <div className="space-y-1 rounded-lg bg-status-discount/10 px-3 py-2 text-xs">
            <div className="text-tg-hint">
              {t("coversPeriod")}: {formatDate(preview.data.coverStart, locale)} → {formatDate(preview.data.coverEnd, locale)}
            </div>
            <div className="text-tg-hint">
              {t("suggestedRefund")}: <span className="font-semibold text-tg-text">{money(preview.data.suggestedRefund)}</span>
            </div>
            <div className="text-tg-hint">{t("maxRefundable")}: {money(preview.data.maxRefundable)}</div>
          </div>
        ) : null}
        <Field label={t("refundAmount")}>
          <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <button
          className="text-xs text-tg-link"
          onClick={() => setAmount(String(max))}
        >
          {t("fullRefund")} ({money(max)})
        </button>
        <Field label={t("reason")}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {over && <div className="text-sm text-status-overdue">{t("maxRefundable")}: {money(max)}</div>}
        {doRefund.isError && (
          <div className="text-sm text-status-overdue">{(doRefund.error as Error).message}</div>
        )}
        <Button
          className="w-full"
          disabled={!amount || Number(amount) <= 0 || over || !reason || doRefund.isPending}
          onClick={() => doRefund.mutate()}
        >
          {t("confirm")}
        </Button>
      </div>
    </Modal>
  );
}

function VoidModal({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const doVoid = useMutation({
    mutationFn: () => api(`/api/payments/${payment.id}/void`, { method: "POST", body: { reason } }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });

  return (
    <Modal open onClose={onClose} title={`${t("void")} — ${payment.studentName}`}>
      <div className="space-y-3">
        <div className="text-sm text-tg-hint">{money(payment.amount)} · {t(payment.method)}</div>
        <Field label={t("reason")}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {doVoid.isError && (
          <div className="text-sm text-status-overdue">{(doVoid.error as Error).message}</div>
        )}
        <Button className="w-full" disabled={!reason || doVoid.isPending} onClick={() => doVoid.mutate()}>
          {t("confirm")}
        </Button>
      </div>
    </Modal>
  );
}
