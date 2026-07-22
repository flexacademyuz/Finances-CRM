import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { haptic } from "../../lib/telegram";
import { money } from "../../lib/format";
import type { TeacherRow, Class, StudentRow, PaymentPreview } from "../../lib/types";
import type { PaymentMethod } from "@shared/schema";
import { Button, Card, Field, Input, Modal, Spinner } from "../../components/ui";

/**
 * Accountant "Record Payment" flow (spec §3.2):
 *   Teacher → Class → Student → Amount (pre-filled) → Method → auto date → confirm.
 * Each step uses a searchable list (typeahead) rather than long scrolling.
 */
export function RecordPayment() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [teacherId, setTeacherId] = useState<string>();
  const [classId, setClassId] = useState<string>();
  const [student, setStudent] = useState<StudentRow>();
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const teachers = useQuery({ queryKey: ["teachers"], queryFn: () => api<TeacherRow[]>("/api/teachers") });
  const classes = useQuery({
    queryKey: ["classes", teacherId],
    queryFn: () => api<Class[]>("/api/classes", { query: { teacherId, activeOnly: "1" } }),
    enabled: !!teacherId,
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
  const className = classes.data?.find((x) => x.id === classId)?.name;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("recordPayment")}</h1>

      {/* Step 1: Teacher */}
      <SearchStep
        title={`1. ${t("selectTeacher")}`}
        selected={teacherName}
        onClear={() => { setTeacherId(undefined); setClassId(undefined); setStudent(undefined); }}
        loading={teachers.isLoading}
        items={(teachers.data ?? []).map((x) => ({ id: x.id, label: x.fullName }))}
        onPick={(id) => { setTeacherId(id); setClassId(undefined); setStudent(undefined); }}
      />

      {/* Step 2: Class */}
      {teacherId && (
        <SearchStep
          title={`2. ${t("selectClass")}`}
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
          title={`3. ${t("selectStudent")}`}
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
          {preview.data?.alreadyPaid && (
            <div className="rounded-lg bg-status-awaiting/15 px-3 py-2 text-xs text-status-awaiting">
              ⚠️ This student already has a payment for this month.
            </div>
          )}
          <Field label={`4. ${t("amount")}`}>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <div>
            <span className="label">{`5. ${t("method")}`}</span>
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

      {/* Confirmation summary before final save */}
      <Modal open={confirming} onClose={() => setConfirming(false)} title={t("confirmPayment")}>
        <div className="space-y-2 text-sm">
          <Row label={t("teacher")} value={teacherName} />
          <Row label={t("class")} value={className} />
          <Row label={t("student")} value={student?.fullName} />
          <Row label={t("amount")} value={money(Number(amount))} />
          <Row label={t("method")} value={t(method)} />
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

/** A collapsible searchable picker for a single step. */
function SearchStep({
  title,
  selected,
  onClear,
  items,
  onPick,
  loading,
}: {
  title: string;
  selected?: string;
  onClear: () => void;
  items: { id: string; label: string }[];
  onPick: (id: string) => void;
  loading?: boolean;
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
    <Card className="space-y-2">
      <div className="text-sm font-semibold">{title}</div>
      <div className="flex items-center gap-2 rounded-xl bg-tg-bg px-3">
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
