import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Wallet, ClipboardList, Coins, Banknote } from "lucide-react";
import { api, downloadCsv } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { money, moneyShort, formatDate, initials, avatarColor } from "../lib/format";
import type { PaymentRow, RefundPreview } from "../lib/types";
import { Button, Card, Empty, Field, Input, Modal, Spinner, StatTile, MethodTag } from "../components/ui";

/** Payments log. CEO sees all + can void/refund; Accountant sees own entries. */
export function PaymentsLog() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const isCeo = user.role === "ceo";
  // Teachers get a read-only view of their own students' payments; corrections
  // (void/refund) stay with the CEO/Accountant.
  const canVoid = user.role === "ceo" || user.role === "accountant";
  const [voidFor, setVoidFor] = useState<PaymentRow | null>(null);
  const [refundFor, setRefundFor] = useState<PaymentRow | null>(null);

  const payments = useQuery({
    queryKey: ["payments", user.role],
    queryFn: () => api<PaymentRow[]>("/api/payments", { query: isCeo ? { scope: "all" } : {} }),
  });

  const rows = payments.data ?? [];
  const live = rows.filter((p) => !p.voided);
  const net = (p: PaymentRow) => Number(p.amount) - Number(p.refundedAmount);
  const totalCollected = live.reduce((s, p) => s + net(p), 0);
  const cashTotal = live.filter((p) => p.method === "cash").reduce((s, p) => s + net(p), 0);
  const onlineTotal = live.filter((p) => p.method === "online").reduce((s, p) => s + net(p), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t("payments")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("paymentsSubtitle")}</p>
        </div>
        {isCeo && (
          <Button variant="ghost" onClick={() => downloadCsv("/api/reports/payments.csv", "payments.csv")}>
            <Download size={16} /> {t("exportCsv")}
          </Button>
        )}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile tint="blue" label={t("totalCollected")} value={moneyShort(totalCollected)} icon={<Wallet size={18} />} sub={t("netAmount")} />
        <StatTile tint="violet" label={t("transactions")} value={live.length} icon={<ClipboardList size={18} />} />
        <StatTile tint="green" label={t("cash")} value={moneyShort(cashTotal)} icon={<Coins size={18} />} />
        <StatTile tint="amber" label={t("online")} value={moneyShort(onlineTotal)} icon={<Banknote size={18} />} />
      </div>

      {payments.isLoading ? (
        <Spinner />
      ) : rows.length ? (
        <div className="space-y-2">
          {rows.map((p) => {
            const refunded = Number(p.refundedAmount);
            const nt = Number(p.amount) - refunded;
            const fullyRefunded = refunded > 0 && nt <= 0;
            const accent = p.voided ? "#7a8699" : fullyRefunded ? "#e23744" : "#12b76a";
            return (
              <div
                key={p.id}
                className={`relative flex items-center gap-3 overflow-hidden rounded-card bg-surface p-3 pl-4 shadow-card ring-1 ring-dark/[0.04] transition hover:shadow-card-hover ${p.voided ? "opacity-60" : ""}`}
              >
                <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: accent }} />
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: avatarColor(p.studentName) }}>
                  {initials(p.studentName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {p.studentName} {p.voided && <span className="text-xs text-status-overdue">({t("void")})</span>}
                  </div>
                  <div className="truncate text-xs text-muted">{p.className} · {formatDate(p.createdAt, locale)}</div>
                </div>
                <div className="hidden w-20 shrink-0 sm:block"><MethodTag method={p.method} /></div>
                <div className="shrink-0 text-right">
                  <div className={`figure font-bold ${fullyRefunded ? "text-tg-hint line-through" : ""}`}>{money(p.amount)}</div>
                  {refunded > 0 && !p.voided && (
                    <div className="text-[11px] text-status-overdue">−{money(refunded)} · {t("netAmount")} {money(nt)}</div>
                  )}
                  {!p.voided && canVoid && (
                    <div className="mt-0.5 flex justify-end gap-2">
                      {isCeo && nt > 0 && (
                        <button className="text-xs font-semibold text-status-discount" onClick={() => setRefundFor(p)}>{t("refund")}</button>
                      )}
                      <button className="text-xs font-semibold text-status-overdue" onClick={() => setVoidFor(p)}>{t("void")}</button>
                    </div>
                  )}
                </div>
              </div>
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
