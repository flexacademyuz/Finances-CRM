import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import type { StudentRow, Class, TeacherRow } from "../../lib/types";
import type { StudentStatus } from "@shared/schema";
import { Button, Card, Empty, Field, Input, Modal, Select, Spinner, StatusBadge } from "../../components/ui";

const STATUSES: (StudentStatus | "")[] = ["", "paid", "awaiting_payment", "overdue"];

export function StudentsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [status, setStatus] = useState<StudentStatus | "">("");
  const [classId, setClassId] = useState("");
  const [adding, setAdding] = useState(false);

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });
  const students = useQuery({
    queryKey: ["students", status, classId],
    queryFn: () =>
      api<StudentRow[]>("/api/students", {
        query: { status: status || undefined, classId: classId || undefined },
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

      <div className="flex gap-2">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t("classes")}</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as StudentStatus | "")}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s ? t(s) : t("status")}</option>
          ))}
        </Select>
      </div>

      {students.isLoading ? (
        <Spinner />
      ) : students.data?.length ? (
        <div className="space-y-2">
          {students.data.map((s) => (
            <Card key={s.id} className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{s.fullName}</div>
                <div className="text-xs text-tg-hint">
                  {s.className} · {money(s.effectiveFee)}
                </div>
              </div>
              <StatusBadge status={s.status} />
            </Card>
          ))}
        </div>
      ) : (
        <Empty />
      )}

      <AddStudentModal
        open={adding}
        onClose={() => setAdding(false)}
        classes={classes.data ?? []}
        onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["students"] }); }}
      />
    </div>
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

  const create = useMutation({
    mutationFn: () =>
      api("/api/students", {
        method: "POST",
        body: {
          fullName,
          phone: phone || undefined,
          classId,
          monthlyFee: monthlyFee ? Number(monthlyFee) : undefined,
        },
      }),
    onSuccess: () => { setFullName(""); setPhone(""); setClassId(""); setMonthlyFee(""); onSaved(); },
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
        <Field label={`${t("fee")} (${t("value")})`}>
          <Input
            type="number"
            placeholder="class default"
            value={monthlyFee}
            onChange={(e) => setMonthlyFee(e.target.value)}
          />
        </Field>
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
