/**
 * Staff views of vocabulary progress: one student's profile panel and a
 * group's table (who is progressing, who is struggling). Access is enforced by
 * the API (their teacher or management); on 403 the panels hide quietly.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, BookOpen } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { formatDate } from "../lib/format";
import { Card, Empty, Spinner } from "./ui";
import { levelLabel } from "@shared/learning/types";

const L = {
  vocab: { en: "Vocabulary", uz: "Lug'at" },
  learned: { en: "learned", uz: "o'rganildi" },
  mastered: { en: "mastered", uz: "o'zlashtirildi" },
  progress: { en: "Progress", uz: "Natija" },
  time7: { en: "Time (7 d)", uz: "Vaqt (7 kun)" },
  timeInApp: { en: "In the app", uz: "Ilovada" },
  today: { en: "today", uz: "bugun" },
  week: { en: "7 days", uz: "7 kun" },
  studied: { en: "studied", uz: "ko'rilgan" },
  needPractice: { en: "need practice", uz: "mashq kerak" },
  accuracy: { en: "Accuracy", uz: "Aniqlik" },
  streak: { en: "Streak", uz: "Seriya" },
  days: { en: "days", uz: "kun" },
  stage: { en: "Stage", uz: "Bosqich" },
  difficult: { en: "Difficult words", uz: "Qiyin so'zlar" },
  notStarted: { en: "Hasn't started vocabulary practice yet.", uz: "Hali lug'at mashqini boshlamagan." },
  student: { en: "Student", uz: "O'quvchi" },
  last30: { en: "30-day accuracy", uz: "30 kunlik aniqlik" },
  lastActive: { en: "Last active", uz: "Oxirgi faollik" },
  struggling: { en: "struggling", uz: "qiynalmoqda" },
  never: { en: "never", uz: "hech qachon" },
  level: { en: "Level", uz: "Daraja" },
  notSet: { en: "not set (Beginner is used)", uz: "tanlanmagan (Boshlang'ich ishlatiladi)" },
  noSetYet: { en: "No published vocabulary for this level yet: students get Beginner.", uz: "Bu daraja uchun lug'at hali e'lon qilinmagan: o'quvchilar Boshlang'ichni o'rganadi." },
  words: { en: "words", uz: "so'z" },
} as const;

type Stage = {
  id: string;
  position: number;
  total: number;
  seen: number;
  learned: number;
  mastered: number;
  learning: number;
  needPractice: number;
  percent: number;
  completed: boolean;
};
type StudentLearning =
  | { available: false }
  | {
      available: true;
      sets: { resourceId: string; level: string | null; title: string; stages: Stage[] }[];
      stages: Stage[];
      stats: {
        wordsSeen: number;
        wordsLearned: number;
        wordsMastered: number;
        needPractice: number;
        accuracy: number | null;
        streak: number;
        xp: number;
        secondsToday: number;
        seconds7d: number;
      };
      difficult: { id: string; word: string; translation: string; stage: number; correct: number; incorrect: number }[];
    };

/** "1h 25m" / "12m" / "0m". */
export function fmtMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

function useL() {
  const { locale } = useI18n();
  return (k: keyof typeof L) => L[k][locale];
}

