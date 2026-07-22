import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { api, downloadCsv } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { money, formatDate } from "../lib/format";
import type { PaymentRow } from "../lib/types";
import { Button, Card, Empty, Field, Input, Modal, Spinner } from "../components/ui";

/** Payments log. CEO sees all + can void; Accountant sees own entries. */
export function PaymentsLog() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const isCeo = user.role === "ceo";
  const [voidFor, setVoidFor] = useState<PaymentRow | null>(null);

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
          {payments.data.map((p) => (
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
                  <div className="font-bold">{money(p.amount)}</div>
                  {isCeo && !p.voided && (
                    <button className="text-xs text-status-overdue" onClick={() => setVoidFor(p)}>
                      {t("void")}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty />
      )}

      {voidFor && <VoidModal payment={voidFor} onClose={() => setVoidFor(null)} />}
    </div>
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
