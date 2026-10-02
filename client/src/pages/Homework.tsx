/**
 * Staff homework — a checklist per group. Teachers (and the CEO) add homework;
 * the teacher or an assistant ticks each student who did it, in a grid of
 * students × homework (like attendance). Students don't hand anything in.
 * Also exports the group tab and the student-profile panel. Access is
 * enforced by the API; the UI only hides what can't be used.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ClipboardCheck, Check, CheckCheck, Archive, Trash2, X } from "lucide-react";
import { api, type ApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { fmtDue, type HomeworkState } from "@shared/homework";
import { addDaysIso, tashkentDate, tashkentInstant } from "@shared/lesson-schedule";
import { Button, Card, Empty, Field, Input, Modal, Segmented, Select, Spinner } from "../components/ui";

/* ─────────────────────────────── strings ─────────────────────────────── */

const H = {
  homework: { en: "Homework", uz: "Uy vazifasi" },
  group: { en: "Group", uz: "Guruh" },
  chooseGroup: { en: "Choose a group", uz: "Guruhni tanlang" },
  current: { en: "Current", uz: "Joriy" },
  all: { en: "All", uz: "Hammasi" },
  add: { en: "Add homework", uz: "Vazifa qo'shish" },
  none: { en: "No homework yet.", uz: "Hozircha uy vazifasi yo'q." },
  noneAdd: { en: "No homework yet. Add the first one.", uz: "Hozircha uy vazifasi yo'q. Birinchisini qo'shing." },
  noGroups: { en: "No groups to show.", uz: "Ko'rsatish uchun guruh yo'q." },
  students: { en: "Student", uz: "O'quvchi" },
  hint: { en: "Tick the students who did the homework. Tap a homework title to edit it.", uz: "Uy vazifasini bajargan o'quvchilarni belgilang. Tahrirlash uchun vazifa nomini bosing." },
  title: { en: "Homework", uz: "Vazifa" },
  titlePh: { en: "e.g. Workbook p. 12–13, ex. 1–4", uz: "masalan: Workbook 12–13-bet, 1–4-mashq" },
  instructions: { en: "Details (optional)", uz: "Batafsil (ixtiyoriy)" },
  dueDate: { en: "Deadline", uz: "Muddat" },
  nextLesson: { en: "Next lesson", uz: "Keyingi dars" },
  tomorrow: { en: "Tomorrow", uz: "Ertaga" },
  inWeek: { en: "In a week", uz: "Bir haftada" },
  notify: { en: "Tell students in the app", uz: "O'quvchilarga ilovada xabar berish" },
  save: { en: "Save", uz: "Saqlash" },
  edit: { en: "Edit homework", uz: "Vazifani tahrirlash" },
  tickAll: { en: "Tick everyone", uz: "Hammasini belgilash" },
  clearAll: { en: "Untick everyone", uz: "Belgilarni olib tashlash" },
  archive: { en: "Hide (archive)", uz: "Arxivlash" },
  unarchive: { en: "Restore", uz: "Tiklash" },
  delete: { en: "Delete", uz: "O'chirish" },
  confirmDelete: { en: "Delete this homework and its ticks?", uz: "Bu vazifa va belgilar o'chirilsinmi?" },
  done: { en: "{a}/{b} done", uz: "{b} tadan {a} bajardi" },
  due: { en: "Due {d}", uz: "Muddat: {d}" },
  required: { en: "Write the homework and choose a deadline.", uz: "Vazifani yozing va muddatni tanlang." },
  st_todo: { en: "Not yet", uz: "Hali yo'q" },
  st_missed: { en: "Not done", uz: "Bajarilmagan" },
  st_done: { en: "Done", uz: "Bajarildi" },
  summary: { en: "{d} of {a} done · {m} not done", uz: "{a} tadan {d} bajarildi · {m} bajarilmagan" },
  rate: { en: "{p}% done", uz: "{p}% bajarilgan" },
} as const;
type HKey = keyof typeof H;

