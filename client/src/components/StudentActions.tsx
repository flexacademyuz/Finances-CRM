import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Snowflake, Tag } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { money } from "../lib/format";
import { monthKey } from "@shared/date";
import type { StudentRow, FreezeRow, DiscountRow } from "../lib/types";
import { Button, Field, Input, Modal, Select } from "./ui";

/**
 * Freeze / discount actions for a single student (V2 1B, 1C). Available to
 * Accountant and CEO from any student row.
 */
export function StudentActions({ student }: { student: StudentRow }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<null | "freeze" | "discount">(null);

  return (
    <>
      <div className="flex gap-1">
        <button
          className="rounded-lg bg-tg-bg p-1.5 text-status-frozen"
          title={t("freezePayment")}
          onClick={() => setOpen("freeze")}
        >
          <Snowflake size={16} />
        </button>
        <button
          className="rounded-lg bg-tg-bg p-1.5 text-status-discount"
          title={t("addDiscount")}
          onClick={() => setOpen("discount")}
        >
          <Tag size={16} />
        </button>
      </div>
      {open === "freeze" && <FreezeModal student={student} onClose={() => setOpen(null)} />}
      {open === "discount" && <DiscountModal student={student} onClose={() => setOpen(null)} />}
    </>
  );
}

function FreezeModal({ student, onClose }: { student: StudentRow; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const firstOfMonth = monthKey();
  const [freezeFrom, setFreezeFrom] = useState(firstOfMonth);
  const [freezeTo, setFreezeTo] = useState("");
  const [reason, setReason] = useState("");

  const freezes = useQuery({
    queryKey: ["freezes", student.id],
    queryFn: () => api<FreezeRow[]>(`/api/freezes/student/${student.id}`),
  });

  const create = useMutation({
    mutationFn: () =>
      api("/api/freezes", {
        method: "POST",
        body: { studentId: student.id, groupId: student.classId, freezeFrom, freezeTo, reason },
      }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });
  const lift = useMutation({
    mutationFn: (id: string) => api(`/api/freezes/${id}/lift`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["freezes", student.id] }),
  });

  const active = freezes.data?.filter((f) => f.status === "active") ?? [];

  return (
    <Modal open onClose={onClose} title={`${t("freezePayment")} — ${student.fullName}`}>
      <div className="space-y-3">
        {active.length > 0 && (
          <div className="space-y-1 rounded-lg bg-status-frozen/10 p-2 text-xs">
            {active.map((f) => (
              <div key={f.id} className="flex items-center justify-between">
                <span className="text-status-frozen">
                  🔵 {f.freezeFrom} → {f.freezeTo} · {f.reason}
                </span>
                <button className="text-tg-link" onClick={() => lift.mutate(f.id)}>
                  {t("liftFreeze")}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("freezeFrom")}>
            <Input type="date" value={freezeFrom} onChange={(e) => setFreezeFrom(e.target.value)} />
          </Field>
          <Field label={t("freezeUntil")}>
            <Input type="date" value={freezeTo} onChange={(e) => setFreezeTo(e.target.value)} />
          </Field>
        </div>
        <Field label={t("reason")}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Medical leave, travelling…" />
        </Field>
        {create.isError && (
          <div className="text-sm text-status-overdue">{(create.error as Error).message}</div>
        )}
        <Button
          className="w-full"
          disabled={!freezeFrom || !freezeTo || !reason || create.isPending}
          onClick={() => create.mutate()}
        >
          {t("confirm")}
        </Button>
      </div>
    </Modal>
  );
}

function DiscountModal({ student, onClose }: { student: StudentRow; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [validFrom, setValidFrom] = useState(monthKey().slice(0, 7));
  const [indefinite, setIndefinite] = useState(true);
  const [validTo, setValidTo] = useState("");
  const [reason, setReason] = useState("");

  const discounts = useQuery({
    queryKey: ["discounts", student.id],
    queryFn: () => api<DiscountRow[]>(`/api/discounts/student/${student.id}`),
  });

  const create = useMutation({
    mutationFn: () =>
      api("/api/discounts", {
        method: "POST",
        body: {
          studentId: student.id,
          groupId: student.classId,
          discountType,
          discountValue: Number(discountValue),
          validFrom,
          validTo: indefinite ? null : validTo,
          reason,
        },
      }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/discounts/${id}`, { method: "PATCH", body: { isActive: false } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discounts", student.id] }),
  });

  const fee = Number(student.effectiveFee);
  const preview =
    discountValue && fee
      ? discountType === "percentage"
        ? fee * (1 - Math.min(Number(discountValue), 100) / 100)
        : Math.max(fee - Number(discountValue), 0)
      : null;

  const activeDiscounts = discounts.data?.filter((d) => d.isActive) ?? [];

  return (
    <Modal open onClose={onClose} title={`${t("addDiscount")} — ${student.fullName}`}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto">
        {activeDiscounts.length > 0 && (
          <div className="space-y-1 rounded-lg bg-status-discount/10 p-2 text-xs">
            {activeDiscounts.map((d) => (
              <div key={d.id} className="flex items-center justify-between">
                <span className="text-status-discount">
                  🏷️ {d.discountType === "percentage" ? `${d.discountValue}%` : money(d.discountValue)} · {d.reason}
                </span>
                <button className="text-tg-link" onClick={() => remove.mutate(d.id)}>
                  {t("remove")}
                </button>
              </div>
            ))}
          </div>
        )}
        <div>
          <span className="label">{t("discountType")}</span>
          <div className="grid grid-cols-2 gap-2">
            {(["percentage", "fixed"] as const).map((ty) => (
              <button
                key={ty}
                onClick={() => setDiscountType(ty)}
                className={`btn ${discountType === ty ? "btn-primary" : "btn-ghost"}`}
              >
                {ty === "percentage" ? "%" : "UZS"}
              </button>
            ))}
          </div>
        </div>
        <Field label={t("value")}>
          <Input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
        </Field>
        {preview != null && (
          <div className="rounded-lg bg-tg-secondary-bg px-3 py-2 text-xs text-tg-hint">
            {t("afterDiscount")}: <span className="font-semibold text-tg-text">{money(preview)}</span>{" "}
            ({t("fullTuition")} {money(fee)})
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("validFrom")}>
            <Input type="month" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </Field>
          <Field label={t("validUntil")}>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} />
              <span className="text-xs text-tg-hint">{t("indefinite")}</span>
            </div>
            {!indefinite && (
              <Input type="month" className="mt-1" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            )}
          </Field>
        </div>
        <Field label={t("reason")}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {create.isError && (
          <div className="text-sm text-status-overdue">{(create.error as Error).message}</div>
        )}
        <Button
          className="w-full"
          disabled={!discountValue || !reason || (!indefinite && !validTo) || create.isPending}
          onClick={() => create.mutate()}
        >
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}
