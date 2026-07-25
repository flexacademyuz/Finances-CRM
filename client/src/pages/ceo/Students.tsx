import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import type { StudentRow, Class, TeacherRow } from "../../lib/types";
import type { StudentStatus } from "@shared/schema";
import { Button, Card, Empty, Field, Input, Modal, Select, Spinner, StatusBadge } from "../../components/ui";

const STATUSES: (StudentStatus | "")[] = ["", "paid", "awaiting_payment", "overdue", "frozen", "not_due"];

export function StudentsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [view, setView] = useState<"active" | "archived">("active");
  const [status, setStatus] = useState<StudentStatus | "">("");
  const [classId, setClassId] = useState("");
  const [adding, setAdding] = useState(false);
  const [resuming, setResuming] = useState<StudentRow | null>(null);

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });
  const students = useQuery({
    queryKey: ["students", view, status, classId],
    queryFn: () =>
      api<StudentRow[]>("/api/students", {
        query:
          view === "archived"
            ? { archived: "1", classId: classId || undefined }
            : { activeOnly: "1", status: status || undefined, classId: classId || undefined },
      }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("students")}</h1>
        <Button onClick={() => setAdding(true)}>
          <Plus size={18} /> {t("add")}
        </Button>
      </div>

      {/* Active / Archived */}
      <div className="grid grid-cols-2 gap-2">
        {(["active", "archived"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`btn ${view === v ? "btn-primary" : "btn-ghost"}`}
          >
            {v === "active" ? t("active") : t("archived")}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t("classes")}</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        {view === "active" && (
          <Select value={status} onChange={(e) => setStatus(e.target.value as StudentStatus | "")}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s ? t(s) : t("status")}</option>
            ))}
          </Select>
        )}
      </div>

      {students.isLoading ? (
        <Spinner />
      ) : students.data?.length ? (
        <div className="space-y-2">
          {students.data.map((s) => (
            <Card key={s.id} className="flex items-center justify-between gap-2 p-0">
              {/* Whole row opens the profile, where the per-student actions live. */}
              <Link href={`/student/${s.id}`} className="flex min-w-0 flex-1 items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-tg-link">{s.fullName}</div>
                  <div className="truncate text-xs text-tg-hint">
                    {s.className} · {money(s.effectiveFee)}
                  </div>
                </div>
                {view !== "archived" && <StatusBadge status={s.status} />}
                <ChevronRight size={18} className="shrink-0 text-tg-hint" />
              </Link>
              {view === "archived" && (
                <div className="shrink-0 pr-3">
                  <Button variant="ghost" onClick={() => setResuming(s)}>{t("resumeStudent")}</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Empty>{view === "archived" ? t("noArchived") : undefined}</Empty>
      )}

      <AddStudentModal
        open={adding}
        onClose={() => setAdding(false)}
        classes={classes.data ?? []}
        onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["students"] }); }}
      />
      {resuming && (
        <ResumeStudentModal
          student={resuming}
          classes={classes.data ?? []}
          onClose={() => setResuming(null)}
          onSaved={() => { setResuming(null); qc.invalidateQueries({ queryKey: ["students"] }); }}
        />
      )}
    </div>
  );
}

/** Bring a stopped student back, optionally into a different group. */
function ResumeStudentModal({
  student,
  classes,
  onClose,
  onSaved,
}: {
  student: StudentRow;
  classes: Class[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [classId, setClassId] = useState(student.classId);
  const [resumeDate, setResumeDate] = useState(new Date().toISOString().slice(0, 10));

  const resume = useMutation({
    mutationFn: () =>
      api(`/api/students/${student.id}/resume`, {
        method: "POST",
        body: { classId, resumeDate },
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={`${t("resumeStudent")} — ${student.fullName}`}>
      <div className="space-y-3">
        <Field label={t("resumeInto")}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("resumeDate")}>
          <Input type="date" value={resumeDate} onChange={(e) => setResumeDate(e.target.value)} />
        </Field>
        {resume.isError && (
          <div className="text-sm text-status-overdue">{(resume.error as Error).message}</div>
        )}
        <Button className="w-full" disabled={resume.isPending} onClick={() => resume.mutate()}>
          {t("resumeStudent")}
        </Button>
      </div>
    </Modal>
  );
}

function AddStudentModal({
  open,
  onClose,
  classes,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  classes: Class[];
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [classId, setClassId] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [markPaid, setMarkPaid] = useState(false);
  const [payMethod, setPayMethod] = useState<"cash" | "online">("cash");

  const classFee = classes.find((c) => c.id === classId)?.defaultFee;
  const payAmount = Number(monthlyFee) || Number(classFee) || 0;

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
      // Optionally record the first month's payment in the same step.
      if (markPaid && payAmount > 0) {
        await api("/api/payments", {
          method: "POST",
          body: { studentId: student.id, amount: payAmount, method: payMethod },
        });
      }
      return student;
    },
    onSuccess: () => {
      setFullName(""); setPhone(""); setClassId(""); setMonthlyFee("");
      setStartDate(new Date().toISOString().slice(0, 10));
      setMarkPaid(false); setPayMethod("cash");
      onSaved();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={`${t("add")} — ${t("student")}`}>
      <div className="space-y-3">
        <Field label={t("fullName")}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label={t("phone")}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t("class")}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">—</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("startDate")}>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label={`${t("fee")} (${t("value")})`}>
          <Input
            type="number"
            placeholder="class default"
            value={monthlyFee}
            onChange={(e) => setMonthlyFee(e.target.value)}
          />
        </Field>

        {/* Optional: record the first month's payment right away */}
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
        <Button
          className="w-full"
          disabled={!fullName || !classId || create.isPending}
          onClick={() => create.mutate()}
        >
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}
