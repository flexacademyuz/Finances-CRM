import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Check, Search, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { haptic } from "../../lib/telegram";
import { money } from "../../lib/format";
import type { TeacherRow, Class, StudentRow, PaymentPreview } from "../../lib/types";
import type { PaymentMethod } from "@shared/schema";
import { Button, Card, Field, Input, Modal, Spinner, StatusBadge } from "../../components/ui";

/**
 * Accountant "Record Payment" flow (spec §3.2):
 *   Teacher → Class → Student → Amount (pre-filled) → Method → auto date → confirm.
 * Each step uses a searchable list (typeahead) rather than long scrolling.
 */
export function RecordPayment() {
  const { t } = useI18n();
  const { user } = useSession();
  const qc = useQueryClient();
  // Teachers record only for their own students, so skip the teacher picker and
  // go straight to their (server-scoped) classes. Renumber the steps to match.
  const isTeacher = user.role === "teacher";
  const stepNo = (n: number) => (isTeacher ? n - 1 : n);

  const [teacherId, setTeacherId] = useState<string>();
  const [classId, setClassId] = useState<string>();
  const [student, setStudent] = useState<StudentRow>();
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [studentSearch, setStudentSearch] = useState(false);

  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => api<TeacherRow[]>("/api/teachers"),
    enabled: !isTeacher,
  });
  const classes = useQuery({
    queryKey: ["classes", isTeacher ? "mine" : teacherId],
    // For a teacher the list endpoint is hard-scoped to their own classes, so no
    // teacherId is sent; others must pick a teacher first.
    queryFn: () => api<Class[]>("/api/classes", { query: { teacherId: isTeacher ? undefined : teacherId, activeOnly: "1" } }),
    enabled: isTeacher || !!teacherId,
  });
  const students = useQuery({
    queryKey: ["students", classId],
    queryFn: () => api<StudentRow[]>("/api/students", { query: { classId, activeOnly: "1" } }),
    enabled: !!classId,
  });

  const preview = useQuery({
    queryKey: ["preview", student?.id],
    queryFn: () => api<PaymentPreview>(`/api/payments/preview/${student!.id}`),
    enabled: !!student,
  });

  // All active students, for the "search a student directly" shortcut (scoped to
  // the teacher's own students server-side for the teacher role).
  const allStudents = useQuery({
    queryKey: ["all-active-students"],
    queryFn: () => api<StudentRow[]>("/api/students", { query: { activeOnly: "1" } }),
    enabled: studentSearch,
  });

  /** Jump straight to a student found by name, back-filling teacher/class. */
  function pickStudentDirect(s: StudentRow) {
    haptic("light");
    setTeacherId(s.teacherId);
    setClassId(s.classId);
    setStudent(s);
    setAmount("");
    setStudentSearch(false);
  }

  // Pre-fill amount from the student's effective fee when it loads.
  useEffect(() => {
    if (preview.data && amount === "") setAmount(String(preview.data.defaultAmount));
  }, [preview.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const record = useMutation({
    mutationFn: () =>
      api("/api/payments", {
        method: "POST",
        body: { studentId: student!.id, amount: Number(amount), method },
      }),
    onSuccess: () => {
      haptic("success");
      setConfirming(false);
      setDone(true);
      qc.invalidateQueries();
    },
    onError: () => haptic("error"),
  });

  function reset() {
    setTeacherId(undefined);
    setClassId(undefined);
    setStudent(undefined);
    setAmount("");
    setMethod("cash");
    setDone(false);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-status-paid/15 text-status-paid">
          <Check size={32} />
        </div>
        <div className="text-lg font-bold">{t("paymentRecorded")}</div>
        <Button onClick={reset}>{t("recordPayment")}</Button>
      </div>
    );
  }

  const teacherName = teachers.data?.find((x) => x.id === teacherId)?.fullName;
  // Prefer the picked student's own class name (set when found via direct search,
  // before the class list for that teacher has loaded).
  const className = student?.className ?? classes.data?.find((x) => x.id === classId)?.name;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("recordPayment")}</h1>

      {/* Shortcut: find any student by name instead of drilling teacher → group. */}
      {!student && (
        <>
          <button
            onClick={() => setStudentSearch(true)}
            className="flex w-full items-center gap-3 rounded-card border border-border bg-surface p-4 text-left shadow-card transition hover:border-primary hover:bg-primary-soft active:scale-[0.99]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-brand">
              <Search size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{t("searchStudentDirect")}</div>
              <div className="text-xs text-muted">{t("searchStudentHint")}</div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </button>
          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted">
            <div className="h-px flex-1 bg-border" />
            {t("orPickManually")}
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {/* Step 1: Teacher (accountant/CEO only) — shown as avatar cards. */}
      {!isTeacher && (
        <SearchStep
          cards
          title={`1. ${t("selectTeacher")}`}
          selected={teacherName}
          onClear={() => { setTeacherId(undefined); setClassId(undefined); setStudent(undefined); }}
          loading={teachers.isLoading}
          items={(teachers.data ?? []).map((x) => ({ id: x.id, label: x.fullName }))}
          onPick={(id) => { setTeacherId(id); setClassId(undefined); setStudent(undefined); }}
        />
      )}

      {/* Step 2: Class */}
      {(isTeacher || teacherId) && (
        <SearchStep
          title={`${stepNo(2)}. ${t("selectClass")}`}
          selected={className}
          onClear={() => { setClassId(undefined); setStudent(undefined); }}
          loading={classes.isLoading}
          items={(classes.data ?? []).map((x) => ({ id: x.id, label: x.name }))}
          onPick={(id) => { setClassId(id); setStudent(undefined); }}
        />
      )}

      {/* Step 3: Student */}
      {classId && (
        <SearchStep
          title={`${stepNo(3)}. ${t("selectStudent")}`}
          selected={student?.fullName}
          onClear={() => setStudent(undefined)}
          loading={students.isLoading}
          items={(students.data ?? []).map((x) => ({ id: x.id, label: x.fullName }))}
          onPick={(id) => { setStudent(students.data!.find((s) => s.id === id)); setAmount(""); }}
        />
      )}

      {/* Step 4 & 5: Amount + Method */}
      {student && (
        <Card className="space-y-4">
          {preview.data && (
            <div
              className={`rounded-lg px-3 py-2 text-xs ${
                preview.data.isAdvance
                  ? "bg-status-paid/15 text-status-paid"
                  : "bg-tg-secondary-bg text-tg-hint"
              }`}
            >
              {preview.data.isAdvance ? `⏩ ${t("advancePayment")} — ` : ""}
              {t("coversMonth")}: <span className="font-semibold">{preview.data.billingMonthLabel}</span>
            </div>
          )}
          {preview.data?.frozen && (
            <div className="rounded-lg bg-status-frozen/15 px-3 py-2 text-xs text-status-frozen">
              🔵 {t("frozenThisMonth")}.
            </div>
          )}
          {preview.data?.discount && (
            <div className="space-y-1 rounded-lg bg-status-discount/10 px-3 py-2 text-xs">
              <div className="font-semibold text-status-discount">
                🏷️ {preview.data.discount.label} {t("discount")}
              </div>
              <div className="text-tg-hint">
                {t("fullTuition")}: {money(preview.data.fullTuition)} → {t("afterDiscount")}:{" "}
                <span className="font-medium text-tg-text">{money(preview.data.defaultAmount)}</span>
              </div>
              <div className="text-tg-hint">
                {t("teacherCredit")}: {money(preview.data.teacherCredit)} (unaffected)
              </div>
            </div>
          )}
          <Field label={`${stepNo(4)}. ${t("amount")}`}>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <div>
            <span className="label">{`${stepNo(5)}. ${t("method")}`}</span>
            <div className="grid grid-cols-2 gap-2">
              {(["cash", "online"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`btn ${method === m ? "btn-primary" : "btn-ghost"}`}
                >
                  {t(m)}
                </button>
              ))}
            </div>
          </div>
          <Button
            className="w-full"
            disabled={!amount || Number(amount) <= 0}
            onClick={() => { haptic("light"); setConfirming(true); }}
          >
            {t("confirmPayment")}
          </Button>
        </Card>
      )}

      {/* Direct student search */}
      <StudentSearchModal
        open={studentSearch}
        onClose={() => setStudentSearch(false)}
        loading={allStudents.isLoading}
        students={allStudents.data ?? []}
        onPick={pickStudentDirect}
      />

      {/* Confirmation summary before final save */}
      <Modal open={confirming} onClose={() => setConfirming(false)} title={t("confirmPayment")}>
        <div className="space-y-2 text-sm">
          {!isTeacher && <Row label={t("teacher")} value={teacherName} />}
          <Row label={t("class")} value={className} />
          <Row label={t("student")} value={student?.fullName} />
          <Row label={t("amount")} value={money(Number(amount))} />
          <Row label={t("method")} value={t(method)} />
          <Row label={t("coversMonth")} value={preview.data?.billingMonthLabel} />
          <Row label={t("date")} value={new Date().toLocaleDateString()} />
        </div>
        {record.isError && (
          <div className="mt-3 text-sm text-status-overdue">{(record.error as Error).message}</div>
        )}
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setConfirming(false)}>
            {t("cancel")}
          </Button>
          <Button className="flex-1" disabled={record.isPending} onClick={() => record.mutate()}>
            {t("confirm")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-tg-hint">{label}</span>
      <span className="font-medium">{value ?? "—"}</span>
    </div>
  );
}