export function StudentLearningPanel({ studentId }: { studentId: string }) {
  const l = useL();
  const { locale } = useI18n();
  const q = useQuery({
    queryKey: ["student-learning", studentId],
    queryFn: () => api<StudentLearning>(`/api/learning/students/${studentId}`),
    retry: false,
  });
  if (q.error || !q.data || !q.data.available) return null;
  const d = q.data;
  const s = d.stats;
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
        <BookOpen size={17} /> {l("vocab")}
      </h2>
      <Card className="space-y-3">
        {s.wordsSeen === 0 ? (
          <div className="text-sm text-muted">{l("notStarted")}</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span>
                <b className="figure text-lg">{s.wordsSeen}</b> {l("studied")}
              </span>
              <span>
                <b className="figure text-lg">{s.wordsLearned}</b> {l("learned")}
              </span>
              <span>
                <b className="figure text-lg">{s.wordsMastered}</b> {l("mastered")}
              </span>
              <span className={s.needPractice ? "text-danger" : ""}>
                <b className="figure text-lg">{s.needPractice}</b> {l("needPractice")}
              </span>
              <span>
                {l("accuracy")}: <b>{s.accuracy == null ? "—" : `${s.accuracy}%`}</b>
              </span>
              <span>
                {l("streak")}: <b>{s.streak}</b> {l("days")}
              </span>
              <span>
                {l("timeInApp")}: <b>{fmtMinutes(s.secondsToday)}</b> {l("today")} · <b>{fmtMinutes(s.seconds7d)}</b> {l("week")}
              </span>
            </div>
            {d.sets.map((set) => (
              <div key={set.resourceId}>
                {set.level && <div className="mb-1.5"><span className="badge-pill">{levelLabel(set.level, locale)}</span></div>}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {set.stages.map((st) => (
                    <div key={st.id} className="rounded-xl bg-bg px-2.5 py-2">
                      <div className="flex justify-between text-xs font-semibold text-muted">
                        <span>
                          {l("stage")} {st.position}
                        </span>
                        <span className={st.completed ? "text-status-paid" : ""}>{st.percent}%</span>
                      </div>
                      <div
                        className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-dark/[0.07]"
                        title={`${st.seen} ${l("studied")} · ${st.learned} ${l("learned")} · ${st.mastered} ${l("mastered")} / ${st.total}`}
                      >
                        <div className="bg-status-paid" style={{ width: `${(st.mastered / Math.max(1, st.total)) * 100}%` }} />
                        <div className="bg-primary/60" style={{ width: `${((st.learned - st.mastered) / Math.max(1, st.total)) * 100}%` }} />
                        <div className="bg-warning/60" style={{ width: `${((st.seen - st.learned) / Math.max(1, st.total)) * 100}%` }} />
                      </div>
                      <div className="mt-1 text-[10px] text-muted">
                        {st.learned}/{st.total} {l("learned")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {d.difficult.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{l("difficult")}</div>
                <div className="flex flex-wrap gap-1.5">
                  {d.difficult.map((w) => (
                    <span key={w.id} className="chip" title={`${w.translation} · ${w.correct}/${w.correct + w.incorrect}`}>
                      <b className="text-text">{w.word}</b> {w.translation}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

type GroupRow = {
  studentId: string;
  fullName: string;
  seen?: number;
  learned?: number;
  mastered?: number;
  needPractice?: number;
  seconds7d?: number;
  practisedDays7d?: number;
  accuracy30?: number | null;
  lastActiveAt?: string | null;
  percent: number;
  struggling: boolean;
};

export function GroupLearning({ classId }: { classId: string }) {
  const l = useL();
  const { locale } = useI18n();
  const q = useQuery({
    queryKey: ["group-learning", classId],
    queryFn: () =>
      api<{ level: string | null; set: { id: string; title: string; level: string | null } | null; totalWords: number; students: GroupRow[] }>(
        `/api/learning/classes/${classId}`,
      ),
    retry: false,
  });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Empty />;
  const d = q.data;
  const rows = [...d.students].sort((a, b) => Number(b.struggling) - Number(a.struggling) || b.percent - a.percent);
  const header = (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">{l("level")}:</span>
      {d.level ? <span className="badge-pill">{levelLabel(d.level, locale)}</span> : <span className="chip">{l("notSet")}</span>}
      {d.level && !d.set && <span className="text-xs text-warning">{l("noSetYet")}</span>}
      {d.set && (
        <span className="text-xs text-muted">
          {d.totalWords} {l("words")}
        </span>
      )}
    </div>
  );
  if (rows.length === 0) return <>{header}<Empty /></>;
  return (
    <>
    {header}
    {/* Phones: one stacked row per student instead of a 6-column table. */}
    <Card className="divide-y divide-border !p-0 sm:hidden">
      {rows.map((r) => (
        <Link key={r.studentId} href={`/student/${r.studentId}`} className="block px-4 py-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 font-semibold leading-tight">{r.fullName}</div>
            <b className="shrink-0">{r.percent}%</b>
          </div>
          {r.struggling && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">
              <AlertTriangle size={11} /> {l("struggling")}
            </span>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            <span>{r.learned ?? 0} {l("learned")} · {r.mastered ?? 0} {l("mastered")}</span>
            <span className={(r.needPractice ?? 0) > 0 ? "font-bold text-danger" : ""}>
              {l("needPractice")}: {r.needPractice ?? 0}
            </span>
            <span>{l("last30")}: {r.accuracy30 == null ? "—" : `${r.accuracy30}%`}</span>
            <span>
              {l("time7")}: {fmtMinutes(r.seconds7d ?? 0)}
              {r.practisedDays7d ? ` · ${r.practisedDays7d}/7` : ""}
            </span>
          </div>
        </Link>
      ))}
    </Card>
    <Card className="hidden overflow-x-auto !p-0 sm:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2.5">{l("student")}</th>
            <th className="px-2 py-2.5">{l("progress")}</th>
            <th className="px-2 py-2.5">{l("needPractice")}</th>
            <th className="px-2 py-2.5">{l("last30")}</th>
            <th className="px-2 py-2.5">{l("time7")}</th>
            <th className="hidden px-2 py-2.5 sm:table-cell">{l("lastActive")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.studentId}>
              <td className="px-4 py-2.5">
                <Link href={`/student/${r.studentId}`} className="font-semibold hover:text-primary">
                  {r.fullName}
                </Link>
                {r.struggling && (
                  <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">
                    <AlertTriangle size={11} /> {l("struggling")}
                  </span>
                )}
              </td>
              <td className="px-2 py-2.5">
                <b>{r.percent}%</b>{" "}
                <span className="whitespace-nowrap text-xs text-muted">
                  {r.learned ?? 0} {l("learned")} · {r.mastered ?? 0} {l("mastered")}
                </span>
              </td>
              <td className={`px-2 py-2.5 ${(r.needPractice ?? 0) > 0 ? "font-bold text-danger" : "text-muted"}`}>{r.needPractice ?? 0}</td>
              <td className="px-2 py-2.5">{r.accuracy30 == null ? "—" : `${r.accuracy30}%`}</td>
              <td className="whitespace-nowrap px-2 py-2.5">
                {fmtMinutes(r.seconds7d ?? 0)}
                {r.practisedDays7d ? <span className="text-xs text-muted"> · {r.practisedDays7d}/7</span> : null}
              </td>
              <td className="hidden px-2 py-2.5 text-muted sm:table-cell">
                {r.lastActiveAt ? formatDate(r.lastActiveAt.slice(0, 10), locale) : l("never")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
    </>
  );
}
