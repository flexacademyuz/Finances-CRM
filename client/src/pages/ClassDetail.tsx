import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Plus, Check, Minus, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { can } from "@shared/permissions";
import { haptic } from "../lib/telegram";
import { money } from "../lib/format";
import type { ClassLedger, PaymentRow } from "../lib/types";
import type { PaymentMethod } from "@shared/schema";
import { Button, Card, Empty, Field, Input, Modal, Segmented, Spinner, StatusBadge } from "../components/ui";

/** A grid cell the CEO/accountant tapped, to mark a month paid or unpaid. */
type CellTarget = {
  studentId: string;
  fullName: string;
  effectiveFee: string;
  month: string;
  label: string;
  state: "paid" | "unpaid" | "frozen";
};

/**
 * Class "folder" detail: the class's students and a monthly payment table
 * (which months each student has paid / is frozen / unpaid). Everyone sees it;
 * teachers only for their own classes (enforced server-side).
 */
export function ClassDetail() {
  const { t } = useI18n();
  const { user } = useSession();
  const params = useParams();
  const classId = params.id!;
  const [adding, setAdding] = useState(false);
  const [cell, setCell] = useState<CellTarget | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["class-ledger", classId],
    queryFn: () => api<ClassLedger>(`/api/classes/${classId}/ledger`),
  });

  const canManage = can(user, "add_student");
  // Tick a month paid/unpaid straight from the grid (records or voids a payment).
  const canRecord = can(user, "record_payment");

  if (isLoading || !data) return <Spinner />;
  const { class: cls, months, students } = data;

  const backHref = user.role === "accountant" ? "/groups" : user.role === "teacher" ? "/" : "/classes";

  return (
    <div className="space-y-4">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-tg-link">
        <ArrowLeft size={16} /> {t("groups")}
      </Link>

      <Card>
        <div className="text-lg font-bold">{cls.name}</div>
        <div className="mt-1 text-sm text-tg-hint">
          {cls.teacherName ? `${t("teacher")}: ${cls.teacherName}` : ""}
          {cls.room ? ` · ${cls.room}` : ""}
          {cls.schedule ? ` · ${cls.schedule}` : ""}
        </div>
        <div className="mt-1 text-sm text-tg-hint">
          {t("fee")}: {money(cls.defaultFee)}
          {cls.maxStudents ? ` · ${students.length}/${cls.maxStudents}` : ` · ${students.length}`}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">{t("students")}</h2>
        {canManage && (
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} /> {t("add")}
          </Button>
        )}
      </div>

      {students.length === 0 ? (
        <Empty />
      ) : (
        <>
          {/* Monthly payment table (from September). Cells are tickable: tap an
              unpaid month to record a payment, or a paid one to unmark it.
              Desktop only — on a narrow (Telegram) viewport this becomes a tiny
              horizontal-scroll window, so the mobile view below uses chips. */}
          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="text-xs text-tg-hint">
                  <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold">
                    {t("student")}
                  </th>
                  {months.map((m) => (
                    <th key={m.key} className="px-2 py-2 text-center font-semibold">
                      {m.label.split(" ")[0].slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium">{s.fullName}</td>
                    {months.map((m) => {
                      const state = s.monthly[m.key];
                      const tickable = canRecord && state !== "frozen";
                      return (
                        <td key={m.key} className="px-2 py-2 text-center">
                          {tickable ? (
                            <button
                              type="button"
                              aria-label={`${s.fullName} — ${m.label}`}
                              onClick={() =>
                                setCell({
                                  studentId: s.id,
                                  fullName: s.fullName,
                                  effectiveFee: s.effectiveFee,
                                  month: m.key,
                                  label: m.label,
                                  state,
                                })
                              }
                              className="transition hover:scale-110"
                            >
                              <PaidCell state={state} />
                            </button>
                          ) : (
                            <PaidCell state={state} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile: the wide table can't fit a Telegram mini-app's narrow
              viewport (it collapses to a tiny scroll window where the months are
              hidden), so each student gets a card with their months as wrapping,
              tappable chips — every month visible at once. */}
          <div className="space-y-2 md:hidden">
            {students.map((s) => (
              <Card key={s.id} className="p-3">
                <div className="mb-2 truncate text-sm font-semibold">{s.fullName}</div>
                <div className="flex flex-wrap gap-1.5">
                  {months.map((m) => {
                    const state = s.monthly[m.key];
                    const tickable = canRecord && state !== "frozen";
                    const chip = <MonthChip label={m.label} state={state} />;
                    return tickable ? (
                      <button
                        key={m.key}
                        type="button"
                        aria-label={`${s.fullName} — ${m.label}`}
                        onClick={() =>
                          setCell({
                            studentId: s.id,
                            fullName: s.fullName,
                            effectiveFee: s.effectiveFee,
                            month: m.key,
                            label: m.label,
                            state,
                          })
                        }
                        className="transition active:scale-95"
                      >
                        {chip}
                      </button>
                    ) : (
                      <span key={m.key}>{chip}</span>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>

          {/* Roster — the row opens the student profile, where actions live. */}
          <div className="space-y-2">
            {students.map((s) => (
              <Card key={s.id} className="p-0">
                <Link href={`/student/${s.id}`} className="flex min-w-0 items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-tg-link">{s.fullName}</div>
                    <div className="truncate text-xs text-tg-hint">
                      {money(s.effectiveFee)}
                      {s.phone ? ` · ${s.phone}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                  <ChevronRight size={18} className="shrink-0 text-tg-hint" />
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}

      {cell && (
        <CellModal
          target={cell}
          onClose={() => setCell(null)}
          onSaved={() => { setCell(null); qc.invalidateQueries({ queryKey: ["class-ledger", classId] }); }}
        />
      )}

      {adding && (
        <AddStudentModal
          classId={cls.id}
          className={cls.name}
          defaultFee={cls.defaultFee}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["class-ledger", classId] }); }}
        />
      )}
    </div>
  );
}

/** Mobile month chip — a labeled pill (month + paid/unpaid/frozen) that wraps to
 *  fit any width, so all months stay visible on a narrow Telegram viewport. */
function MonthChip({ label, state }: { label: string; state: "paid" | "unpaid" | "frozen" }) {
  const mon = label.split(" ")[0].slice(0, 3);
  const cls =
    state === "paid"
      ? "bg-status-paid/12 text-status-paid ring-status-paid/30"
      : state === "frozen"
        ? "bg-status-frozen/12 text-status-frozen ring-status-frozen/30"
        : "bg-bg text-muted ring-border";
  return (
    <span className={`inline-flex min-w-[3.25rem] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {mon}
      {state === "paid" ? <Check size={12} /> : state === "frozen" ? <span className="text-[10px] leading-none">🔵</span> : <Minus size={12} />}
    </span>
  );
}

function PaidCell({ state }: { state: "paid" | "unpaid" | "frozen" }) {
  if (state === "paid")
    return (
      <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-status-paid/15 text-status-paid">
        <Check size={14} />
      </span>
    );
  if (state === "frozen")
    return (
      <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-status-frozen/15 text-status-frozen">
        🔵
      </span>
    );
  return (
    <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-tg-bg text-tg-hint">
      <Minus size={14} />
    </span>
  );
}

/**
 * Tapping a grid cell: an unpaid month opens a quick record-payment form
 * (amount pre-filled with the student's fee); a paid month offers to unmark it,
 * which voids that month's payment.
 */
function CellModal({
  target,
  onClose,
  onSaved,
}: {
  target: CellTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState(String(Number(target.effectiveFee) || ""));
  const [method, setMethod] = useState<PaymentMethod>("cash");

  const record = useMutation({
    mutationFn: () =>
      api("/api/payments", {
        method: "POST",
        body: { studentId: target.studentId, amount: Number(amount), method, billingMonth: target.month },
      }),
    onSuccess: () => { haptic("success"); onSaved(); },
    onError: () => haptic("error"),
  });

  // For a paid cell we need the payment id to void it.
  const paidQ = useQuery({
    queryKey: ["cell-payment", target.studentId, target.month],
    queryFn: () =>
      api<PaymentRow[]>("/api/payments", {
        query: { studentId: target.studentId, billingMonth: target.month, scope: "all" },
      }),
    enabled: target.state === "paid",
  });
  const active = paidQ.data?.find((p) => !p.voided);

  const unmark = useMutation({
    mutationFn: () =>
      api(`/api/payments/${active!.id}/void`, { method: "POST", body: { reason: "Unmarked from class grid" } }),
    onSuccess: () => { haptic("success"); onSaved(); },
    onError: () => haptic("error"),
  });

  return (
    <Modal open onClose={onClose} title={`${target.fullName} — ${target.label}`}>
      {target.state === "paid" ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-status-overdue/10 px-3 py-2 text-sm text-tg-text">
            {t("markUnpaidConfirm")}
          </div>
          {active && <div className="text-sm text-tg-hint">{money(active.amount)} · {t(active.method)}</div>}
          {unmark.isError && (
            <div className="text-sm text-status-overdue">{(unmark.error as Error).message}</div>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>{t("cancel")}</Button>
            <Button
              className="flex-1"
              disabled={paidQ.isLoading || !active || unmark.isPending}
              onClick={() => unmark.mutate()}
            >
              {t("markUnpaid")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-tg-text">{t("markPaidNote")}</div>
          <Field label={t("amount")}>
            <Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label={t("method")}>
            <Segmented
              full
              value={method}
              onChange={setMethod}
              options={[
                { value: "cash", label: t("cash") },
                { value: "online", label: t("online") },
              ]}
            />
          </Field>
          {record.isError && (
            <div className="text-sm text-status-overdue">{(record.error as Error).message}</div>
          )}
          <Button
            className="w-full"
            disabled={!Number(amount) || record.isPending}
            onClick={() => record.mutate()}
          >
            {t("markPaid")}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function AddStudentModal({
  classId,
  className,
  defaultFee,
  onClose,
  onSaved,
}: {
  classId: string;
  className: string;
  defaultFee: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [markPaid, setMarkPaid] = useState(false);
  const [payMethod, setPayMethod] = useState<"cash" | "online">("cash");

  const payAmount = Number(monthlyFee) || Number(defaultFee) || 0;

  const create = useMutation({
    mutationFn: async () => {
      const student = await api<{ id: string }>("/api/students", {
        method: "POST",
        body: {
          fullName,
          phone: phone || undefined,
          classId,
          monthlyFee: monthlyFee ? Number(monthlyFee) : undefined,
          enrolledAt: startDate || undefined,
        },
      });
      if (markPaid && payAmount > 0) {
        await api("/api/payments", {
          method: "POST",
          body: { studentId: student.id, amount: payAmount, method: payMethod },
        });
      }
      return student;
    },
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={`${t("add")} ${t("student")} — ${className}`}>
      <div className="space-y-3">
        <Field label={t("fullName")}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label={t("phone")}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t("startDate")}>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label={`${t("fee")} (optional)`}>
          <Input type="number" placeholder="class default" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
          {t("markFirstPaid")}
        </label>
        {markPaid && (
          <div className="rounded-btn border border-border p-3">
            <div className="mb-2 text-sm text-tg-hint">
              {t("amount")}: <span className="figure font-semibold text-tg-text">{payAmount.toLocaleString()} UZS</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["cash", "online"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`btn ${payMethod === m ? "btn-primary" : "btn-ghost"}`}
                >
                  {t(m)}
                </button>
              ))}
            </div>
          </div>
        )}

        {create.isError && (
          <div className="text-sm text-status-overdue">{(create.error as Error).message}</div>
        )}
        <Button className="w-full" disabled={!fullName || create.isPending} onClick={() => create.mutate()}>
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}
