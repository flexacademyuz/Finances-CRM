import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Folder, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import type { Class, TeacherRow } from "../../lib/types";
import { Button, Card, Empty, Field, Input, Modal, Select, Spinner } from "../../components/ui";

/**
 * Groups (classes) management. Available to CEO and Accountant: both can create
 * and edit any group; only the CEO deletes/archives (V2 Change 1A).
 */
export function ClassesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Class | null | "new">(null);

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });
  const teachers = useQuery({ queryKey: ["teachers"], queryFn: () => api<TeacherRow[]>("/api/teachers") });
  const teacherName = (id: string) => teachers.data?.find((x) => x.id === id)?.fullName ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("groups")}</h1>
        <Button onClick={() => setEditing("new")}>
          <Plus size={18} /> {t("add")}
        </Button>
      </div>

      {classes.isLoading ? (
        <Spinner />
      ) : classes.data?.length ? (
        <div className="space-y-2">
          {classes.data.map((c) => (
            <Card key={c.id} className="flex items-center justify-between gap-2">
              <Link href={`/class/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Folder size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block truncate text-xs text-tg-hint">
                    {teacherName(c.teacherId)} · {money(c.defaultFee)}
                    {c.room ? ` · ${c.room}` : ""}
                  </span>
                </span>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <button className="p-1 text-tg-link" onClick={() => setEditing(c)} aria-label={t("edit")}>
                  <Pencil size={16} />
                </button>
                <Link href={`/class/${c.id}`} className="p-1 text-tg-hint">
                  <ChevronRight size={18} />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty />
      )}

      {editing !== null && (
        <GroupModal
          group={editing === "new" ? null : editing}
          teachers={teachers.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["classes"] }); }}
        />
      )}
    </div>
  );
}

function GroupModal({
  group,
  teachers,
  onClose,
  onSaved,
}: {
  group: Class | null;
  teachers: TeacherRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const editing = !!group;
  const [name, setName] = useState(group?.name ?? "");
  const [subject, setSubject] = useState(group?.subject ?? "");
  const [teacherId, setTeacherId] = useState(group?.teacherId ?? "");
  const [defaultFee, setDefaultFee] = useState(group ? String(group.defaultFee) : "");
  const [schedule, setSchedule] = useState(group?.schedule ?? "");
  const [room, setRoom] = useState(group?.room ?? "");
  const [maxStudents, setMaxStudents] = useState(group?.maxStudents ? String(group.maxStudents) : "");
  const [startDate, setStartDate] = useState(group?.startDate ?? "");
  const [perStudentRate, setPerStudentRate] = useState("");

  const body = () => ({
    name,
    subject: subject || undefined,
    teacherId,
    defaultFee: Number(defaultFee || 0),
    schedule: schedule || undefined,
    room: room || undefined,
    maxStudents: maxStudents ? Number(maxStudents) : undefined,
    startDate: startDate || undefined,
  });

  const save = useMutation({
    mutationFn: async () => {
      const saved = editing
        ? await api<Class>(`/api/classes/${group!.id}`, { method: "PATCH", body: body() })
        : await api<Class>("/api/classes", { method: "POST", body: body() });
      // Optionally set the teacher's fixed per-student rate for this group.
      if (perStudentRate) {
        await api("/api/teacher-salary-rules", {
          method: "PUT",
          body: { groupId: saved.id, fixedSalaryPerStudent: Number(perStudentRate) },
        });
      }
      return saved;
    },
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={`${editing ? t("edit") : t("add")} — ${t("groups")}`}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto">
        <Field label={t("groups")}>
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
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("fee")}>
            <Input type="number" value={defaultFee} onChange={(e) => setDefaultFee(e.target.value)} />
          </Field>
          <Field label="Room">
            <Input value={room} onChange={(e) => setRoom(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Max students">
            <Input type="number" value={maxStudents} onChange={(e) => setMaxStudents(e.target.value)} />
          </Field>
          <Field label="Start date">
            <Input type="date" value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Schedule">
          <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Mon/Wed 18:00" />
        </Field>
        <Field label={`${t("teacher")} ${t("perStudentRate")} (UZS)`}>
          <Input
            type="number"
            value={perStudentRate}
            onChange={(e) => setPerStudentRate(e.target.value)}
            placeholder="leave blank to keep current"
          />
        </Field>
        {save.isError && (
          <div className="text-sm text-status-overdue">{(save.error as Error).message}</div>
        )}
        <Button
          className="w-full"
          disabled={!name || !teacherId || save.isPending}
          onClick={() => save.mutate()}
        >
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}
