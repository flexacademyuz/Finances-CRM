/**
 * Staff homework: the check queue (assistants' main screen), current and past
 * assignments, one assignment's per-student status, the create form, and the
 * check dialog. Also exports the group tab and the student-profile panel.
 * Access is enforced by the API; the UI only hides what can't be used.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  Hourglass,
  ExternalLink,
  Paperclip,
  BookOpen,
  Trash2,
  Archive,
  ChevronRight,
} from "lucide-react";
import { api, apiUpload, type ApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { fmtDue, type HomeworkState } from "@shared/homework";
import { addDaysIso, tashkentDate, tashkentInstant } from "@shared/lesson-schedule";
import { levelLabel } from "@shared/learning/types";
import { Button, Card, Empty, Field, Input, Modal, Segmented, Select, Spinner } from "../components/ui";
import { AddFileTile, FileThumb, prepareUpload, type HwFile } from "../components/HomeworkFiles";

/* ─────────────────────────────── strings ─────────────────────────────── */

const H = {
  homework: { en: "Homework", uz: "Uy vazifasi" },
  toCheck: { en: "To check", uz: "Tekshirish" },
  current: { en: "Current", uz: "Joriy" },
  past: { en: "Past", uz: "O'tgan" },
  allGroups: { en: "All groups", uz: "Barcha guruhlar" },
  newHomework: { en: "New homework", uz: "Yangi vazifa" },
  nothingToCheck: { en: "Nothing waiting to be checked.", uz: "Tekshirish uchun hech narsa yo'q." },
  noHomework: { en: "No homework here yet.", uz: "Hozircha uy vazifasi yo'q." },
  due: { en: "Due {d}", uz: "Muddat: {d}" },
  handedIn: { en: "{a}/{b} handed in", uz: "{b} tadan {a} topshirdi" },
  waiting: { en: "{n} to check", uz: "{n} ta tekshirish" },
  late: { en: "late", uz: "kechikkan" },
  attempt: { en: "attempt {n}", uz: "{n}-urinish" },
  files: { en: "{n} files", uz: "{n} fayl" },
  group: { en: "Group", uz: "Guruh" },
  type: { en: "Type", uz: "Turi" },
  task: { en: "Task", uz: "Topshiriq" },
  vocabulary: { en: "Vocabulary", uz: "Lug'at" },
  title: { en: "Title", uz: "Sarlavha" },
  instructions: { en: "Instructions", uz: "Ko'rsatma" },
  instructionsPh: { en: "What should students do?", uz: "O'quvchilar nima qilishi kerak?" },
  link: { en: "Link (optional)", uz: "Havola (ixtiyoriy)" },
  dueDate: { en: "Deadline", uz: "Muddat" },
  nextLesson: { en: "Next lesson", uz: "Keyingi dars" },
  tomorrow: { en: "Tomorrow", uz: "Ertaga" },
  inWeek: { en: "In a week", uz: "Bir haftada" },
  maxScore: { en: "Max mark (optional)", uz: "Maksimal baho (ixtiyoriy)" },
  maxScoreHint: { en: "With a max mark, checkers give a mark that also appears in the student's scores.", uz: "Maksimal baho berilsa, tekshiruvchi baho qo'yadi va u o'quvchi baholarida ham ko'rinadi." },
  stage: { en: "Stage", uz: "Bosqich" },
  target: { en: "Goal: words learned", uz: "Maqsad: o'rganilgan so'zlar" },
  vocabHint: { en: "Completes automatically when a student has learned this share of the stage's words in the app.", uz: "O'quvchi ilovada bosqich so'zlarining shu qismini o'rgangach, avtomatik bajarilgan bo'ladi." },
  noSet: { en: "This group has no published vocabulary for its level.", uz: "Bu guruh darajasi uchun lug'at e'lon qilinmagan." },
  attach: { en: "Attach", uz: "Biriktirish" },
  notify: { en: "Notify students now", uz: "O'quvchilarga hozir xabar berish" },
  create: { en: "Set homework", uz: "Vazifa berish" },
  save: { en: "Save", uz: "Saqlash" },
  students: { en: "Students", uz: "O'quvchilar" },
  st_todo: { en: "Not yet", uz: "Hali yo'q" },
  st_overdue: { en: "Missing", uz: "Topshirmagan" },
  st_submitted: { en: "To check", uz: "Tekshirish kerak" },
  st_returned: { en: "Returned", uz: "Qaytarilgan" },
  st_done: { en: "Done", uz: "Bajarildi" },
  check: { en: "Check", uz: "Tekshirish" },
  view: { en: "View", uz: "Ko'rish" },
  answer: { en: "Answer", uz: "Javob" },
  noAnswerText: { en: "No written answer.", uz: "Yozma javob yo'q." },
  mark: { en: "Mark", uz: "Baho" },
  feedback: { en: "Feedback for the student", uz: "O'quvchiga izoh" },
  feedbackPh: { en: "What was good, what to fix…", uz: "Nima yaxshi, nimani tuzatish kerak…" },
  accept: { en: "Accept", uz: "Qabul qilish" },
  returnIt: { en: "Return for revision", uz: "Qayta ishlashga qaytarish" },
  checkedBy: { en: "Checked by {n}", uz: "Tekshirdi: {n}" },
  autoDone: { en: "Completed in the vocabulary app", uz: "Lug'at ilovasida bajarildi" },
  submittedAt: { en: "Handed in {d}", uz: "Topshirildi: {d}" },
  edit: { en: "Edit", uz: "Tahrirlash" },
  archive: { en: "Archive", uz: "Arxivlash" },
  unarchive: { en: "Restore", uz: "Tiklash" },
  delete: { en: "Delete", uz: "O'chirish" },
  confirmDelete: { en: "Delete this homework and all submissions?", uz: "Bu vazifa va barcha javoblar o'chirilsinmi?" },
  archived: { en: "Archived", uz: "Arxivlangan" },
  accepted: { en: "accepted", uz: "qabul qilindi" },
  returned: { en: "returned", uz: "qaytarildi" },
  missing: { en: "missing", uz: "topshirmagan" },
  learnedOf: { en: "{a}/{b} words", uz: "{a}/{b} so'z" },
  hwSummary: { en: "{d}/{a} done · {o} on time · {l} late · {m} missing", uz: "{a} tadan {d} bajarilgan · {o} o'z vaqtida · {l} kechikkan · {m} topshirmagan" },
  avgMark: { en: "Average mark {p}%", uz: "O'rtacha baho {p}%" },
  required: { en: "Fill in the title and the deadline.", uz: "Sarlavha va muddatni kiriting." },
  next: { en: "{n} more waiting", uz: "Yana {n} ta kutmoqda" },
} as const;
type HKey = keyof typeof H;