function useH() {
  const { locale } = useI18n();
  const t = (k: HKey, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce<string>((s, [a, b]) => s.replaceAll(`{${a}}`, String(b)), H[k][locale]);
  return { t, locale };
}

/* ─────────────────────────────── types ─────────────────────────────── */

type HwItem = { id: string; classId: string; title: string; instructions: string | null; dueAt: string; status: string; done: number };
type Grid = {
  group: { id: string; name: string; nextLessonAt: string | null };
  canAssign: boolean;
  canCheck: boolean;
  homework: HwItem[];
  students: { id: string; fullName: string }[];
  ticks: Record<string, string[]>;
};
type GroupRow = { id: string; name: string; teacherName: string | null; canAssign: boolean; canCheck: boolean; nextLessonAt: string | null };

const GROUP_KEY = "homeworkGroup";
const savedGroup = () => {
  try {
    return localStorage.getItem(GROUP_KEY) ?? "";
  } catch {
    return "";
  }
};

/* ─────────────────────────────── page ─────────────────────────────── */

export function HomeworkPage() {
  const { t } = useH();
  const groups = useQuery({ queryKey: ["homework-groups"], queryFn: () => api<GroupRow[]>("/api/homework/groups") });
  const [groupId, setGroupId] = useState(savedGroup);
  useEffect(() => {
    if (groups.data && groups.data.length && !groups.data.some((g) => g.id === groupId)) setGroupId(groups.data[0].id);
  }, [groups.data, groupId]);
  const choose = (id: string) => {
    setGroupId(id);
    try {
      localStorage.setItem(GROUP_KEY, id);
    } catch {
      /* not remembered */
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ClipboardCheck size={22} /> {t("homework")}
        </h1>
        {groups.data && groups.data.length > 0 && (
          <Select value={groupId} onChange={(e) => choose(e.target.value)} className="!w-auto min-w-[200px]" aria-label={t("chooseGroup")}>
            {groups.data.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.teacherName ? ` · ${g.teacherName}` : ""}
              </option>
            ))}
          </Select>
        )}
      </div>
      {groups.isLoading ? <Spinner /> : !groups.data?.length ? <Empty>{t("noGroups")}</Empty> : groupId ? <GroupHomework classId={groupId} /> : null}
    </div>
  );
}

/* ─────────────────────────────── grid ─────────────────────────────── */