/** Global student typeahead — find any student by name and jump to the amount
 *  step, skipping the teacher → group drill-down. */
function StudentSearchModal({
  open,
  onClose,
  loading,
  students,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  loading?: boolean;
  students: StudentRow[];
  onPick: (s: StudentRow) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query
    ? students.filter(
        (s) => s.fullName.toLowerCase().includes(query) || (s.phone ?? "").includes(query),
      )
    : students;

  return (
    <Modal open={open} onClose={onClose} title={t("searchStudentDirect")}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-input bg-tg-bg px-3">
          <Search size={16} className="text-tg-hint" />
          <input
            autoFocus
            className="w-full bg-transparent py-2.5 outline-none"
            placeholder={t("search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {loading ? (
          <Spinner />
        ) : (
          <div className="max-h-[55vh] space-y-1 overflow-y-auto">
            {filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => onPick(s)}
                className="flex w-full items-center gap-3 rounded-input p-2 text-left transition hover:bg-primary-soft"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white shadow-brand">
                  {initials(s.fullName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.fullName}</div>
                  <div className="truncate text-xs text-muted">
                    {s.className}
                    {s.phone ? ` · ${s.phone}` : ""}
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="py-6 text-center text-sm text-muted">{t("noData")}</div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Two-letter initials for an avatar chip. */
function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

/** A collapsible searchable picker for a single step. Pass `cards` to show the
 *  options as an avatar-card grid (used for the teacher step) instead of a list. */
function SearchStep({
  title,
  selected,
  onClear,
  items,
  onPick,
  loading,
  cards,
}: {
  title: string;
  selected?: string;
  onClear: () => void;
  items: { id: string; label: string }[];
  onPick: (id: string) => void;
  loading?: boolean;
  cards?: boolean;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const filtered = items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));

  if (selected) {
    return (
      <Card className="flex items-center justify-between">
        <div>
          <div className="text-xs text-tg-hint">{title}</div>
          <div className="font-semibold">{selected}</div>
        </div>
        <button className="text-sm text-tg-link" onClick={onClear}>
          {t("edit")}
        </button>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="flex items-center gap-2 rounded-input bg-tg-bg px-3">
        <Search size={16} className="text-tg-hint" />
        <input
          className="w-full bg-transparent py-2.5 outline-none"
          placeholder={t("search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {loading ? (
        <Spinner />
      ) : cards ? (
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {filtered.map((i) => (
            <button
              key={i.id}
              onClick={() => { haptic("light"); onPick(i.id); }}
              className="flex items-center gap-2.5 rounded-input border border-border bg-surface p-2.5 text-left transition hover:border-primary hover:bg-primary-soft"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white shadow-brand">
                {initials(i.label)}
              </span>
              <span className="min-w-0 text-sm font-medium leading-tight line-clamp-2">{i.label}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full py-4 text-center text-sm text-tg-hint">—</div>
          )}
        </div>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          {filtered.map((i) => (
            <button
              key={i.id}
              onClick={() => { haptic("light"); onPick(i.id); }}
              className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-tg-bg"
            >
              {i.label}
            </button>
          ))}
          {filtered.length === 0 && <div className="py-4 text-center text-sm text-tg-hint">—</div>}
        </div>
      )}
    </Card>
  );
}