function useH() {
  const { locale } = useI18n();
  const t = (k: HKey, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce<string>((s, [a, b]) => s.replaceAll(`{${a}}`, String(b)), H[k][locale]);
  return { t, locale };
}

/* ─────────────────────────────── types ─────────────────────────────── */

type Counts = { students: number; handedIn: number; toCheck: number; accepted: number; returned: number; late: number; missing: number };
type HwRow = {
  id: string;
  classId: string;
  kind: "task" | "vocabulary";
  title: string;
  instructions: string | null;
  linkUrl: string | null;
  unitId: string | null;
  targetPercent: number | null;
  dueAt: string;
  maxScore: number | null;
  status: string;
  className?: string;
  teacherName?: string | null;
  counts?: Counts;
};
type QueueItem = {
  id: string;
  homeworkId: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  title: string;
  maxScore: number | null;
  dueAt: string;
  attempt: number;
  submittedAt: string | null;
  late: boolean;
  preview: string | null;
  hasLink: boolean;
  files: number;
};
type Meta = {
  canAssign: boolean;
  canCheck: boolean;
  groups: {
    id: string;
    name: string;
    level: string | null;
    set: { id: string; title: string; level: string | null } | null;
    stages: { id: string; position: number; words: number }[];
    nextLessonAt: string | null;
  }[];
};
type Submission = {
  id: string;
  status: string;
  answerText: string | null;
  linkUrl: string | null;
  attempt: number;
  submittedAt: string | null;
  late: boolean;
  auto: boolean;
  score: number | null;
  feedback: string | null;
  checkedAt: string | null;
  checkedBy: string | null;
  files: HwFile[];
};
type Detail = {
  homework: HwRow;
  group: { id: string; name: string };
  stage: { id: string; position: number } | null;
  files: HwFile[];
  counts: Counts;
  canEdit: boolean;
  canCheck: boolean;
  students: {
    studentId: string;
    fullName: string;
    state: HomeworkState;
    vocab: { learned: number; total: number; percent: number } | null;
    submission: Submission | null;
  }[];
};

const STATE: Record<HomeworkState, { cls: string; Icon: typeof Clock }> = {
  todo: { cls: "bg-bg text-muted", Icon: Clock },
  overdue: { cls: "bg-danger/10 text-danger", Icon: AlertTriangle },
  submitted: { cls: "bg-warning/15 text-warning", Icon: Hourglass },
  returned: { cls: "bg-violet/15 text-violet", Icon: RotateCcw },
  done: { cls: "bg-status-paid/15 text-status-paid", Icon: CheckCircle2 },
};

function StatePill({ state }: { state: HomeworkState }) {
  const { t } = useH();
  const s = STATE[state];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${s.cls}`}>
      <s.Icon size={12} /> {t(`st_${state}` as HKey)}
    </span>
  );
}

const useMeta = () => useQuery({ queryKey: ["homework-meta"], queryFn: () => api<Meta>("/api/homework/meta"), staleTime: 60_000 });

/* ─────────────────────────────── main page ─────────────────────────────── */

export function HomeworkPage() {
  const { t } = useH();
  const meta = useMeta();
  const [tab, setTab] = useState<"check" | "current" | "past">(() => (new URLSearchParams(window.location.search).get("tab") as "current") || "check");
  const [classId, setClassId] = useState("");
  const [creating, setCreating] = useState(false);
  const queue = useQuery({ queryKey: ["homework-queue"], queryFn: () => api<QueueItem[]>("/api/homework/queue"), refetchInterval: 60_000 });
  const filteredQueue = (queue.data ?? []).filter((q) => !classId || q.classId === classId);
  const groupOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of meta.data?.groups ?? []) m.set(g.id, g.name);
    for (const q of queue.data ?? []) m.set(q.classId, q.className);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [meta.data, queue.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ClipboardCheck size={22} /> {t("homework")}
        </h1>
        {meta.data?.canAssign && (
          <Button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5">
            <Plus size={16} /> {t("newHomework")}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "check", label: `${t("toCheck")}${queue.data?.length ? ` (${queue.data.length})` : ""}` },
            { value: "current", label: t("current") },
            { value: "past", label: t("past") },
          ]}
        />
        {groupOptions.length > 1 && (
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="!w-auto min-w-[160px]">
            <option value="">{t("allGroups")}</option>
            {groupOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {tab === "check" ? (
        queue.isLoading ? (
          <Spinner />
        ) : filteredQueue.length === 0 ? (
          <Empty>{t("nothingToCheck")}</Empty>
        ) : (
          <CheckQueue items={filteredQueue} />
        )
      ) : (
        <HomeworkList view={tab === "past" ? "past" : "active"} classId={classId || undefined} />
      )}

      {creating && meta.data && <CreateHomeworkModal meta={meta.data} onClose={() => setCreating(false)} />}
    </div>
  );
}

function CheckQueue({ items }: { items: QueueItem[] }) {
  const { t, locale } = useH();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((q, i) => (
          <button key={q.id} type="button" onClick={() => setOpen(i)} className="text-left">
            <Card className="h-full !p-3.5 transition hover:shadow-card-hover">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{q.studentName}</div>
                  <div className="truncate text-xs text-muted">
                    {q.className} · {q.title}
                  </div>
                </div>
                <ChevronRight size={16} className="mt-1 shrink-0 text-muted" />
              </div>
              {q.preview && <div className="mt-2 line-clamp-2 text-sm text-muted">{q.preview}</div>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                {q.submittedAt && <span className="chip">{fmtDue(q.submittedAt, locale)}</span>}
                {q.late && <span className="rounded-full bg-danger/10 px-2 py-0.5 font-bold text-danger">{t("late")}</span>}
                {q.attempt > 1 && <span className="rounded-full bg-violet/15 px-2 py-0.5 font-bold text-violet">{t("attempt", { n: q.attempt })}</span>}
                {q.files > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-muted">
                    <Paperclip size={11} /> {t("files", { n: q.files })}
                  </span>
                )}
                {q.hasLink && <ExternalLink size={11} className="text-muted" />}
              </div>
            </Card>
          </button>
        ))}
      </div>
      {open != null && items[open] && (
        <CheckModal
          homeworkId={items[open].homeworkId}
          studentId={items[open].studentId}
          remaining={items.length - 1}
          onClose={() => setOpen(null)}
          onDone={() => setOpen(items.length > 1 ? Math.min(open, items.length - 2) : null)}
        />
      )}
    </>
  );
}

function HomeworkList({ view, classId }: { view: "active" | "past" | "all"; classId?: string }) {
  const { t } = useH();
  const q = useQuery({
    queryKey: ["homework-list", view, classId ?? ""],
    queryFn: () => api<HwRow[]>("/api/homework", { query: { view, classId } }),
  });
  if (q.isLoading) return <Spinner />;
  if (!q.data?.length) return <Empty>{t("noHomework")}</Empty>;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {q.data.map((h) => (
        <HomeworkCard key={h.id} h={h} />
      ))}
    </div>
  );
}

function HomeworkCard({ h }: { h: HwRow }) {
  const { t, locale } = useH();
  const c = h.counts;
  const past = new Date(h.dueAt).getTime() < Date.now();
  return (
    <Link href={`/homework/${h.id}`} className="block">
      <Card className="h-full !p-3.5 transition hover:shadow-card-hover">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {h.kind === "vocabulary" ? <BookOpen size={14} className="shrink-0 text-violet" /> : <ClipboardList size={14} className="shrink-0 text-primary" />}
              <span className="truncate font-semibold">{h.title}</span>
            </div>
            <div className="truncate text-xs text-muted">
              {h.className}
              {h.teacherName ? ` · ${h.teacherName}` : ""}
            </div>
          </div>
          {h.status === "archived" && <span className="chip">{t("archived")}</span>}
        </div>
        <div className={`mt-1.5 text-xs ${past ? "text-muted" : "font-semibold text-text"}`}>{t("due", { d: fmtDue(h.dueAt, locale) })}</div>
        {c && (
          <>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-dark/[0.07]">
              <div className="bg-status-paid" style={{ width: `${(c.accepted / Math.max(1, c.students)) * 100}%` }} />
              <div className="bg-warning" style={{ width: `${(c.toCheck / Math.max(1, c.students)) * 100}%` }} />
              <div className="bg-violet" style={{ width: `${(c.returned / Math.max(1, c.students)) * 100}%` }} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
              <span>{t("handedIn", { a: c.handedIn, b: c.students })}</span>
              {c.toCheck > 0 && <span className="font-bold text-warning">{t("waiting", { n: c.toCheck })}</span>}
              {past && c.missing > 0 && <span className="text-danger">{c.missing} {t("missing")}</span>}
            </div>
          </>
        )}
      </Card>
    </Link>
  );
}

/* ─────────────────────────────── detail ─────────────────────────────── */

export function HomeworkDetailPage() {
  const { t, locale } = useH();
  const { id } = useParams<{ id: string }>();
  const [, go] = useLocation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["homework", id], queryFn: () => api<Detail>(`/api/homework/${id}`) });
  const [checking, setChecking] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["homework"] });
    void qc.invalidateQueries({ queryKey: ["homework-list"] });
    void qc.invalidateQueries({ queryKey: ["homework-queue"] });
  };
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/api/homework/${id}`, { method: "PATCH", body }),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: () => api(`/api/homework/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      go("/homework?tab=current");
    },
  });
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Empty />;
  const d = q.data;
  const h = d.homework;
  const order: Record<HomeworkState, number> = { submitted: 0, returned: 1, overdue: 2, todo: 3, done: 4 };
  const rows = [...d.students].sort((a, b) => order[a.state] - order[b.state] || a.fullName.localeCompare(b.fullName));

  return (
    <div className="space-y-4">
      <Link href="/homework?tab=current" className="inline-flex items-center gap-1 text-sm text-tg-link">
        <ArrowLeft size={16} /> {t("homework")}
      </Link>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              <Link href={`/class/${d.group.id}?tab=homework`} className="hover:text-primary">
                {d.group.name}
              </Link>
              {" · "}
              {h.kind === "vocabulary" ? t("vocabulary") : t("task")}
              {h.status === "archived" ? ` · ${t("archived")}` : ""}
            </div>
            <h1 className="text-lg font-bold">{h.title}</h1>
            <div className="text-sm text-muted">
              {t("due", { d: fmtDue(h.dueAt, locale) })}
              {h.maxScore != null ? ` · ${t("mark")}: /${h.maxScore}` : ""}
              {d.stage ? ` · ${t("stage")} ${d.stage.position} · ${h.targetPercent}%` : ""}
            </div>
          </div>
          {d.canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setEditing(true)}>
                {t("edit")}
              </Button>
              <Button variant="ghost" onClick={() => patch.mutate({ status: h.status === "archived" ? "active" : "archived" })} className="inline-flex items-center gap-1">
                <Archive size={15} /> {h.status === "archived" ? t("unarchive") : t("archive")}
              </Button>
              <Button variant="danger" onClick={() => window.confirm(t("confirmDelete")) && del.mutate()} className="inline-flex items-center gap-1">
                <Trash2 size={15} /> {t("delete")}
              </Button>
            </div>
          )}
        </div>
        {h.instructions && <p className="mt-3 whitespace-pre-wrap text-sm">{h.instructions}</p>}
        {h.linkUrl && (
          <a href={h.linkUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
            <ExternalLink size={14} /> {h.linkUrl}
          </a>
        )}
        {d.files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {d.files.map((f) => (
              <FileThumb key={f.id} file={f} src={`/api/homework/files/${f.id}`} size={64} />
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>{t("handedIn", { a: d.counts.handedIn, b: d.counts.students })}</span>
          {h.kind === "task" && (
            <>
              <span className="text-warning">{t("waiting", { n: d.counts.toCheck })}</span>
              <span className="text-status-paid">
                {d.counts.accepted} {t("accepted")}
              </span>
              <span className="text-violet">
                {d.counts.returned} {t("returned")}
              </span>
            </>
          )}
          {d.counts.late > 0 && (
            <span className="text-muted">
              {d.counts.late} {t("late")}
            </span>
          )}
        </div>
      </Card>

      <Card className="overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">{t("students")}</th>
              <th className="px-2 py-2.5" />
              <th className="px-2 py-2.5">{h.kind === "vocabulary" ? t("vocabulary") : t("mark")}</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td className="px-4 py-2.5">
                  <Link href={`/student/${r.studentId}`} className="font-semibold hover:text-primary">
                    {r.fullName}
                  </Link>
                  {r.submission?.submittedAt && (
                    <div className="text-[11px] text-muted">
                      {fmtDue(r.submission.submittedAt, locale)}
                      {r.submission.late ? ` · ${t("late")}` : ""}
                      {r.submission.checkedBy ? ` · ${t("checkedBy", { n: r.submission.checkedBy })}` : ""}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <StatePill state={r.state} />
                </td>
                <td className="px-2 py-2.5">
                  {r.vocab ? (
                    <span className="whitespace-nowrap text-xs">
                      <b>{r.vocab.percent}%</b> <span className="text-muted">{t("learnedOf", { a: r.vocab.learned, b: r.vocab.total })}</span>
                    </span>
                  ) : r.submission?.score != null ? (
                    <b>
                      {r.submission.score}/{h.maxScore}
                    </b>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-right">
                  {h.kind === "task" && r.submission && (
                    <Button variant={r.state === "submitted" ? "primary" : "ghost"} className="!px-3 !py-1.5 text-xs" onClick={() => setChecking(r.studentId)}>
                      {r.state === "submitted" && d.canCheck ? t("check") : t("view")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {checking && <CheckModal homeworkId={h.id} studentId={checking} onClose={() => setChecking(null)} onDone={() => setChecking(null)} />}
      {editing && <EditHomeworkModal h={h} onClose={() => setEditing(false)} onSaved={invalidate} />}
    </div>
  );
}

/* ─────────────────────────────── check dialog ─────────────────────────────── */

function CheckModal({
  homeworkId,
  studentId,
  remaining = 0,
  onClose,
  onDone,
}: {
  homeworkId: string;
  studentId: string;
  remaining?: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, locale } = useH();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["homework", homeworkId], queryFn: () => api<Detail>(`/api/homework/${homeworkId}`) });
  const row = q.data?.students.find((s) => s.studentId === studentId);
  const sub = row?.submission ?? null;
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setScore(sub?.score != null ? String(sub.score) : "");
    setFeedback(sub?.feedback ?? "");
    setErr(null);
  }, [sub?.id, sub?.score, sub?.feedback]);

  const m = useMutation({
    mutationFn: (decision: "accept" | "return") =>
      api(`/api/homework/submissions/${sub!.id}/check`, {
        method: "POST",
        body: { decision, score: score === "" ? null : Number(score), feedback },
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["homework"] }),
        qc.invalidateQueries({ queryKey: ["homework-queue"] }),
        qc.invalidateQueries({ queryKey: ["homework-list"] }),
      ]);
      onDone();
    },
    onError: (e: ApiError) => setErr(e.message),
  });

  const h = q.data?.homework;
  const canCheck = !!q.data?.canCheck && !!sub && !sub.auto;
  return (
    <Modal open onClose={onClose} title={row ? row.fullName : t("check")}>
      {!q.data || !h ? (
        <Spinner />
      ) : !sub ? (
        <Empty />
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-muted">
            {q.data.group.name} · <b className="text-text">{h.title}</b>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <StatePill state={row!.state} />
            {sub.submittedAt && <span className="chip">{t("submittedAt", { d: fmtDue(sub.submittedAt, locale) })}</span>}
            {sub.late && <span className="rounded-full bg-danger/10 px-2 py-0.5 font-bold text-danger">{t("late")}</span>}
            {sub.attempt > 1 && <span className="rounded-full bg-violet/15 px-2 py-0.5 font-bold text-violet">{t("attempt", { n: sub.attempt })}</span>}
          </div>
          {sub.auto ? (
            <div className="rounded-xl bg-status-paid/10 px-3 py-2 text-sm font-semibold text-status-paid">{t("autoDone")}</div>
          ) : (
            <>
              <div>
                <span className="label">{t("answer")}</span>
                {sub.answerText ? (
                  <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-bg px-3 py-2 text-sm">{sub.answerText}</div>
                ) : (
                  <div className="text-sm text-muted">{t("noAnswerText")}</div>
                )}
                {sub.linkUrl && (
                  <a href={sub.linkUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 break-all text-sm font-semibold text-primary">
                    <ExternalLink size={14} /> {sub.linkUrl}
                  </a>
                )}
              </div>
              {sub.files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sub.files.map((f) => (
                    <FileThumb key={f.id} file={f} src={`/api/homework/files/${f.id}`} size={88} />
                  ))}
                </div>
              )}
            </>
          )}
          {sub.checkedBy && <div className="text-xs text-muted">{t("checkedBy", { n: sub.checkedBy })}</div>}
          {canCheck && (
            <>
              {h.maxScore != null && (
                <Field label={`${t("mark")} (0–${h.maxScore})`}>
                  <Input type="number" inputMode="decimal" min={0} max={h.maxScore} step="0.5" value={score} onChange={(e) => setScore(e.target.value)} />
                </Field>
              )}
              <Field label={t("feedback")}>
                <textarea className="input min-h-[88px] py-2" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={t("feedbackPh")} maxLength={3000} />
              </Field>
              {err && <div className="text-sm text-danger">{err}</div>}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" disabled={m.isPending} onClick={() => m.mutate("return")} className="inline-flex items-center justify-center gap-1">
                  <RotateCcw size={15} /> {t("returnIt")}
                </Button>
                <Button disabled={m.isPending} onClick={() => m.mutate("accept")} className="inline-flex items-center justify-center gap-1">
                  <CheckCircle2 size={15} /> {t("accept")}
                </Button>
              </div>
              {remaining > 0 && <div className="text-center text-xs text-muted">{t("next", { n: remaining })}</div>}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ─────────────────────────────── create / edit ─────────────────────────────── */

/** Split an instant into Tashkent date + time inputs. */
function splitLocal(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}

export function CreateHomeworkModal({ meta, classId, onClose }: { meta: Meta; classId?: string; onClose: () => void }) {
  const { t, locale } = useH();
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState(classId ?? meta.groups[0]?.id ?? "");
  const g = meta.groups.find((x) => x.id === groupId);
  const [kind, setKind] = useState<"task" | "vocabulary">("task");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [link, setLink] = useState("");
  const defaultDue = () => (g?.nextLessonAt ? splitLocal(g.nextLessonAt) : { date: addDaysIso(tashkentDate(), 1), time: "18:00" });
  const [date, setDate] = useState(defaultDue().date);
  const [time, setTime] = useState(defaultDue().time);
  const [maxScore, setMaxScore] = useState("");
  const [unitId, setUnitId] = useState("");
  const [target, setTarget] = useState("90");
  const [notify, setNotify] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = defaultDue();
    setDate(d.date);
    setTime(d.time);
    setUnitId(g?.stages[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const quick = (which: "lesson" | "tomorrow" | "week") => {
    if (which === "lesson" && g?.nextLessonAt) {
      const s = splitLocal(g.nextLessonAt);
      setDate(s.date);
      setTime(s.time);
    } else {
      setDate(addDaysIso(tashkentDate(), which === "tomorrow" ? 1 : 7));
      setTime("18:00");
    }
  };

  const save = async () => {
    const stage = g?.stages.find((s) => s.id === unitId);
    const finalTitle = title.trim() || (kind === "vocabulary" && stage ? `${t("vocabulary")}: ${t("stage")} ${stage.position}` : "");
    if (!groupId || !finalTitle || !date || !time) return setErr(t("required"));
    setBusy(true);
    setErr(null);
    try {
      const hw = await api<{ id: string }>(`/api/groups/${groupId}/homework`, {
        method: "POST",
        body: {
          kind,
          title: finalTitle,
          instructions,
          linkUrl: link,
          dueAt: tashkentInstant(date, time).toISOString(),
          maxScore: kind === "task" && maxScore ? Number(maxScore) : null,
          unitId: kind === "vocabulary" ? unitId : null,
          targetPercent: kind === "vocabulary" ? Number(target) : null,
          notify,
        },
      });
      for (const f of files) {
        const { blob, name } = await prepareUpload(f);
        await apiUpload(`/api/homework/${hw.id}/files`, blob, name);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["homework-list"] }),
        qc.invalidateQueries({ queryKey: ["group-homework"] }),
      ]);
      onClose();
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae.code === "validation" ? t("required") : ae.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t("newHomework")}>
      <div className="space-y-3">
        {!classId && (
          <Field label={t("group")}>
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {meta.groups.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.level ? ` · ${levelLabel(x.level, locale)}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Segmented
          full
          value={kind}
          onChange={setKind}
          options={[
            { value: "task", label: t("task") },
            { value: "vocabulary", label: t("vocabulary") },
          ]}
        />
        {kind === "vocabulary" &&
          (g?.set && g.stages.length ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label={`${t("stage")} · ${levelLabel(g.set.level, locale)}`}>
                <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  {g.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {t("stage")} {s.position} ({s.words})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("target")}>
                <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {[50, 70, 80, 90, 100].map((p) => (
                    <option key={p} value={p}>
                      {p}%
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="col-span-2 -mt-1 text-xs text-muted">{t("vocabHint")}</div>
            </div>
          ) : (
            <div className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">{t("noSet")}</div>
          ))}
        <Field label={t("title")}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder={kind === "vocabulary" ? `${t("vocabulary")}: ${t("stage")} …` : ""} />
        </Field>
        <Field label={t("instructions")}>
          <textarea className="input min-h-[96px] py-2" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={t("instructionsPh")} maxLength={5000} />
        </Field>
        <Field label={t("dueDate")}>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="!w-36" />
          </div>
        </Field>
        <div className="-mt-1 flex flex-wrap gap-1.5">
          {g?.nextLessonAt && <QuickChip onClick={() => quick("lesson")}>{t("nextLesson")}</QuickChip>}
          <QuickChip onClick={() => quick("tomorrow")}>{t("tomorrow")}</QuickChip>
          <QuickChip onClick={() => quick("week")}>{t("inWeek")}</QuickChip>
        </div>
        {kind === "task" && (
          <>
            <Field label={t("maxScore")}>
              <Input type="number" inputMode="decimal" min={1} max={1000} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} placeholder="10" />
            </Field>
            <div className="-mt-2 text-xs text-muted">{t("maxScoreHint")}</div>
            <Field label={t("link")}>
              <Input value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" placeholder="https://" />
            </Field>
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={i} className="chip inline-flex items-center gap-1">
                  <Paperclip size={12} /> <span className="max-w-[140px] truncate">{f.name}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label="Remove">
                    ×
                  </button>
                </span>
              ))}
              {files.length < 6 && <AddFileTile onFiles={(l) => setFiles([...files, ...l].slice(0, 6))} label={t("attach")} size={56} />}
            </div>
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t("notify")}
        </label>
        {err && <div className="text-sm text-danger">{err}</div>}
        <Button className="w-full" disabled={busy || (kind === "vocabulary" && !unitId)} onClick={() => void save()}>
          {t("create")}
        </Button>
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

function EditHomeworkModal({ h, onClose, onSaved }: { h: HwRow; onClose: () => void; onSaved: () => void }) {
  const { t } = useH();
  const init = splitLocal(h.dueAt);
  const [title, setTitle] = useState(h.title);
  const [instructions, setInstructions] = useState(h.instructions ?? "");
  const [link, setLink] = useState(h.linkUrl ?? "");
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [maxScore, setMaxScore] = useState(h.maxScore != null ? String(h.maxScore) : "");
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      api(`/api/homework/${h.id}`, {
        method: "PATCH",
        body: {
          title,
          instructions,
          linkUrl: link,
          dueAt: tashkentInstant(date, time).toISOString(),
          ...(h.kind === "task" ? { maxScore: maxScore ? Number(maxScore) : null } : {}),
        },
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e: ApiError) => setErr(e.code === "validation" ? t("required") : e.message),
  });
  return (
    <Modal open onClose={onClose} title={t("edit")}>
      <div className="space-y-3">
        <Field label={t("title")}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
        </Field>
        <Field label={t("instructions")}>
          <textarea className="input min-h-[96px] py-2" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={5000} />
        </Field>
        <Field label={t("dueDate")}>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="!w-36" />
          </div>
        </Field>
        {h.kind === "task" && (
          <>
            <Field label={t("maxScore")}>
              <Input type="number" min={1} max={1000} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
            </Field>
            <Field label={t("link")}>
              <Input value={link} onChange={(e) => setLink(e.target.value)} />
            </Field>
          </>
        )}
        {err && <div className="text-sm text-danger">{err}</div>}
        <Button className="w-full" disabled={m.isPending} onClick={() => m.mutate()}>
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────── embeds ─────────────────────────────── */

/** Group page tab: this group's homework + "New homework". */
export function GroupHomework({ classId }: { classId: string }) {
  const { t } = useH();
  const meta = useMeta();
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"active" | "past">("active");
  const canAssign = !!meta.data?.groups.some((g) => g.id === classId);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "active", label: t("current") },
            { value: "past", label: t("past") },
          ]}
        />
        {canAssign && (
          <Button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5">
            <Plus size={16} /> {t("newHomework")}
          </Button>
        )}
      </div>
      <HomeworkList view={view} classId={classId} />
      {creating && meta.data && <CreateHomeworkModal meta={meta.data} classId={classId} onClose={() => setCreating(false)} />}
    </div>
  );
}

type StudentHw = {
  summary: { assigned: number; done: number; submitted: number; overdue: number; onTime: number; late: number; averagePercent: number | null };
  recent: { id: string; title: string; kind: string; dueAt: string; state: HomeworkState; late: boolean; score: number | null; maxScore: number | null }[];
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
          {t("hwSummary", { d: s.done, a: s.assigned, o: s.onTime, l: s.late, m: s.overdue })}
          {s.averagePercent != null && <span className="ml-2 font-bold">{t("avgMark", { p: s.averagePercent })}</span>}
        </div>
        <div className="divide-y divide-border">
          {q.data.recent.slice(0, 8).map((h) => (
            <Link key={h.id} href={`/homework/${h.id}`} className="flex items-center gap-2 py-2 text-sm hover:text-primary">
              <span className="min-w-0 flex-1 truncate">{h.title}</span>
              <span className="hidden text-xs text-muted sm:inline">{fmtDue(h.dueAt, locale)}</span>
              {h.score != null && h.maxScore != null && (
                <b className="text-xs">
                  {h.score}/{h.maxScore}
                </b>
              )}
              <StatePill state={h.state} />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
