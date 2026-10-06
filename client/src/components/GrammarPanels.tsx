/**
 * Group page "Grammar" tab: per student the current topic, topics passed,
 * best test scores and whether they still have mistakes to fix. Access is
 * enforced by the API (their teacher or management); on 403 it shows empty.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { RotateCcw } from "lucide-react";
import { GRAMMAR_PASS_SCORE, GRAMMAR_TEST_SIZE, type GrammarClassProgress } from "@shared/grammar/types";
import { levelLabel } from "@shared/learning/types";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { formatDate } from "../lib/format";
import { Card, Empty, Spinner } from "./ui";

const L = {
  level: { en: "Level", uz: "Daraja" },
  notSet: { en: "not set", uz: "tanlanmagan" },
  topics: { en: "topics", uz: "mavzu" },
  noTopics: { en: "No published grammar topics for this level yet.", uz: "Bu daraja uchun grammatika mavzulari hali e'lon qilinmagan." },
  student: { en: "Student", uz: "O'quvchi" },
  current: { en: "Current topic", uz: "Joriy mavzu" },
  passed: { en: "Passed", uz: "O'tgan" },
  best: { en: "Best scores", uz: "Eng yaxshi natijalar" },
  lastActive: { en: "Last active", uz: "Oxirgi faollik" },
  never: { en: "never", uz: "hech qachon" },
  allDone: { en: "All passed", uz: "Hammasi o'tildi" },
  fixing: { en: "fixing mistakes", uz: "xatolarni tuzatmoqda" },
  notTaken: { en: "not taken", uz: "topshirmagan" },
} as const;

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

export function GroupGrammar({ classId }: { classId: string }) {
  const { locale } = useI18n();
  const l = (k: keyof typeof L) => L[k][locale];
  const q = useQuery({
    queryKey: ["group-grammar", classId],
    queryFn: () => api<GrammarClassProgress>(`/api/learning/grammar/class/${classId}`),
    retry: false,
  });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Empty />;
  const d = q.data;
  const topics = [...d.topics].sort((a, b) => a.position - b.position);
  const title = (slug: string | null) => {
    const t = topics.find((x) => x.slug === slug);
    return t ? (locale === "uz" ? t.title.uz || t.title.en : t.title.en) : slug ?? "";
  };
  const rows = [...d.students].sort((a, b) => b.passedCount - a.passedCount || a.fullName.localeCompare(b.fullName));
  const last = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10), locale) : l("never"));

  const header = (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">{l("level")}:</span>
      {d.level ? <span className="badge-pill">{levelLabel(d.level, locale)}</span> : <span className="chip">{l("notSet")}</span>}
      {topics.length > 0 && (
        <span className="text-xs text-muted">
          {topics.length} {l("topics")}
        </span>
      )}
    </div>
  );
  if (topics.length === 0) return <>{header}<Empty>{l("noTopics")}</Empty></>;
  if (rows.length === 0) return <>{header}<Empty /></>;

  /** Small chips "1: 8.5" per topic, coloured by pass/fail (with the number always shown). */
  const scores = (best: Record<string, number | null>) => (
    <div className="flex flex-wrap gap-1">
      {topics.map((t) => {
        const s = best[t.slug];
        const cls = s == null ? "bg-bg text-muted" : s >= GRAMMAR_PASS_SCORE ? "bg-status-paid/15 text-status-paid" : "bg-danger/10 text-danger";
        return (
          <span key={t.slug} title={`${title(t.slug)}: ${s == null ? l("notTaken") : `${fmt(s)} / ${GRAMMAR_TEST_SIZE}`}`} className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${cls}`}>
            {t.position}: {s == null ? "—" : fmt(s)}
          </span>
        );
      })}
    </div>
  );
  const fixing = (
    <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">
      <RotateCcw size={11} /> {l("fixing")}
    </span>
  );

  return (
    <>
      {header}
      {/* Phones: stacked rows. */}
      <Card className="divide-y divide-border !p-0 sm:hidden">
        {rows.map((r) => (
          <Link key={r.studentId} href={`/student/${r.studentId}`} className="block px-4 py-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 font-semibold leading-tight">{r.fullName}</div>
              <b className="shrink-0 text-sm">
                {r.passedCount}/{topics.length}
              </b>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>{r.currentTopic ? `${l("current")}: ${title(r.currentTopic)}` : l("allDone")}</span>
              {r.reviewPending && fixing}
            </div>
            <div className="mt-1.5">{scores(r.best)}</div>
            <div className="mt-1 text-[11px] text-muted">
              {l("lastActive")}: {last(r.lastActiveAt)}
            </div>
          </Link>
        ))}
      </Card>
      <Card className="hidden overflow-x-auto !p-0 sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">{l("student")}</th>
              <th className="px-2 py-2.5">{l("current")}</th>
              <th className="px-2 py-2.5">{l("passed")}</th>
              <th className="px-2 py-2.5">{l("best")}</th>
              <th className="px-2 py-2.5">{l("lastActive")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td className="px-4 py-2.5">
                  <Link href={`/student/${r.studentId}`} className="font-semibold hover:text-primary">
                    {r.fullName}
                  </Link>
                </td>
                <td className="px-2 py-2.5">
                  <div>{r.currentTopic ? title(r.currentTopic) : <span className="text-status-paid">{l("allDone")}</span>}</div>
                  {r.reviewPending && <div className="mt-0.5">{fixing}</div>}
                </td>
                <td className="px-2 py-2.5 font-bold">
                  {r.passedCount}/{topics.length}
                </td>
                <td className="px-2 py-2.5">{scores(r.best)}</td>
                <td className="whitespace-nowrap px-2 py-2.5 text-muted">{last(r.lastActiveAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
