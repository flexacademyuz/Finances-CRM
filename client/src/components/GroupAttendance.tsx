/**
 * Take / edit a group's attendance for a date. Built for speed on a phone:
 * one tap per student (P / L / A / E), "All present" to start, notes and
 * "left early" behind a per-row menu, and a sticky Save bar that appears only
 * when something changed.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CheckCheck, MoreHorizontal, Ban, RotateCcw, Lock, History, Check } from "lucide-react";
import type { AttendanceStatus } from "@shared/schema";
import { summarize } from "@shared/attendance";
import { addDaysIso, tashkentDate } from "@shared/lesson-schedule";
import { api } from "../lib/api";
import { useI18n, type StringKey } from "../lib/i18n";
import { haptic } from "../lib/telegram";
import { formatDate } from "../lib/format";
import { Button, Card, Empty, Field, Input, Modal, Spinner } from "./ui";

type Sheet = {
  group: { id: string; name: string; room: string | null; schedule: string | null };
  date: string;
  lesson: { id: string; status: "held" | "cancelled"; topic: string | null; cancelReason: string | null; startTime: string | null } | null;
  scheduled: { start: string; end: string } | null;
  roster: { id: string; fullName: string; active: boolean; inGroup: boolean }[];
  records: { studentId: string; status: AttendanceStatus; note: string | null }[];
  canEdit: boolean;
  lockedReason: string | null;
  editDays: number;
};

type Mark = { status: AttendanceStatus | null; note: string };

const QUICK: { s: AttendanceStatus; k: StringKey; short: string; cls: string }[] = [
  { s: "present", k: "att_present", short: "P", cls: "bg-status-paid text-white" },
  { s: "late", k: "att_late", short: "L", cls: "bg-status-awaiting text-white" },
  { s: "absent", k: "att_absent", short: "A", cls: "bg-status-overdue text-white" },
  { s: "excused", k: "att_excused", short: "E", cls: "bg-primary text-white" },
];

export const ATT_BG: Record<AttendanceStatus, string> = {
  present: "bg-status-paid",
  late: "bg-status-awaiting",
  absent: "bg-status-overdue",
  excused: "bg-primary",
  left_early: "bg-violet",
};

export function GroupAttendance({ classId, initialDate }: { classId: string; initialDate?: string }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const [date, setDate] = useState(initialDate ?? tashkentDate());
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [topic, setTopic] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const today = tashkentDate();

  const q = useQuery({
    queryKey: ["attendance-sheet", classId, date],
    queryFn: () => api<Sheet>(`/api/groups/${classId}/attendance`, { query: { date } }),
  });

  // Reset local edits from the server state whenever the sheet (re)loads.
  useEffect(() => {
    if (!q.data) return;
    const m: Record<string, Mark> = {};
    for (const s of q.data.roster) {
      const r = q.data.records.find((x) => x.studentId === s.id);
      m[s.id] = { status: r?.status ?? null, note: r?.note ?? "" };
    }
    setMarks(m);
    setTopic(q.data.lesson?.topic ?? "");
  }, [q.data]);

  const saved = useMemo(() => {
    const m: Record<string, Mark> = {};
    for (const r of q.data?.records ?? []) m[r.studentId] = { status: r.status, note: r.note ?? "" };
    return m;
  }, [q.data]);

  const dirty =
    Object.entries(marks).some(([id, m]) => (m.status ?? null) !== (saved[id]?.status ?? null) || (m.note ?? "") !== (saved[id]?.note ?? "")) ||
    (topic || "") !== (q.data?.lesson?.topic ?? "");
  const unmarked = Object.values(marks).filter((m) => !m.status).length;
  const summary = summarize(Object.values(marks).flatMap((m) => (m.status ? [m.status] : [])));

  const save = useMutation({
    mutationFn: () =>
      api(`/api/groups/${classId}/attendance`, {
        method: "PUT",
        body: {
          date,
          topic: topic.trim() || null,
          records: Object.entries(marks)
            .filter(([, m]) => m.status)
            .map(([studentId, m]) => ({ studentId, status: m.status, note: m.note.trim() || null })),
        },
      }),
    onSuccess: () => {
      haptic("success");
      qc.invalidateQueries({ queryKey: ["attendance-sheet", classId] });
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-history", classId] });
    },
    onError: () => haptic("error"),
  });

  const restore = useMutation({
    mutationFn: () => api(`/api/groups/${classId}/lessons/restore`, { method: "POST", body: { date } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance-sheet", classId] }),
  });

  const set = (id: string, patch: Partial<Mark>) => {
    haptic("light");
    setMarks((m) => ({ ...m, [id]: { ...(m[id] ?? { status: null, note: "" }), ...patch } }));
  };
  const allPresent = () => {
    haptic("light");
    setMarks((m) => Object.fromEntries(Object.entries(m).map(([id, v]) => [id, { ...v, status: v.status ?? "present" }])));
  };

  const data = q.data;
  const editable = !!data?.canEdit && data.lesson?.status !== "cancelled";
  const menuStudent = data?.roster.find((s) => s.id === menuFor);

  return (
    <div className="space-y-3">
      {/* Date navigator */}
      <Card className="flex items-center gap-2 !p-3">
        <button className="grid h-9 w-9 place-items-center rounded-full bg-bg" onClick={() => setDate(addDaysIso(date, -1))} aria-label="Previous day">
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-bold">
            {date === today ? `${t("today")} · ` : ""}
            {formatDate(date + "T00:00:00", locale)}
          </div>
          <div className="text-xs text-muted">
            {data?.lesson?.startTime ?? data?.scheduled?.start ?? ""}
            {data?.group.room ? ` · ${data.group.room}` : ""}
            {!data?.scheduled && !data?.lesson ? t("noLessonScheduled") : ""}
          </div>
        </div>
        <button
          className="grid h-9 w-9 place-items-center rounded-full bg-bg disabled:opacity-30"
          disabled={date >= today}
          onClick={() => setDate(addDaysIso(date, 1))}
          aria-label="Next day"
        >
          <ChevronRight size={18} />
        </button>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="w-9 cursor-pointer rounded-full bg-bg p-2 text-transparent [color-scheme:light]"
          aria-label={t("date")}
        />
      </Card>

      {q.isLoading || !data ? (
        <Spinner />
      ) : data.lesson?.status === "cancelled" ? (
        <Card className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-2 text-lg font-bold text-status-overdue"><Ban size={18} /> {t("lessonCancelled")}</div>
          {data.lesson.cancelReason && <div className="text-sm text-muted">{data.lesson.cancelReason}</div>}
          {data.canEdit && (
            <Button variant="ghost" onClick={() => restore.mutate()} disabled={restore.isPending}>
              <RotateCcw size={15} /> {t("restoreLesson")}
            </Button>
          )}
        </Card>
      ) : data.roster.length === 0 ? (
        <Empty />
      ) : (
        <>
          {!data.canEdit && (
            <div className="flex items-center gap-2 rounded-btn bg-warning/10 px-3 py-2 text-sm text-warning">
              <Lock size={15} />
              {data.lockedReason === "locked"
                ? t("attendanceLocked").replace("{n}", String(data.editDays))
                : data.lockedReason === "future"
                  ? t("futureDateNote")
                  : t("viewOnly")}
            </div>
          )}

          {/* Live tally + quick actions */}
          <div className="flex flex-wrap items-center gap-2">
            {QUICK.map((qk) => {
              const n = Object.values(marks).filter((m) => m.status === qk.s).length;
              return (
                <span key={qk.s} className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-2.5 py-1 text-xs font-semibold shadow-card">
                  <span className={`h-2 w-2 rounded-full ${ATT_BG[qk.s]}`} />
                  {t(qk.k)} {n}
                </span>
              );
            })}
            {summary.rate != null && <span className="text-xs font-semibold text-muted">· {summary.rate}%</span>}
            <div className="flex-1" />
            {editable && unmarked > 0 && (
              <Button variant="ghost" className="!py-1.5" onClick={allPresent}>
                <CheckCheck size={15} /> {t("markAllPresent")}
              </Button>
            )}
          </div>

          <Card className="!p-0">
            {data.roster.map((s, i) => {
              const m = marks[s.id] ?? { status: null, note: "" };
              return (
                <div key={s.id} className={`flex items-center gap-2 px-3 py-2.5 ${i ? "border-t border-border" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-semibold ${!s.inGroup ? "text-muted line-through" : ""}`}>{s.fullName}</div>
                    {(m.note || m.status === "left_early") && (
                      <div className="truncate text-xs text-muted">
                        {m.status === "left_early" ? `${t("att_left_early")}${m.note ? " · " : ""}` : ""}
                        {m.note}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {QUICK.map((qk) => (
                      <button
                        key={qk.s}
                        disabled={!editable}
                        onClick={() => set(s.id, { status: m.status === qk.s ? null : qk.s })}
                        title={t(qk.k)}
                        aria-label={`${s.fullName}: ${t(qk.k)}`}
                        aria-pressed={m.status === qk.s}
                        className={`h-9 w-9 rounded-xl text-sm font-extrabold transition active:scale-90 disabled:opacity-60 ${
                          m.status === qk.s ? qk.cls : "bg-bg text-muted"
                        }`}
                      >
                        {qk.short}
                      </button>
                    ))}
                    <button
                      disabled={!editable}
                      onClick={() => setMenuFor(s.id)}
                      aria-label={`${s.fullName}: ${t("more")}`}
                      className={`grid h-9 w-8 place-items-center rounded-xl disabled:opacity-60 ${
                        m.status === "left_early" ? "bg-violet text-white" : "bg-bg text-muted"
                      }`}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </Card>

          {editable && (
            <Field label={t("topicOptional")}>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} />
            </Field>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              <History size={15} /> {t("history")}
            </Button>
            {data.canEdit && !data.lesson && date >= today && (
              <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                <Ban size={15} /> {t("cancelLesson")}
              </Button>
            )}
          </div>

          {save.isError && <div className="text-sm text-status-overdue">{(save.error as Error).message}</div>}

          {/* Sticky save bar */}
          {editable && (dirty || save.isPending) && (
            <div className="sticky bottom-20 z-20 md:bottom-4">
              <Button className="w-full !py-3 shadow-card-hover" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? t("loading") : `${t("saveAttendance")}${unmarked ? ` · ${unmarked} ${t("unmarked")}` : ""}`}
              </Button>
            </div>
          )}
          {save.isSuccess && !dirty && <div className="flex items-center justify-center gap-1 text-sm font-semibold text-status-paid"><Check size={15} /> {t("attendanceSaved")}</div>}
        </>
      )}

      {showHistory && <AttendanceHistory classId={classId} />}

      {menuStudent && (
        <Modal open onClose={() => setMenuFor(null)} title={menuStudent.fullName}>
          <div className="space-y-3">
            <button
              onClick={() => set(menuStudent.id, { status: marks[menuStudent.id]?.status === "left_early" ? null : "left_early" })}
              className={`btn w-full ${marks[menuStudent.id]?.status === "left_early" ? "btn-primary" : "btn-ghost"}`}
            >
              {t("att_left_early")}
            </button>
            <Field label={t("note")}>
              <Input
                value={marks[menuStudent.id]?.note ?? ""}
                onChange={(e) => set(menuStudent.id, { note: e.target.value })}
                maxLength={500}
                placeholder={t("notePlaceholder")}
              />
            </Field>
            <Button className="w-full" onClick={() => setMenuFor(null)}>
              {t("done")}
            </Button>
          </div>
        </Modal>
      )}

      {cancelOpen && <CancelLessonModal classId={classId} date={date} onClose={() => setCancelOpen(false)} />}
    </div>
  );
}

function CancelLessonModal({ classId, date, onClose }: { classId: string; date: string; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => api(`/api/groups/${classId}/lessons/cancel`, { method: "POST", body: { date, reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-sheet", classId] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={t("cancelLesson")}>
      <div className="space-y-3">
        <p className="text-sm text-muted">{t("cancelLessonNote")}</p>
        <Field label={t("reason")}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
        {m.isError && <div className="text-sm text-status-overdue">{(m.error as Error).message}</div>}
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="danger" className="flex-1" disabled={!reason.trim() || m.isPending} onClick={() => m.mutate()}>
            {t("cancelLesson")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

type History = {
  from: string;
  to: string;
  lessons: { id: string; lessonDate: string; status: "held" | "cancelled" }[];
  records: { lessonId: string; studentId: string; status: AttendanceStatus }[];
  students: { id: string; fullName: string; summary: { rate: number | null } | null }[];
};

/** Last 30 days as a students × lessons grid (read-only). */
function AttendanceHistory({ classId }: { classId: string }) {
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ["attendance-history", classId],
    queryFn: () => api<History>(`/api/groups/${classId}/attendance/history`),
  });
  if (q.isLoading || !q.data) return <Spinner />;
  const { lessons, records, students } = q.data;
  const held = [...lessons].reverse();
  const cell = new Map(records.map((r) => [`${r.studentId}|${r.lessonId}`, r.status]));
  if (held.length === 0) return <Empty>{t("noLessonsYet")}</Empty>;
  return (
    <Card className="overflow-x-auto !p-0">
      <table className="w-max min-w-full border-collapse text-xs">
        <thead>
          <tr className="text-muted">
            <th className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-2 text-left font-semibold">{t("student")}</th>
            {held.map((l) => (
              <th key={l.id} className="px-1 py-2 text-center font-semibold">
                {l.lessonDate.slice(8, 10)}.{l.lessonDate.slice(5, 7)}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-semibold">%</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <td className="sticky left-0 z-10 max-w-[9rem] truncate border-r border-border bg-surface px-3 py-1.5 font-medium">{s.fullName}</td>
              {held.map((l) => {
                const st = cell.get(`${s.id}|${l.id}`);
                return (
                  <td key={l.id} className="px-1 py-1.5 text-center">
                    {l.status === "cancelled" ? (
                      <span className="text-muted">—</span>
                    ) : st ? (
                      <span className={`inline-block h-4 w-4 rounded-md ${ATT_BG[st]}`} title={t(`att_${st}` as StringKey)} />
                    ) : (
                      <span className="inline-block h-4 w-4 rounded-md bg-bg" />
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-right font-bold">{s.summary?.rate ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
