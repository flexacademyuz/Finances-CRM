import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import type { Class, TeacherRow } from "../../lib/types";
import { Button, Card, Empty, Field, Input, Modal, Select, Spinner } from "../../components/ui";

export function ClassesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });
  const teachers = useQuery({ queryKey: ["teachers"], queryFn: () => api<TeacherRow[]>("/api/teachers") });
  const teacherName = (id: string) => teachers.data?.find((x) => x.id === id)?.fullName ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("classes")}</h1>
        <Button onClick={() => setAdding(true)}>
          <Plus size={18} /> {t("add")}
        </Button>
      </div>

      {classes.isLoading ? (
        <Spinner />
      ) : classes.data?.length ? (
        <div className="space-y-2">
          {classes.data.map((c) => (
            <Card key={c.id} className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-tg-hint">
                  {teacherName(c.teacherId)} · {money(c.defaultFee)}
                  {c.schedule ? ` · ${c.schedule}` : ""}
                </div>
              </div>
              {!c.active && <span className="text-xs text-tg-hint">archived</span>}
            </Card>
          ))}
        </div>
      ) : (
        <Empty />
      )}

      <AddClassModal
        open={adding}
        onClose={() => setAdding(false)}
        teachers={teachers.data ?? []}
        onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["classes"] }); }}
      />
    </div>
  );
}

function AddClassModal({
  open,
  onClose,
  teachers,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  teachers: TeacherRow[];
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [defaultFee, setDefaultFee] = useState("");
  const [schedule, setSchedule] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api("/api/classes", {
        method: "POST",
        body: {
          name,
          subject: subject || undefined,
          teacherId,
          defaultFee: Number(defaultFee || 0),
          schedule: schedule || undefined,
        },
      }),
    onSuccess: () => {
      setName(""); setSubject(""); setTeacherId(""); setDefaultFee(""); setSchedule("");
      onSaved();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={`${t("add")} — ${t("class")}`}>
      <div className="space-y-3">
        <Field label={t("class")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Subject / level">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label={t("teacher")}>
          <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">—</option>
            {teachers.map((x) => (
              <option key={x.id} value={x.id}>{x.fullName}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("fee")}>
          <Input type="number" value={defaultFee} onChange={(e) => setDefaultFee(e.target.value)} />
        </Field>
        <Field label="Schedule">
          <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Mon/Wed 18:00" />
        </Field>
        {create.isError && (
          <div className="text-sm text-status-overdue">{(create.error as Error).message}</div>
        )}
        <Button
          className="w-full"
          disabled={!name || !teacherId || create.isPending}
          onClick={() => create.mutate()}
        >
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}
