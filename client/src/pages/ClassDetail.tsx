import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Plus, Check, Minus } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { money } from "../lib/format";
import type { ClassLedger } from "../lib/types";
import { Button, Card, Empty, Field, Input, Modal, Spinner, StatusBadge } from "../components/ui";
import { StudentActions } from "../components/StudentActions";

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

  const canManage = user.role === "ceo" || user.role === "accountant" || user.role === "teacher";

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
          {/* Monthly payment table (scrolls horizontally) */}
          <Card className="overflow-x-auto p-0">
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
                    {months.map((m) => (
                      <td key={m.key} className="px-2 py-2 text-center">
                        <PaidCell state={s.monthly[m.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Roster with status + actions */}
          <div className="space-y-2">
            {students.map((s) => (
              <Card key={s.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{s.fullName}</div>
                  <div className="text-xs text-tg-hint">
                    {money(s.effectiveFee)}
                    {s.phone ? ` · ${s.phone}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={s.status} />
                  {(user.role === "ceo" || user.role === "accountant") && (
                    <StudentActions student={{ id: s.id, classId: cls.id, fullName: s.fullName, effectiveFee: s.effectiveFee }} />
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {adding && (
        <AddStudentModal
          classId={cls.id}
          className={cls.name}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["class-ledger", classId] }); }}
        />
      )}
    </div>
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

function AddStudentModal({
  classId,
  className,
  onClose,
  onSaved,
}: {
  classId: string;
  className: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const create = useMutation({
    mutationFn: () =>
      api("/api/students", {
        method: "POST",
        body: {
          fullName,
          phone: phone || undefined,
          classId,
          monthlyFee: monthlyFee ? Number(monthlyFee) : undefined,
          enrolledAt: startDate || undefined,
        },
      }),
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
