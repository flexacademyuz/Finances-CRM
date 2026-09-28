/** One stage: progress, completion status and the ways to study it. */
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Layers, Dumbbell, AlertTriangle, List, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { PCard, PageSkeleton, ErrorState } from "../ui";
import { lapi, type Stage } from "./api";
import { useLT } from "./i18n";
import { StageBar, StageLegend, useLearnHome } from "./ui";
import { levelLabel, type VocabSettings } from "@shared/learning/types";

export function StagePage() {
  const { t, locale } = useLT();
  const home = useLearnHome();
  const [, params] = useRoute("/learn/stage/:id");
  const id = params?.id ?? "";
  const q = useQuery({
    queryKey: ["portal", "learn", "stage", id],
    queryFn: () => lapi<{ stage: Stage; settings: VocabSettings }>(`/stages/${id}`),
    enabled: !!id,
  });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const s = q.data.stage;
  const threshold = Math.round(q.data.settings.completionThreshold * 100);

  return (
    <div className="space-y-3 animate-slide-up">
      <Link href="/learn" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft size={16} /> {t("learn")}
      </Link>

      <PCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("vocabulary")}
              {home.data?.resource.level ? ` · ${levelLabel(home.data.resource.level, locale)}` : ""}
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t("stage", { n: s.position })}</h1>
            <div className="mt-0.5 text-sm text-muted">
              {s.total} {t("words")}
            </div>
          </div>
          <div className="text-right">
            <div className="figure text-4xl font-extrabold" style={{ color: s.completed ? "#12b76a" : "#3457f5" }}>
              {s.percent}%
            </div>
            {s.completed ? (
              <div className="inline-flex items-center gap-1 text-xs font-bold text-status-paid">
                <Trophy size={13} /> {t("completed")}
              </div>
            ) : (
              <div className="text-xs font-semibold text-muted">{t("wordsAway", { n: s.toComplete })}</div>
            )}
          </div>
        </div>
        <div className="mt-4">
          <StageBar stage={s} height={12} />
          <div className="mt-2 text-sm font-bold">{t("wordsLearnedOf", { a: s.mastered, b: s.total })}</div>
          <div className="text-[11px] text-muted">
            {threshold}% {t("mastered").toLowerCase()} → {t("completed").toLowerCase()}
          </div>
        </div>
        <div className="mt-4">
          <StageLegend stage={s} />
        </div>
      </PCard>

      <div className="space-y-2">
        <Action href={`/learn/cards?mode=learn&unit=${s.id}`} icon={<Layers size={20} />} tone="bg-primary text-white" label={t("continueLearning")} primary />
        <Action href={`/learn/practice?source=stage&unit=${s.id}`} icon={<Dumbbell size={20} />} tone="bg-violet/15 text-violet" label={t("practiceExercises")} />
        {s.needPractice > 0 && (
          <Action
            href={`/learn/cards?mode=difficult&unit=${s.id}`}
            icon={<AlertTriangle size={20} />}
            tone="bg-danger/10 text-danger"
            label={t("reviewDifficult")}
            count={s.needPractice}
          />
        )}
        <Action href={`/learn/stage/${s.id}/words`} icon={<List size={20} />} tone="bg-bg text-muted" label={t("allWords")} count={s.total} />
      </div>
    </div>
  );
}

function Action({ href, icon, label, tone, count, primary }: { href: string; icon: ReactNode; label: string; tone: string; count?: number; primary?: boolean }) {
  return (
    <Link href={href} className="block">
      <PCard className={`flex items-center gap-3 !p-3.5 ${primary ? "ring-2 ring-primary/30" : ""}`}>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tone}`}>{icon}</span>
        <span className="flex-1 font-bold">{label}</span>
        {count != null && <span className="figure rounded-full bg-bg px-2.5 py-0.5 text-xs font-bold text-muted">{count}</span>}
      </PCard>
    </Link>
  );
}
