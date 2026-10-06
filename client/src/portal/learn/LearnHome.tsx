/** Learn tab: today's task first, then stages and quick practice entries. */
import { Link } from "wouter";
import { ChevronRight, Dumbbell, Star, AlertTriangle, BarChart3, Check, Layers } from "lucide-react";
import type { ReactNode } from "react";
import { PCard, PageSkeleton, ErrorState, SectionTitle, EmptyState } from "../ui";
import { useLT } from "./i18n";
import { LevelBar, TodayCard, StageBar, useLearnHome } from "./ui";
import type { ApiError } from "../../lib/api";
import { GrammarCard } from "./grammar/GrammarPages";

export function LearnHomePage() {
  const { t } = useLT();
  const q = useLearnHome();
  if (q.isLoading) return <PageSkeleton />;
  // Grammar stands on its own: show it even when there is no vocabulary for this level.
  if ((q.error as ApiError | null)?.code === "no_content")
    return (
      <div className="space-y-3 animate-slide-up">
        <GrammarCard />
        <EmptyState icon={<Layers size={24} />} title={t("notAvailable")} />
      </div>
    );
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const d = q.data;
  const cur = d.currentStage;

  return (
    <div className="space-y-3 animate-slide-up">
      <LevelBar />
      <TodayCard />
      <GrammarCard />

      {/* Overall progress */}
      <Link href="/stats" className="block">
        <PCard className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-muted">{t("overall")}</div>
            <div className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="font-extrabold">{t("wordsLearnedOf", { a: d.totals.learned, b: d.totals.words })}</span>
              <span className="figure text-sm font-extrabold text-primary">{d.totals.percent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-dark/[0.07]">
              <div className="h-full rounded-full bg-status-paid transition-[width] duration-700" style={{ width: `${d.totals.percent}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-muted">
              {d.totals.mastered} {t("mastered").toLowerCase()} · {d.totals.seen} {t("wordsSeen").toLowerCase()}
            </div>
          </div>
          <div className="text-right">
            <div className="figure text-2xl font-extrabold text-primary">{d.xp}</div>
            <div className="text-[11px] font-bold text-muted">{t("xp")}</div>
          </div>
          <ChevronRight size={18} className="text-muted" />
        </PCard>
      </Link>

      {/* Quick practice */}
      <div className="grid grid-cols-2 gap-3">
        {cur && (
          <Tile href={`/learn/cards?mode=learn&unit=${cur.id}`} icon={<Layers size={18} />} tone="bg-primary-soft text-primary" label={t("continueLearning")} />
        )}
        <Tile href="/learn/practice?source=mixed" icon={<Dumbbell size={18} />} tone="bg-violet/15 text-violet" label={t("mixedPractice")} />
        <Tile
          href="/learn/cards?mode=difficult"
          icon={<AlertTriangle size={18} />}
          tone="bg-danger/10 text-danger"
          label={t("reviewDifficult")}
          badge={d.totals.needPractice || undefined}
        />
        <Tile href="/learn/bookmarks" icon={<Star size={18} />} tone="bg-warning/15 text-warning" label={t("bookmarks")} badge={d.totals.bookmarked || undefined} />
      </div>

      {/* Stages */}
      <SectionTitle
        action={
          <Link href="/stats" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
            <BarChart3 size={15} /> {t("stats")}
          </Link>
        }
      >
        {t("stages")}
      </SectionTitle>
      <div className="space-y-2">
        {d.stages.map((s) => {
          const isCurrent = cur?.id === s.id;
          return (
            <Link key={s.id} href={`/learn/stage/${s.id}`} className="block">
              <PCard className={`!p-3.5 ${isCurrent ? "ring-2 ring-primary/40" : ""}`}>
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-base font-extrabold ${
                      s.completed ? "bg-status-paid text-white" : isCurrent ? "bg-primary text-white" : "bg-bg text-muted"
                    }`}
                  >
                    {s.completed ? <Check size={20} /> : s.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{t("stage", { n: s.position })}</span>
                      <span className="figure text-sm font-extrabold">{s.percent}%</span>
                    </div>
                    <div className="mt-1.5">
                      <StageBar stage={s} height={8} />
                    </div>
                    <div className="mt-1 text-[11px] text-muted">
                      {s.completed ? t("completed") : t("learnedMastered", { l: s.learned, m: s.mastered, t: s.total })}
                    </div>
                  </div>
                </div>
              </PCard>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Tile({ href, icon, label, tone, badge }: { href: string; icon: ReactNode; label: string; tone: string; badge?: number }) {
  return (
    <Link href={href} className="block">
      <PCard className="relative h-full !p-3.5">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}>{icon}</span>
        <div className="mt-2 text-sm font-bold leading-snug">{label}</div>
        {badge ? (
          <span className="absolute right-3 top-3 rounded-full bg-dark/[0.06] px-2 py-0.5 text-[11px] font-bold text-muted">{badge}</span>
        ) : null}
      </PCard>
    </Link>
  );
}