/** The tick grid for one group (also the Homework tab on the group page). */
export function GroupHomework({ classId }: { classId: string }) {
  const { t, locale } = useH();
  const qc = useQueryClient();
  const [view, setView] = useState<"active" | "all">("active");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<HwItem | null>(null);
  const key = ["homework-grid", classId, view];
  const q = useQuery({ queryKey: key, queryFn: () => api<Grid>(`/api/groups/${classId}/homework`, { query: { view } }) });

  const mark = useMutation({
    mutationFn: (v: { homeworkId: string; studentIds: string[]; done: boolean }) =>
      api(`/api/homework/${v.homeworkId}/marks`, { method: "POST", body: { studentIds: v.studentIds, done: v.done } }),
    // Optimistic: the box flips immediately; a failure reloads the real state.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Grid>(key);
      if (prev) {
        const cur = new Set(prev.ticks[v.homeworkId] ?? []);
        for (const id of v.studentIds) (v.done ? cur.add(id) : cur.delete(id));
        qc.setQueryData<Grid>(key, {
          ...prev,
          ticks: { ...prev.ticks, [v.homeworkId]: [...cur] },
          homework: prev.homework.map((h) => (h.id === v.homeworkId ? { ...h, done: [...cur].filter((id) => prev.students.some((s) => s.id === id)).length } : h)),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["homework-grid", classId] });
      void qc.invalidateQueries({ queryKey: ["student-homework"] });
    },
  });

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Empty />;
  const d = q.data;
  // Oldest on the left, newest on the right — like a register.
  const cols = [...d.homework].reverse();
  const ticked = (hwId: string, sid: string) => (d.ticks[hwId] ?? []).includes(sid);
  const now = Date.now();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "active", label: t("current") },
            { value: "all", label: t("all") },
          ]}
        />
        {d.canAssign && (
          <Button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5">
            <Plus size={16} /> {t("add")}
          </Button>
        )}
      </div>

      {cols.length === 0 || d.students.length === 0 ? (
        <Empty>{d.canAssign && cols.length === 0 ? t("noneAdd") : t("none")}</Empty>
      ) : (
        <>
          <div className="text-xs text-muted">{t("hint")}</div>
          <Card className="overflow-x-auto !p-0">
            <table className="w-max min-w-full border-collapse text-sm">
              <thead>
                <tr className="align-bottom">
                  <th className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left text-xs uppercase tracking-wide text-muted">{t("students")}</th>
                  {cols.map((h) => {
                    const past = new Date(h.dueAt).getTime() < now;
                    return (
                      <th key={h.id} className="min-w-[112px] max-w-[150px] px-2 py-2 text-left align-bottom font-normal">
                        <button
                          type="button"
                          onClick={() => setEditing(h)}
                          className={`block w-full rounded-lg px-1.5 py-1 text-left hover:bg-bg ${h.status === "archived" ? "opacity-50" : ""}`}
                          title={h.instructions ?? h.title}
                        >
                          <div className="line-clamp-2 text-xs font-semibold leading-snug text-text">{h.title}</div>
                          <div className={`mt-0.5 text-[10px] ${past ? "text-muted" : "font-semibold text-primary"}`}>{fmtDue(h.dueAt, locale)}</div>
                          <div className="text-[10px] text-muted">{t("done", { a: h.done, b: d.students.length })}</div>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.students.map((s) => (
                  <tr key={s.id}>
                    <td className="sticky left-0 z-10 max-w-[180px] truncate bg-surface px-4 py-2">
                      <Link href={`/student/${s.id}`} className="font-medium hover:text-primary">
                        {s.fullName}
                      </Link>
                    </td>
                    {cols.map((h) => {
                      const on = ticked(h.id, s.id);
                      const late = !on && new Date(h.dueAt).getTime() < now;
                      return (
                        <td key={h.id} className="px-2 py-1.5">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            aria-label={`${s.fullName}: ${h.title}`}
                            disabled={!d.canCheck}
                            onClick={() => mark.mutate({ homeworkId: h.id, studentIds: [s.id], done: !on })}
                            className={`mx-1.5 grid h-8 w-8 place-items-center rounded-lg border-2 transition active:scale-95 ${
                              on
                                ? "border-status-paid bg-status-paid text-white"
                                : late
                                  ? "border-danger/40 bg-danger/[0.04] text-transparent hover:border-danger"
                                  : "border-border bg-surface text-transparent hover:border-primary"
                            }`}
                          >
                            <Check size={18} strokeWidth={3} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {adding && <HomeworkForm classId={classId} nextLessonAt={d.group.nextLessonAt} onClose={() => setAdding(false)} />}
      {editing && (
        <HomeworkForm
          classId={classId}
          nextLessonAt={d.group.nextLessonAt}
          existing={editing}
          canEdit={d.canAssign}
          onTickAll={(done) => {
            mark.mutate({ homeworkId: editing.id, studentIds: d.students.map((s) => s.id), done });
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────── add / edit ─────────────────────────────── */

/** Split an instant into Tashkent date + time inputs. */
function splitLocal(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}

function HomeworkForm({
  classId,
  nextLessonAt,
  existing,
  canEdit = true,
  onTickAll,
  onClose,
}: {
  classId: string;
  nextLessonAt: string | null;
  existing?: HwItem;
  canEdit?: boolean;
  onTickAll?: (done: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useH();
  const qc = useQueryClient();
  const init = existing ? splitLocal(existing.dueAt) : nextLessonAt ? splitLocal(nextLessonAt) : { date: addDaysIso(tashkentDate(), 1), time: "18:00" };
  const [title, setTitle] = useState(existing?.title ?? "");
  const [instructions, setInstructions] = useState(existing?.instructions ?? "");
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [notify, setNotify] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["homework-grid", classId] });
    onClose();
  };
  const fail = (e: ApiError) => setErr(e.code === "validation" ? t("required") : e.message);

  const save = useMutation({
    mutationFn: () => {
      const body = { title, instructions, dueAt: tashkentInstant(date, time).toISOString() };
      return existing
        ? api(`/api/homework/${existing.id}`, { method: "PATCH", body })
        : api(`/api/groups/${classId}/homework`, { method: "POST", body: { ...body, notify } });
    },
    onSuccess: done,
    onError: fail,
  });
  const archive = useMutation({
    mutationFn: () => api(`/api/homework/${existing!.id}`, { method: "PATCH", body: { status: existing!.status === "archived" ? "active" : "archived" } }),
    onSuccess: done,
    onError: fail,
  });
  const del = useMutation({ mutationFn: () => api(`/api/homework/${existing!.id}`, { method: "DELETE" }), onSuccess: done, onError: fail });

  const quick = (which: "lesson" | "tomorrow" | "week") => {
    if (which === "lesson" && nextLessonAt) {
      const s = splitLocal(nextLessonAt);
      setDate(s.date);
      setTime(s.time);
    } else {
      setDate(addDaysIso(tashkentDate(), which === "tomorrow" ? 1 : 7));
      setTime("18:00");
    }
  };

  return (
    <Modal open onClose={onClose} title={existing ? t("edit") : t("add")}>
      <div className="space-y-3">
        {existing && onTickAll && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => onTickAll(true)} className="inline-flex items-center justify-center gap-1.5">
              <CheckCheck size={16} /> {t("tickAll")}
            </Button>
            <Button variant="ghost" onClick={() => onTickAll(false)} className="inline-flex items-center justify-center gap-1.5">
              <X size={16} /> {t("clearAll")}
            </Button>
          </div>
        )}
        {canEdit ? (
          <>
            <Field label={t("title")}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder={t("titlePh")} autoFocus={!existing} />
            </Field>
            <Field label={t("instructions")}>
              <textarea className="input min-h-[72px] py-2" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={3000} />
            </Field>
            <Field label={t("dueDate")}>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="!w-36" />
              </div>
            </Field>
            <div className="-mt-1 flex flex-wrap gap-1.5">
              {nextLessonAt && <QuickChip onClick={() => quick("lesson")}>{t("nextLesson")}</QuickChip>}
              <QuickChip onClick={() => quick("tomorrow")}>{t("tomorrow")}</QuickChip>
              <QuickChip onClick={() => quick("week")}>{t("inWeek")}</QuickChip>
            </div>
            {!existing && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t("notify")}
              </label>
            )}
            {err && <div className="text-sm text-danger">{err}</div>}
            <Button className="w-full" disabled={save.isPending || !title.trim()} onClick={() => save.mutate()}>
              {existing ? t("save") : t("add")}
            </Button>
            {existing && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" disabled={archive.isPending} onClick={() => archive.mutate()} className="inline-flex items-center justify-center gap-1">
                  <Archive size={15} /> {existing.status === "archived" ? t("unarchive") : t("archive")}
                </Button>
                <Button variant="danger" disabled={del.isPending} onClick={() => window.confirm(t("confirmDelete")) && del.mutate()} className="inline-flex items-center justify-center gap-1">
                  <Trash2 size={15} /> {t("delete")}
                </Button>
              </div>
            )}
          </>
        ) : (
          existing && (
            <div className="space-y-1 text-sm">
              <div className="font-semibold">{existing.title}</div>
              {existing.instructions && <p className="whitespace-pre-wrap text-muted">{existing.instructions}</p>}
            </div>
          )
        )}
      </div>
    </Modal>
  );
}

function QuickChip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full bg-bg px-3 py-1 text-xs font-semibold text-muted ring-1 ring-border hover:text-text">
      {children}
    </button>
  );
}

/* ─────────────────────────────── student profile ─────────────────────────────── */

type StudentHw = {
  summary: { assigned: number; done: number; missed: number; todo: number; rate: number | null };
  recent: { id: string; title: string; dueAt: string; state: HomeworkState }[];
};

const STATE_CLS: Record<HomeworkState, string> = {
  todo: "bg-bg text-muted",
  missed: "bg-danger/10 text-danger",
  done: "bg-status-paid/15 text-status-paid",
};

/** Student profile: homework record. Hidden when there's none or no access. */
export function StudentHomeworkPanel({ studentId }: { studentId: string }) {
  const { t, locale } = useH();
  const q = useQuery({
    queryKey: ["student-homework", studentId],
    queryFn: () => api<StudentHw>(`/api/students/${studentId}/homework`),
    retry: false,
  });
  if (!q.data || q.data.summary.assigned === 0) return null;
  const s = q.data.summary;
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
        <ClipboardCheck size={17} /> {t("homework")}
      </h2>
      <Card className="space-y-3">
        <div className="text-sm">
          {t("summary", { d: s.done, a: s.assigned, m: s.missed })}
          {s.rate != null && <span className="ml-2 font-bold">{t("rate", { p: s.rate })}</span>}
        </div>
        <div className="divide-y divide-border">
          {q.data.recent.slice(0, 8).map((h) => (
            <div key={h.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{h.title}</span>
              <span className="hidden text-xs text-muted sm:inline">{t("due", { d: fmtDue(h.dueAt, locale) })}</span>
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${STATE_CLS[h.state]}`}>{t(`st_${h.state}` as HKey)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
