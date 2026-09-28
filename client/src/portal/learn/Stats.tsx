/** Learning statistics: streak, totals, 30-day history and achievements. */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Flame, Target, BookOpen, Dumbbell } from "lucide-react";
import type { ReactNode } from "react";
import { addDaysIso } from "@shared/lesson-schedule";
import { fmtDay } from "@shared/notifications";
import { PCard, PageSkeleton, ErrorState, SectionTitle } from "../ui";
import { lapi, type Stats } from "./api";
import { useLT } from "./i18n";
import { Badge } from "./ui";

export function StatsPage() {
  const { t, locale } = useLT();
  const q = useQuery({ queryKey: ["portal", "learn", "stats"], queryFn: () => lapi<Stats>("/stats") });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const s = q.data;

  // Last 30 days, oldest → newest, zero-filled.
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const byDay = new Map(s.history.map((h) => [h.day, h]));
  const days = Array.from({ length: 30 }, (_, k) => addDaysIso(today, k - 29));
  const maxXp = Math.max(10, ...s.history.map((h) => h.xp));

  return (
    <div className="space-y-3 animate-slide-up">
      <Link href="/learn" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft size={16} /> {t("learn")}
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("stats")}</h1>

      <div className="hero flex items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20">
          <Flame size={28} />
        </span>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white/85">{t("currentStreak")}</div>
          <div className="figure text-3xl font-extrabold">
            {s.streak} <span className="text-base font-bold">{t("days")}</span>
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-white/80">{t("bestStreak")}</div>
          <div className="figure text-lg font-extrabold">{s.longestStreak}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<BookOpen size={17} />} tone="bg-status-paid/15 text-status-paid" label={t("wordsLearned")} value={s.wordsLearned} sub={`${s.wordsSeen} ${t("wordsSeen").toLowerCase()}`} />
        <Stat icon={<Target size={17} />} tone="bg-primary-soft text-primary" label={t("accuracy")} value={s.accuracy == null ? "—" : `${s.accuracy}%`} sub={t("answersN", { n: s.answers })} />
        <Stat icon={<Dumbbell size={17} />} tone="bg-violet/15 text-violet" label={t("exercisesDone")} value={s.exercisesAnswered} sub={`${s.sessionsCompleted} ${t("sessions").toLowerCase()}`} />
        <Stat icon={<Flame size={17} />} tone="bg-warning/15 text-warning" label={t("xp")} value={s.xp} />
      </div>

      <SectionTitle>{t("last30")}</SectionTitle>
      <PCard>
        {s.history.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted">{t("noHistory")}</div>
        ) : (
          <>
            <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={t("last30")}>
              {days.map((d) => {
                const h = byDay.get(d);
                const pct = h ? Math.max(6, (h.xp / maxXp) * 100) : 0;
                return (
                  <div key={d} className="flex h-full flex-1 items-end" title={h ? `${fmtDay(d, locale)}: ${h.xp} XP` : fmtDay(d, locale)}>
                    <div className={`w-full rounded-t-[4px] ${h ? "bg-primary" : "bg-dark/[0.06]"}`} style={{ height: h ? `${pct}%` : "6%" }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>{fmtDay(days[0], locale)}</span>
              <span>{fmtDay(days[29], locale)}</span>
            </div>
          </>
        )}
      </PCard>

      {s.history.length > 0 && (
        <>
          <SectionTitle>{t("learningHistory")}</SectionTitle>
          <PCard className="!p-0">
            <ul className="divide-y divide-border">
              {[...s.history].reverse().slice(0, 10).map((h) => (
                <li key={h.day} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="w-20 shrink-0 font-bold">{fmtDay(h.day, locale)}</span>
                  <span className="flex-1 text-muted">
                    {t("cardsN", { n: h.cards })} · {t("answersN", { n: h.exercises })}
                  </span>
                  <span className="figure font-bold text-warning">+{h.xp}</span>
                </li>
              ))}
            </ul>
          </PCard>
        </>
      )}

      <SectionTitle>{t("achievements")}</SectionTitle>
      <PCard>
        <div className="grid grid-cols-3 gap-4">
          {s.achievements.map((a) => (
            <Badge key={a.code} code={a.code} earned={!!a.earnedAt} />
          ))}
        </div>
      </PCard>
    </div>
  );
}

function Stat({ icon, tone, label, value, sub }: { icon: ReactNode; tone: string; label: string; value: number | string; sub?: string }) {
  return (
    <PCard className="!p-3.5">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
        <span className={`grid h-7 w-7 place-items-center rounded-full ${tone}`}>{icon}</span>
        {label}
      </div>
      <div className="figure mt-2 text-2xl font-extrabold">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </PCard>
  );
}
