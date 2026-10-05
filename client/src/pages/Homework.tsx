/**
 * Staff homework, per group, in two sections:
 *
 *  Homework     the teacher (or the CEO) writes several lines in one box; each
 *               line becomes a part. For every student and part the teacher
 *               or an assistant presses the tick (done) or the X (not done).
 *  Task tables  a teacher-made grid of tasks with no deadline (e.g. ten
 *               speaking tasks); tick a cell when the student finishes that
 *               task, like the payment table.
 *
 * Students don't hand anything in. Also exports the group tab and the
 * student-profile panel. Access is enforced by the API; the UI only hides
 * what can't be used.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Plus, ClipboardCheck, Check, CheckCheck, Archive, Trash2, X, Pencil, ChevronDown, Table2, ListChecks } from "lucide-react";
import { api, type ApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { fmtDue, splitParts, type HomeworkPart, type HomeworkState, type PartMark, type TrackerColumn } from "@shared/homework";
import { addDaysIso, tashkentDate, tashkentInstant } from "@shared/lesson-schedule";
import { Button, Card, Empty, Field, Input, Modal, Segmented, Select, Spinner } from "../components/ui";

/* ─────────────────────────────── strings ─────────────────────────────── */

const H = {
  homework: { en: "Homework", uz: "Uy vazifasi" },
  tables: { en: "Task tables", uz: "Topshiriqlar jadvali" },
  chooseGroup: { en: "Choose a group", uz: "Guruhni tanlang" },
  current: { en: "Current", uz: "Joriy" },
  all: { en: "All", uz: "Hammasi" },
  add: { en: "Add homework", uz: "Vazifa qo'shish" },
  none: { en: "No homework yet.", uz: "Hozircha uy vazifasi yo'q." },
  noneAdd: { en: "No homework yet. Add the first one.", uz: "Hozircha uy vazifasi yo'q. Birinchisini qo'shing." },
  noStudents: { en: "No students in this group.", uz: "Bu guruhda o'quvchi yo'q." },
  noGroups: { en: "No groups to show.", uz: "Ko'rsatish uchun guruh yo'q." },
  students: { en: "Student", uz: "O'quvchi" },
  hint: {
    en: "Press the tick when a student did a task, or the X when they didn't. Press it again to clear.",
    uz: "O'quvchi vazifani bajargan bo'lsa belgini, bajarmagan bo'lsa X ni bosing. Bekor qilish uchun yana bosing.",
  },
  text: { en: "Homework — one task per line", uz: "Uy vazifasi — har qatorga bitta vazifa" },
  textPh: {
    en: "Workbook p. 12, ex. 1–4\nLearn 20 new words\nWrite 5 sentences with past simple",
    uz: "Workbook 12-bet, 1–4-mashq\n20 ta yangi so'z yodlash\nPast simple bilan 5 ta gap yozish",
  },
  preview: { en: "Students will see {n} tick boxes:", uz: "O'quvchilar {n} ta belgi katagini ko'radi:" },
  dueDate: { en: "Deadline", uz: "Muddat" },
  nextLesson: { en: "Next lesson", uz: "Keyingi dars" },
  tomorrow: { en: "Tomorrow", uz: "Ertaga" },
  inWeek: { en: "In a week", uz: "Bir haftada" },
  notify: { en: "Tell students in the app", uz: "O'quvchilarga ilovada xabar berish" },
  save: { en: "Save", uz: "Saqlash" },
  edit: { en: "Edit homework", uz: "Vazifani tahrirlash" },
  tickAll: { en: "Tick everyone", uz: "Hammasini belgilash" },
  clearAll: { en: "Clear all marks", uz: "Belgilarni tozalash" },
  allParts: { en: "All tasks done", uz: "Hammasi bajarildi" },
  archive: { en: "Hide (archive)", uz: "Arxivlash" },
  unarchive: { en: "Restore", uz: "Tiklash" },
  archived: { en: "Archived", uz: "Arxivda" },
  delete: { en: "Delete", uz: "O'chirish" },
  confirmDelete: { en: "Delete this homework and its marks?", uz: "Bu vazifa va belgilar o'chirilsinmi?" },
  done: { en: "{a}/{b} did everything", uz: "{b} tadan {a} tasi hammasini bajardi" },
  due: { en: "Due {d}", uz: "Muddat: {d}" },
  required: { en: "Write the homework and choose a deadline.", uz: "Vazifani yozing va muddatni tanlang." },
  markDone: { en: "Done", uz: "Bajardi" },
  markMissed: { en: "Not done", uz: "Bajarmadi" },
  // task tables
  addTable: { en: "New task table", uz: "Yangi jadval" },
  editTable: { en: "Edit task table", uz: "Jadvalni tahrirlash" },
  noTables: { en: "No task tables yet.", uz: "Hozircha jadval yo'q." },
  noTablesAdd: {
    en: "No task tables yet. Make one for tasks without a deadline, e.g. 10 speaking tasks.",
    uz: "Hozircha jadval yo'q. Muddatsiz vazifalar uchun yarating, masalan 10 ta speaking topshirig'i.",
  },
  tableTitle: { en: "Title", uz: "Nomi" },
  tableTitlePh: { en: "e.g. Speaking tasks", uz: "masalan: Speaking topshiriqlari" },
  count: { en: "Number of tasks", uz: "Topshiriqlar soni" },
  labels: { en: "Task names (optional, one per line)", uz: "Topshiriq nomlari (ixtiyoriy, har qatorga bitta)" },
  labelsHint: { en: "Leave empty to number them 1, 2, 3 …", uz: "Bo'sh qoldirsangiz 1, 2, 3 … deb raqamlanadi" },
  tableHint: { en: "Tick a box when the student finishes that task.", uz: "O'quvchi topshiriqni bajarganda katakni belgilang." },
  progress: { en: "Done", uz: "Bajarildi" },
  confirmDeleteTable: { en: "Delete this task table and its ticks?", uz: "Bu jadval va belgilar o'chirilsinmi?" },
  tableRequired: { en: "Give a title and the number of tasks.", uz: "Nomini va topshiriqlar sonini kiriting." },
  // student profile
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

type Marks = Record<string, Record<string, PartMark>>; // studentId → partId → mark
type HwItem = {
  id: string;
  classId: string;
  title: string;
  parts: HomeworkPart[];
  instructions: string | null;
  dueAt: string;
  status: string;
  done: number;
  marks: Marks;
};
type Grid = {
  group: { id: string; name: string; nextLessonAt: string | null };
  canAssign: boolean;
  canCheck: boolean;
  homework: HwItem[];
  students: { id: string; fullName: string }[];
};
type TrackerItem = { id: string; classId: string; title: string; columns: TrackerColumn[]; status: string; ticks: Record<string, string[]> };
type Tables = { canAssign: boolean; canCheck: boolean; trackers: TrackerItem[]; students: { id: string; fullName: string }[] };
type GroupRow = { id: string; name: string; teacherName: string | null; canAssign: boolean; canCheck: boolean; nextLessonAt: string | null };

const GROUP_KEY = "homeworkGroup";
const SECTION_KEY = "homeworkSection";
const remembered = (key: string) => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered */
  }
};

