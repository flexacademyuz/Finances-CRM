import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Plus, Check, Minus, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { can } from "@shared/permissions";
import { money } from "../lib/format";
import type { ClassLedger } from "../lib/types";
import { Button, Card, Empty, Field, Input, Modal, Spinner, StatusBadge } from "../components/ui";

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
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["class-ledger", classId],
    queryFn: () => api<ClassLedger>(`/api/classes/${classId}/ledger`, { query: { months: "6" } }),
  });

  const canManage = can(user, "add_student");

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
        /* Roster — each student with their month-by-month paid status (from
           September). The row opens the profile, where the actions live. */
        <div className="space-y-2">
          {students.map((s) => (
            <Card key={s.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <Link href={`/student/${s.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-tg-link">{s.fullName}</div>
                  <div className="truncate text-xs text-tg-hint">
                    {money(s.effectiveFee)}
                    {s.phone ? ` · ${s.phone}` : ""}
                  </div>
                </Link>
                <StatusBadge status={s.status} />
                <Link href={`/student/${s.id}`} className="shrink-0 text-tg-hint">
                  <ChevronRight size={18} />
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {months.map((m) => (
                  <MonthChip key={m.key} label={m.label} state={s.monthly[m.key]} />
                ))}
              </div>
            </Card>
          ))}
        </div>
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

/** A compact per-month status chip (month abbreviation + paid/frozen/unpaid). */
function MonthChip({ label, state }: { label: string; state: "paid" | "unpaid" | "frozen" }) {
  const abbr = label.split(" ")[0].slice(0, 3);
  const cls =
    state === "paid"
      ? "bg-status-paid/15 text-status-paid"
      : state === "frozen"
        ? "bg-status-frozen/15 text-status-frozen"
        : "bg-tg-bg text-tg-hint";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {abbr}
      {state === "paid" ? <Check size={11} /> : state === "frozen" ? "🔵" : <Minus size={11} />}
    </span>
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
