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

const L = {
  vocab: { en: "Vocabulary", uz: "Lug'at" },
  learned: { en: "learned", uz: "o'rganildi" },
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
} as const;

type Stage = { id: string; position: number; total: number; mastered: number; learning: number; needPractice: number; percent: number; completed: boolean };
type StudentLearning =
  | { available: false }
  | {
      available: true;
      stages: Stage[];
      stats: { wordsSeen: number; wordsLearned: number; needPractice: number; accuracy: number | null; streak: number; xp: number };
      difficult: { id: string; word: string; translation: string; stage: number; correct: number; incorrect: number }[];
    };

function useL() {
  const { locale } = useI18n();
  return (k: keyof typeof L) => L[k][locale];
}

export function StudentLearningPanel({ studentId }: { studentId: string }) {
  const l = useL();
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
                <b className="figure text-lg">{s.wordsLearned}</b> {l("learned")}
              </span>
              <span>
                <b className="figure text-lg">{s.wordsSeen}</b> {l("studied")}
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
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {d.stages.map((st) => (
                <div key={st.id} className="rounded-xl bg-bg px-2.5 py-2">
                  <div className="flex justify-between text-xs font-semibold text-muted">
                    <span>
                      {l("stage")} {st.position}
                    </span>
                    <span className={st.completed ? "text-status-paid" : ""}>{st.percent}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-dark/[0.07]">
                    <div className="h-full rounded-full bg-status-paid" style={{ width: `${st.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
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
  mastered?: number;
  needPractice?: number;
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
    queryFn: () => api<{ totalWords: number; students: GroupRow[] }>(`/api/learning/classes/${classId}`),
    retry: false,
  });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Empty />;
  const rows = [...q.data.students].sort((a, b) => Number(b.struggling) - Number(a.struggling) || b.percent - a.percent);
  if (rows.length === 0) return <Empty />;
  return (
    <Card className="overflow-x-auto !p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2.5">{l("student")}</th>
            <th className="px-2 py-2.5">{l("learned")}</th>
            <th className="px-2 py-2.5">{l("needPractice")}</th>
            <th className="px-2 py-2.5">{l("last30")}</th>
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
                <b>{r.mastered ?? 0}</b> <span className="text-muted">({r.percent}%)</span>
              </td>
              <td className={`px-2 py-2.5 ${(r.needPractice ?? 0) > 0 ? "font-bold text-danger" : "text-muted"}`}>{r.needPractice ?? 0}</td>
              <td className="px-2 py-2.5">{r.accuracy30 == null ? "—" : `${r.accuracy30}%`}</td>
              <td className="hidden px-2 py-2.5 text-muted sm:table-cell">
                {r.lastActiveAt ? formatDate(r.lastActiveAt.slice(0, 10), locale) : l("never")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
