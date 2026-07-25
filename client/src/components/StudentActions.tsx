import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Snowflake, Tag, ArrowLeftRight, LogOut, Pencil } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { money } from "../lib/format";
import { monthKey } from "@shared/date";
import type { FreezeRow, DiscountRow, Class, StudentRow } from "../lib/types";
import { Button, Field, Input, Modal, Select } from "./ui";

/** Minimal student shape the freeze/discount actions need. */
type ActionStudent = { id: string; classId: string; fullName: string; effectiveFee: string };

/**
 * Per-student actions available to Accountant and CEO from any active student
 * row: freeze (1B), discount (1C), change group, and stop learning.
 */
export function StudentActions({ student }: { student: ActionStudent }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<null | "edit" | "freeze" | "discount" | "group" | "stop">(null);

  return (
    <>
      <div className="flex gap-1">
        <button
          className="rounded-lg bg-tg-bg p-1.5 text-tg-link"
          title={t("editStudent")}
          onClick={() => setOpen("edit")}
        >
          <Pencil size={16} />
        </button>
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
        <button
          className="rounded-lg bg-tg-bg p-1.5 text-tg-link"
          title={t("changeGroup")}
          onClick={() => setOpen("group")}
        >
          <ArrowLeftRight size={16} />
        </button>
        <button
          className="rounded-lg bg-tg-bg p-1.5 text-status-overdue"
          title={t("stopStudent")}
          onClick={() => setOpen("stop")}
        >
          <LogOut size={16} />
        </button>
      </div>
      {open === "edit" && <EditStudentModal student={student} onClose={() => setOpen(null)} />}
      {open === "freeze" && <FreezeModal student={student} onClose={() => setOpen(null)} />}
      {open === "discount" && <DiscountModal student={student} onClose={() => setOpen(null)} />}
      {open === "group" && <ChangeGroupModal student={student} onClose={() => setOpen(null)} />}
      {open === "stop" && <StopModal student={student} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Edit a student's details, including a mistaken start (enrolment) date. */
function EditStudentModal({ student, onClose }: { student: ActionStudent; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(student.fullName);
  const [phone, setPhone] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [enrolledAt, setEnrolledAt] = useState("");

  // Load the current values (phone / fee / start date aren't on ActionStudent).
  const detail = useQuery({
    queryKey: ["student-row", student.id],
    queryFn: () => api<StudentRow>(`/api/students/${student.id}`),
  });
  useEffect(() => {
    if (!detail.data) return;
    setPhone(detail.data.phone ?? "");
    setMonthlyFee(detail.data.monthlyFee ?? "");
    setEnrolledAt(detail.data.enrolledAt?.slice(0, 10) ?? "");
  }, [detail.data]);

  const save = useMutation({
    mutationFn: () =>
      api(`/api/students/${student.id}`, {
        method: "PATCH",
        body: {
          fullName,
          phone: phone || null,
          monthlyFee: monthlyFee === "" ? null : Number(monthlyFee),
          enrolledAt: enrolledAt || undefined,
        },
      }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });

  return (
    <Modal open onClose={onClose} title={`${t("editStudent")} — ${student.fullName}`}>
      <div className="space-y-3">
        <Field label={t("fullName")}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label={t("phone")}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t("fee")}>
          <Input type="number" inputMode="decimal" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} placeholder={student.effectiveFee} />
        </Field>
        <Field label={t("startDate")}>
          <Input type="date" value={enrolledAt} onChange={(e) => setEnrolledAt(e.target.value)} />
        </Field>
        {save.isError && (
          <div className="text-sm text-status-overdue">{(save.error as Error).message}</div>
        )}
        <Button
          className="w-full"
          disabled={!fullName || save.isPending || detail.isLoading}
          onClick={() => save.mutate()}
        >
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}

/** Move a student to a different group. Past payments stay with the old teacher. */
function ChangeGroupModal({ student, onClose }: { student: ActionStudent; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [classId, setClassId] = useState(student.classId);

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });

  const save = useMutation({
    mutationFn: () =>
      api(`/api/students/${student.id}`, { method: "PATCH", body: { classId } }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });

  return (
    <Modal open onClose={onClose} title={`${t("changeGroup")} — ${student.fullName}`}>
      <div className="space-y-3">
        <div className="rounded-lg bg-tg-secondary-bg px-3 py-2 text-xs text-tg-hint">
          {t("changeGroupNote")}
        </div>
        <Field label={t("groups")}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {(classes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        {save.isError && (
          <div className="text-sm text-status-overdue">{(save.error as Error).message}</div>
        )}
        <Button
          className="w-full"
          disabled={classId === student.classId || save.isPending}
          onClick={() => save.mutate()}
        >
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}

/** Stop a student's education: leaves the group, kept in the archive. */
function StopModal({ student, onClose }: { student: ActionStudent; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const stop = useMutation({
    mutationFn: () => api(`/api/students/${student.id}/stop`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });

  return (
    <Modal open onClose={onClose} title={`${t("stopStudent")} — ${student.fullName}`}>
      <div className="space-y-4">
        <div className="rounded-lg bg-status-overdue/10 px-3 py-2 text-sm text-tg-text">
          {t("stopStudentConfirm")}
        </div>
        {stop.isError && (
          <div className="text-sm text-status-overdue">{(stop.error as Error).message}</div>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>{t("cancel")}</Button>
          <Button className="flex-1" disabled={stop.isPending} onClick={() => stop.mutate()}>
            {t("stopStudent")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function FreezeModal({ student, onClose }: { student: ActionStudent; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const firstOfMonth = monthKey();
  const [freezeFrom, setFreezeFrom] = useState(firstOfMonth);
  const [indefinite, setIndefinite] = useState(true);
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
        body: {
          studentId: student.id,
          groupId: student.classId,
          freezeFrom,
          freezeTo: indefinite ? null : freezeTo,
          reason,
        },
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
                  🔵 {f.freezeFrom} → {f.freezeTo ?? t("untilLifted")} · {f.reason}
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
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} />
              <span className="text-xs text-tg-hint">{t("untilLifted")}</span>
            </label>
            {!indefinite && (
              <Input type="date" className="mt-1" value={freezeTo} onChange={(e) => setFreezeTo(e.target.value)} />
            )}
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
          disabled={!freezeFrom || (!indefinite && !freezeTo) || !reason || create.isPending}
          onClick={() => create.mutate()}
        >
          {t("confirm")}
        </Button>
      </div>
    </Modal>
  );
}

function DiscountModal({ student, onClose }: { student: ActionStudent; onClose: () => void }) {
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
