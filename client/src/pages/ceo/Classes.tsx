import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Folder, BookOpen, Users2 } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { can } from "@shared/permissions";
import { money } from "../../lib/format";
import type { Class, TeacherRow } from "../../lib/types";
import type { ScheduleSlot } from "@shared/schema";
import { ScheduleSlotsEditor } from "../../components/ScheduleSlotsEditor";
import { Button, Card, Empty, Field, Input, MoneyHint, Modal, Select, Spinner, StatTile } from "../../components/ui";

/**
 * Groups (classes) management. Available to CEO and Accountant: both can create
 * and edit any group; only the CEO deletes/archives (V2 Change 1A).
 */
export function ClassesPage() {
  const { t } = useI18n();
  const { user } = useSession();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Class | null | "new">(null);
  const canAdd = can(user, "add_group");
  const canEdit = can(user, "edit_group");

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });
  const teachers = useQuery({ queryKey: ["teachers"], queryFn: () => api<TeacherRow[]>("/api/teachers") });
  const teacherName = (id: string) => teachers.data?.find((x) => x.id === id)?.fullName ?? "—";

  const groupCount = classes.data?.length ?? 0;
  const teacherCount = new Set((classes.data ?? []).map((c) => c.teacherId)).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t("groups")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("groupsSubtitle")}</p>
        </div>
        {canAdd && (
          <Button onClick={() => setEditing("new")}>
            <Plus size={18} /> {t("createGroup")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile tint="blue" label={t("groups")} value={groupCount} icon={<BookOpen size={18} />} />
        <StatTile tint="violet" label={t("teacher_count")} value={teacherCount} icon={<Users2 size={18} />} />
      </div>

      {classes.isLoading ? (
        <Spinner />
      ) : classes.data?.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {classes.data.map((c) => (
            <Card key={c.id} className="relative flex flex-col gap-2 !p-3">
              {canEdit && (
                <button
                  className="absolute right-2 top-2 p-1 text-tg-link"
                  onClick={() => setEditing(c)}
                  aria-label={t("edit")}
                >
                  <Pencil size={15} />
                </button>
              )}
              <Link href={`/class/${c.id}`} className="flex flex-col gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Folder size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block truncate text-xs text-tg-hint">{teacherName(c.teacherId)}</span>
                </span>
                <span className="flex items-center justify-between gap-1 text-xs">
                  <span className="font-medium text-tg-text">{money(c.defaultFee)}</span>
                  {c.room && <span className="text-tg-hint">{c.room}</span>}
                </span>
              </Link>
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
  const [slots, setSlots] = useState<ScheduleSlot[]>(group?.scheduleSlots ?? []);
  const [room, setRoom] = useState(group?.room ?? "");
  const [maxStudents, setMaxStudents] = useState(group?.maxStudents ? String(group.maxStudents) : "");
  const [startDate, setStartDate] = useState(group?.startDate ?? "");
  // Load the group's current fixed per-student teacher rate so the box shows it
  // (the API now returns it on the class). Blank = no rate set.
  const [perStudentRate, setPerStudentRate] = useState(
    group?.perStudentRate != null ? String(group.perStudentRate) : "",
  );
  const hadRate = group?.perStudentRate != null;

  const body = () => ({
    name,
    subject: subject || undefined,
    teacherId,
    defaultFee: Number(defaultFee || 0),
    scheduleSlots: slots.filter((s) => s.days.length > 0),
    room: room || undefined,
    maxStudents: maxStudents ? Number(maxStudents) : undefined,
    startDate: startDate || undefined,
  });

  const save = useMutation({
    mutationFn: async () => {
      const saved = editing
        ? await api<Class>(`/api/classes/${group!.id}`, { method: "PATCH", body: body() })
        : await api<Class>("/api/classes", { method: "POST", body: body() });
      // Set, update, or clear the teacher's fixed per-student rate for this group.
      const rate = perStudentRate.trim();
      if (rate !== "") {
        await api("/api/teacher-salary-rules", {
          method: "PUT",
          body: { groupId: saved.id, fixedSalaryPerStudent: Number(rate) },
        });
      } else if (hadRate) {
        // The box was cleared → remove the rate.
        await api(`/api/teacher-salary-rules/group/${saved.id}`, { method: "DELETE" });
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
            <MoneyHint value={defaultFee} />
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
          <ScheduleSlotsEditor value={slots} onChange={setSlots} />
        </Field>
        <Field label={`${t("teacher")} ${t("perStudentRate")} (UZS)`}>
          <Input
            type="number"
            value={perStudentRate}
            onChange={(e) => setPerStudentRate(e.target.value)}
            placeholder="e.g. 125000"
          />
          <MoneyHint value={perStudentRate} />
          <span className="mt-1 block text-xs text-tg-hint">{t("perStudentRateNote")}</span>
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