/* ─────────────────────────────── page ─────────────────────────────── */

export function HomeworkPage() {
  const { t } = useH();
  const groups = useQuery({ queryKey: ["homework-groups"], queryFn: () => api<GroupRow[]>("/api/homework/groups") });
  const [groupId, setGroupId] = useState(() => remembered(GROUP_KEY));
  useEffect(() => {
    if (groups.data && groups.data.length && !groups.data.some((g) => g.id === groupId)) setGroupId(groups.data[0].id);
  }, [groups.data, groupId]);
  const choose = (id: string) => {
    setGroupId(id);
    remember(GROUP_KEY, id);
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

/** One group's homework and task tables (also the Homework tab on the group page). */
export function GroupHomework({ classId }: { classId: string }) {
  const { t } = useH();
  const [section, setSection] = useState<"homework" | "tables">(() => (remembered(SECTION_KEY) === "tables" ? "tables" : "homework"));
  const pick = (s: "homework" | "tables") => {
    setSection(s);
    remember(SECTION_KEY, s);
  };
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-xl bg-bg p-1 ring-1 ring-border">
        {(
          [
            ["homework", t("homework"), ListChecks],
            ["tables", t("tables"), Table2],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => pick(key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
              section === key ? "bg-primary text-white shadow-sm" : "text-muted hover:text-text"
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {section === "homework" ? <HomeworkSection classId={classId} /> : <TablesSection classId={classId} />}
    </div>
  );
}

/* ─────────────────────────────── homework ─────────────────────────────── */

function HomeworkSection({ classId }: { classId: string }) {
  const { t } = useH();
  const qc = useQueryClient();
  const [view, setView] = useState<"active" | "all">("active");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<HwItem | null>(null);
  const key = ["homework-grid", classId, view];
  const q = useQuery({ queryKey: key, queryFn: () => api<Grid>(`/api/groups/${classId}/homework`, { query: { view } }) });

  const mark = useMutation({
    mutationFn: (v: { homeworkId: string; studentIds: string[]; partIds?: string[]; status: PartMark | null }) =>
      api(`/api/homework/${v.homeworkId}/marks`, { method: "POST", body: { studentIds: v.studentIds, partIds: v.partIds, status: v.status } }),
    // Optimistic: the box flips immediately; a failure restores the real state.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Grid>(key);
      if (prev) qc.setQueryData<Grid>(key, { ...prev, homework: prev.homework.map((h) => (h.id === v.homeworkId ? applyMarks(h, prev.students, v) : h)) });
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

      {d.homework.length === 0 ? (
        <Empty>{d.canAssign ? t("noneAdd") : t("none")}</Empty>
      ) : d.students.length === 0 ? (
        <Empty>{t("noStudents")}</Empty>
      ) : (
        <>
          <div className="text-xs text-muted">{t("hint")}</div>
          {d.homework.map((h, i) => (
            <HomeworkCard
              key={h.id}
              h={h}
              students={d.students}
              canAssign={d.canAssign}
              canCheck={d.canCheck}
              defaultOpen={i === 0}
              onMark={(v) => mark.mutate({ homeworkId: h.id, ...v })}
              onEdit={() => setEditing(h)}
            />
          ))}
        </>
      )}

      {adding && <HomeworkForm classId={classId} nextLessonAt={d.group.nextLessonAt} onClose={() => setAdding(false)} />}
      {editing && (
        <HomeworkForm
          classId={classId}
          nextLessonAt={d.group.nextLessonAt}
          existing={editing}
          canEdit={d.canAssign}
          canCheck={d.canCheck}
          onTickAll={(status) => {
            mark.mutate({ homeworkId: editing.id, studentIds: d.students.map((s) => s.id), status });
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** The marks after a change, for the optimistic update. */
function applyMarks(h: HwItem, students: { id: string }[], v: { studentIds: string[]; partIds?: string[]; status: PartMark | null }): HwItem {
  const marks: Marks = { ...h.marks };
  const partIds = v.partIds ?? h.parts.map((p) => p.id);
  for (const sid of v.studentIds) {
    const m = { ...(marks[sid] ?? {}) };
    for (const pid of partIds) {
      if (v.status) m[pid] = v.status;
      else delete m[pid];
    }
    marks[sid] = m;
  }
  const done = students.filter((s) => h.parts.every((p) => marks[s.id]?.[p.id] === "done")).length;
  return { ...h, marks, done };
}

function HomeworkCard({
  h,
  students,
  canAssign,
  canCheck,
  defaultOpen,
  onMark,
  onEdit,
}: {
  h: HwItem;
  students: { id: string; fullName: string }[];
  canAssign: boolean;
  canCheck: boolean;
  defaultOpen: boolean;
  onMark: (v: { studentIds: string[]; partIds?: string[]; status: PartMark | null }) => void;
  onEdit: () => void;
}) {
  const { t, locale } = useH();
  const [open, setOpen] = useState(defaultOpen);
  const past = new Date(h.dueAt).getTime() < Date.now();
  const multi = h.parts.length > 1;

  return (
    <Card className={`!p-0 ${h.status === "archived" ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${past ? "bg-bg text-muted" : "bg-primary/10 text-primary"}`}>
              {t("due", { d: fmtDue(h.dueAt, locale) })}
            </span>
            <span className={`font-semibold ${h.done === students.length ? "text-status-paid" : "text-muted"}`}>{t("done", { a: h.done, b: students.length })}</span>
            {h.status === "archived" && <span className="text-muted">· {t("archived")}</span>}
          </div>
          <ol className={`mt-1.5 space-y-0.5 text-sm ${open ? "" : "line-clamp-2"}`}>
            {h.parts.map((p, i) => (
              <li key={p.id} className="flex gap-2">
                {multi && <span className="w-4 shrink-0 text-right font-semibold text-muted">{i + 1}.</span>}
                <span className="font-medium">{p.text}</span>
              </li>
            ))}
          </ol>
          {open && h.instructions && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{h.instructions}</p>}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {(canAssign || canCheck) && (
            <button type="button" onClick={onEdit} className="rounded-lg p-1.5 text-muted hover:bg-bg hover:text-text" aria-label={t("edit")} title={t("edit")}>
              <Pencil size={16} />
            </button>
          )}
          <button type="button" onClick={() => setOpen(!open)} className="rounded-lg p-1.5 text-muted hover:bg-bg hover:text-text" aria-label={open ? "Collapse" : "Expand"}>
            <ChevronDown size={18} className={`transition ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-2 text-left font-semibold">{t("students")}</th>
                {h.parts.map((p, i) => (
                  <th key={p.id} className="px-2 py-2 text-center font-semibold" title={p.text}>
                    {multi ? i + 1 : t("homework")}
                  </th>
                ))}
                {multi && canCheck && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const m = h.marks[s.id] ?? {};
                const allDone = h.parts.every((p) => m[p.id] === "done");
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-1.5">
                      <Link href={`/student/${s.id}`} className="block max-w-[8.5rem] truncate font-medium hover:text-primary md:max-w-[14rem]" title={s.fullName}>
                        {s.fullName}
                      </Link>
                    </td>
                    {h.parts.map((p) => (
                      <td key={p.id} className="px-2 py-1.5">
                        <MarkPair
                          mark={m[p.id]}
                          disabled={!canCheck}
                          label={`${s.fullName}: ${p.text}`}
                          onChange={(status) => onMark({ studentIds: [s.id], partIds: [p.id], status })}
                        />
                      </td>
                    ))}
                    {multi && canCheck && (
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          disabled={allDone}
                          onClick={() => onMark({ studentIds: [s.id], status: "done" })}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-bg hover:text-status-paid disabled:opacity-30"
                          title={t("allParts")}
                        >
                          <CheckCheck size={15} /> <span className="hidden sm:inline">{t("allParts")}</span>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** A tick box and an X box for one student's part. Pressing the active one clears it. */
function MarkPair({ mark, disabled, label, onChange }: { mark?: PartMark; disabled: boolean; label: string; onChange: (m: PartMark | null) => void }) {
  const { t } = useH();
  const base = "grid h-8 w-8 place-items-center rounded-lg border-2 transition active:scale-95 disabled:cursor-default";
  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={mark === "done"}
        aria-label={`${label} — ${t("markDone")}`}
        title={t("markDone")}
        disabled={disabled}
        onClick={() => onChange(mark === "done" ? null : "done")}
        className={`${base} ${mark === "done" ? "border-status-paid bg-status-paid text-white" : "border-border bg-surface text-border hover:border-status-paid hover:text-status-paid"}`}
      >
        <Check size={17} strokeWidth={3} />
      </button>
      <button
        type="button"
        role="checkbox"
        aria-checked={mark === "missed"}
        aria-label={`${label} — ${t("markMissed")}`}
        title={t("markMissed")}
        disabled={disabled}
        onClick={() => onChange(mark === "missed" ? null : "missed")}
        className={`${base} ${mark === "missed" ? "border-danger bg-danger text-white" : "border-border bg-surface text-border hover:border-danger hover:text-danger"}`}
      >
        <X size={17} strokeWidth={3} />
      </button>
    </div>
  );
}

/* ─────────────────────────────── add / edit homework ─────────────────────────────── */

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
  canCheck = false,
  onTickAll,
  onClose,
}: {
  classId: string;
  nextLessonAt: string | null;
  existing?: HwItem;
  canEdit?: boolean;
  canCheck?: boolean;
  onTickAll?: (status: PartMark | null) => void;
  onClose: () => void;
}) {
  const { t } = useH();
  const qc = useQueryClient();
  const init = existing ? splitLocal(existing.dueAt) : nextLessonAt ? splitLocal(nextLessonAt) : { date: addDaysIso(tashkentDate(), 1), time: "18:00" };
  const [text, setText] = useState(existing ? existing.parts.map((p) => p.text).join("\n") : "");
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [notify, setNotify] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const parts = splitParts(text);
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["homework-grid", classId] });
    onClose();
  };
  const fail = (e: ApiError) => setErr(e.code === "validation" ? t("required") : e.message);

  const save = useMutation({
    mutationFn: () => {
      const body = { text, dueAt: tashkentInstant(date, time).toISOString() };
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
        {existing && onTickAll && canCheck && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => onTickAll("done")} className="inline-flex items-center justify-center gap-1.5">
              <CheckCheck size={16} /> {t("tickAll")}
            </Button>
            <Button variant="ghost" onClick={() => onTickAll(null)} className="inline-flex items-center justify-center gap-1.5">
              <X size={16} /> {t("clearAll")}
            </Button>
          </div>
        )}
        {canEdit ? (
          <>
            <Field label={t("text")}>
              <textarea
                className="input min-h-[120px] py-2 leading-relaxed"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={5000}
                placeholder={t("textPh")}
                autoFocus={!existing}
              />
            </Field>
            {parts.length > 0 && (
              <div className="rounded-xl bg-bg px-3 py-2 ring-1 ring-border">
                <div className="mb-1 text-xs font-semibold text-muted">{t("preview", { n: parts.length })}</div>
                <ul className="space-y-1 text-sm">
                  {parts.map((p, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-border bg-surface" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
            <Button className="w-full" disabled={save.isPending || parts.length === 0} onClick={() => save.mutate()}>
              {existing ? t("save") : t("add")}
            </Button>
            {existing && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" disabled={archive.isPending} onClick={() => archive.mutate()} className="inline-flex items-center justify-center gap-1">
                  <Archive size={15} /> {existing.status === "archived" ? t("unarchive") : t("archive")}
                </Button>
                <Button
                  variant="danger"
                  disabled={del.isPending}
                  onClick={() => window.confirm(t("confirmDelete")) && del.mutate()}
                  className="inline-flex items-center justify-center gap-1"
                >
                  <Trash2 size={15} /> {t("delete")}
                </Button>
              </div>
            )}
          </>
        ) : (
          existing && (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {existing.parts.map((p) => (
                <li key={p.id}>{p.text}</li>
              ))}
            </ol>
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

/* ─────────────────────────────── task tables ─────────────────────────────── */

function TablesSection({ classId }: { classId: string }) {
  const { t } = useH();
  const qc = useQueryClient();
  const [view, setView] = useState<"active" | "all">("active");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TrackerItem | null>(null);
  const key: QueryKey = ["homework-tables", classId, view];
  const q = useQuery({ queryKey: key, queryFn: () => api<Tables>(`/api/groups/${classId}/homework-tables`, { query: { view } }) });

  const tick = useMutation({
    mutationFn: (v: { trackerId: string; studentIds: string[]; columnId: string; done: boolean }) =>
      api(`/api/homework-tables/${v.trackerId}/ticks`, { method: "POST", body: { studentIds: v.studentIds, columnId: v.columnId, done: v.done } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Tables>(key);
      if (prev) {
        qc.setQueryData<Tables>(key, {
          ...prev,
          trackers: prev.trackers.map((tr) => {
            if (tr.id !== v.trackerId) return tr;
            const ticks = { ...tr.ticks };
            for (const sid of v.studentIds) {
              const cur = new Set(ticks[sid] ?? []);
              if (v.done) cur.add(v.columnId);
              else cur.delete(v.columnId);
              ticks[sid] = [...cur];
            }
            return { ...tr, ticks };
          }),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["homework-tables", classId] }),
  });

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Empty />;
  const d = q.data;

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
            <Plus size={16} /> {t("addTable")}
          </Button>
        )}
      </div>

      {d.trackers.length === 0 ? (
        <Empty>{d.canAssign ? t("noTablesAdd") : t("noTables")}</Empty>
      ) : d.students.length === 0 ? (
        <Empty>{t("noStudents")}</Empty>
      ) : (
        <>
          <div className="text-xs text-muted">{t("tableHint")}</div>
          {d.trackers.map((tr) => (
            <TrackerTable
              key={tr.id}
              tr={tr}
              students={d.students}
              canAssign={d.canAssign}
              canCheck={d.canCheck}
              onTick={(studentId, columnId, done) => tick.mutate({ trackerId: tr.id, studentIds: [studentId], columnId, done })}
              onEdit={() => setEditing(tr)}
            />
          ))}
        </>
      )}

      {adding && <TrackerForm classId={classId} onClose={() => setAdding(false)} />}
      {editing && <TrackerForm classId={classId} existing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TrackerTable({
  tr,
  students,
  canAssign,
  canCheck,
  onTick,
  onEdit,
}: {
  tr: TrackerItem;
  students: { id: string; fullName: string }[];
  canAssign: boolean;
  canCheck: boolean;
  onTick: (studentId: string, columnId: string, done: boolean) => void;
  onEdit: () => void;
}) {
  const { t } = useH();
  const n = tr.columns.length;
  const doneIn = (colId: string) => students.filter((s) => (tr.ticks[s.id] ?? []).includes(colId)).length;
  return (
    <Card className={`!p-0 ${tr.status === "archived" ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 px-4 py-3">
        <Table2 size={17} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1 truncate font-bold">{tr.title}</div>
        {tr.status === "archived" && <span className="text-xs text-muted">{t("archived")}</span>}
        {canAssign && (
          <button type="button" onClick={onEdit} className="rounded-lg p-1.5 text-muted hover:bg-bg hover:text-text" aria-label={t("editTable")} title={t("editTable")}>
            <Pencil size={16} />
          </button>
        )}
      </div>
      <div className="overflow-x-auto border-t border-border">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-2 text-left font-semibold">{t("students")}</th>
              {tr.columns.map((c) => (
                <th key={c.id} className="max-w-[96px] px-1.5 py-2 text-center align-bottom font-semibold" title={c.label}>
                  <div className="truncate">{c.label}</div>
                  <div className="text-[10px] font-normal">
                    {doneIn(c.id)}/{students.length}
                  </div>
                </th>
              ))}
              <th className="border-l border-border px-3 py-2 text-center font-semibold">{t("progress")}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const mine = new Set(tr.ticks[s.id] ?? []);
              const count = tr.columns.filter((c) => mine.has(c.id)).length;
              return (
                <tr key={s.id} className="border-t border-border">
                  <td className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-1.5">
                    <Link href={`/student/${s.id}`} className="block max-w-[8.5rem] truncate font-medium hover:text-primary md:max-w-[14rem]" title={s.fullName}>
                      {s.fullName}
                    </Link>
                  </td>
                  {tr.columns.map((c) => {
                    const on = mine.has(c.id);
                    return (
                      <td key={c.id} className="px-1.5 py-1.5 text-center">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={`${s.fullName}: ${c.label}`}
                          disabled={!canCheck}
                          onClick={() => onTick(s.id, c.id, !on)}
                          className={`inline-grid h-7 w-7 place-items-center rounded-full transition hover:scale-110 disabled:cursor-default disabled:hover:scale-100 ${
                            on ? "bg-status-paid/15 text-status-paid" : "bg-bg text-border hover:text-status-paid"
                          }`}
                        >
                          <Check size={15} strokeWidth={on ? 3 : 2} />
                        </button>
                      </td>
                    );
                  })}
                  <td className={`border-l border-border px-3 py-1.5 text-center text-xs font-bold ${count === n ? "text-status-paid" : "text-muted"}`}>
                    {count}/{n}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TrackerForm({ classId, existing, onClose }: { classId: string; existing?: TrackerItem; onClose: () => void }) {
  const { t } = useH();
  const qc = useQueryClient();
  // Plain numbered columns show as a count; named ones as their names.
  const numbered = existing ? existing.columns.every((c, i) => c.label === String(i + 1)) : true;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [count, setCount] = useState(String(existing?.columns.length ?? 10));
  const [labels, setLabels] = useState(existing && !numbered ? existing.columns.map((c) => c.label).join("\n") : "");
  const [err, setErr] = useState<string | null>(null);
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["homework-tables", classId] });
    onClose();
  };
  const fail = (e: ApiError) => setErr(e.code === "validation" ? t("tableRequired") : e.message);
  const save = useMutation({
    mutationFn: () => {
      const body = { title, columns: { count: Number(count) || undefined, labels } };
      return existing ? api(`/api/homework-tables/${existing.id}`, { method: "PATCH", body }) : api(`/api/groups/${classId}/homework-tables`, { method: "POST", body });
    },
    onSuccess: done,
    onError: fail,
  });
  const archive = useMutation({
    mutationFn: () => api(`/api/homework-tables/${existing!.id}`, { method: "PATCH", body: { status: existing!.status === "archived" ? "active" : "archived" } }),
    onSuccess: done,
    onError: fail,
  });
  const del = useMutation({ mutationFn: () => api(`/api/homework-tables/${existing!.id}`, { method: "DELETE" }), onSuccess: done, onError: fail });
  const named = labels.split("\n").some((l) => l.trim());

  return (
    <Modal open onClose={onClose} title={existing ? t("editTable") : t("addTable")}>
      <div className="space-y-3">
        <Field label={t("tableTitle")}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t("tableTitlePh")} autoFocus={!existing} />
        </Field>
        <Field label={t("count")}>
          <Input type="number" min={1} max={60} value={count} onChange={(e) => setCount(e.target.value)} disabled={named} className="!w-32" />
        </Field>
        <Field label={t("labels")}>
          <textarea className="input min-h-[80px] py-2" value={labels} onChange={(e) => setLabels(e.target.value)} maxLength={4000} />
          <div className="mt-1 text-xs text-muted">{t("labelsHint")}</div>
        </Field>
        {err && <div className="text-sm text-danger">{err}</div>}
        <Button className="w-full" disabled={save.isPending || !title.trim() || (!named && !(Number(count) >= 1))} onClick={() => save.mutate()}>
          {existing ? t("save") : t("addTable")}
        </Button>
        {existing && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" disabled={archive.isPending} onClick={() => archive.mutate()} className="inline-flex items-center justify-center gap-1">
              <Archive size={15} /> {existing.status === "archived" ? t("unarchive") : t("archive")}
            </Button>
            <Button
              variant="danger"
              disabled={del.isPending}
              onClick={() => window.confirm(t("confirmDeleteTable")) && del.mutate()}
              className="inline-flex items-center justify-center gap-1"
            >
              <Trash2 size={15} /> {t("delete")}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ─────────────────────────────── student profile ─────────────────────────────── */

type StudentHw = {
  summary: { assigned: number; done: number; missed: number; todo: number; rate: number | null };
  recent: { id: string; title: string; dueAt: string; partsDone: number; partsTotal: number; state: HomeworkState }[];
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
              {h.partsTotal > 1 && (
                <span className="text-xs font-semibold text-muted">
                  {h.partsDone}/{h.partsTotal}
                </span>
              )}
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${STATE_CLS[h.state]}`}>{t(`st_${h.state}` as HKey)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
