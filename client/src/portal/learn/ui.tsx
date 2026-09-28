/** Building blocks shared by the learning screens (mobile-first). */
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Flame, Library, Play, Sparkles, Target, Trophy, X, Check, type LucideIcon } from "lucide-react";
import type { WordStatus } from "@shared/learning/types";
import { ACHIEVEMENTS, type AchievementCode } from "@shared/learning/gamification";
import { haptic } from "../../lib/telegram";
import { lapi, type LearnHome, type Stage } from "./api";
import { useLT } from "./i18n";

export const STATUS_COLOR: Record<WordStatus, string> = {
  mastered: "#12b76a",
  learning: "#d18700",
  need_practice: "#e23744",
  new: "#c3cad6",
};

export function useLearnHome() {
  return useQuery({ queryKey: ["portal", "learn", "home"], queryFn: () => lapi<LearnHome>("/home"), staleTime: 15_000 });
}

export function stageTitle(s: Pick<Stage, "position">, t: ReturnType<typeof useLT>["t"]) {
  return t("stage", { n: s.position });
}

/** Stacked bar: mastered / learning / need practice / new, in that order. */
export function StageBar({ stage, height = 10 }: { stage: Stage; height?: number }) {
  const total = stage.total || 1;
  const seg = (n: number, c: string) => (n > 0 ? <div style={{ width: `${(n / total) * 100}%`, background: c }} /> : null);
  return (
    <div className="flex overflow-hidden rounded-full bg-dark/[0.07]" style={{ height }} role="img" aria-label={`${stage.percent}%`}>
      {seg(stage.mastered, STATUS_COLOR.mastered)}
      {seg(stage.learning, STATUS_COLOR.learning)}
      {seg(stage.needPractice, STATUS_COLOR.need_practice)}
    </div>
  );
}

/** Counts with coloured dots AND labels (never colour alone). */
export function StageLegend({ stage }: { stage: Stage }) {
  const { t } = useLT();
  const row = (label: string, n: number, c: string) => (
    <div className="flex items-center gap-2 text-sm">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c }} />
      <span className="flex-1 text-muted">{label}</span>
      <span className="figure font-bold">{n}</span>
    </div>
  );
  return (
    <div className="space-y-1.5">
      {row(t("mastered"), stage.mastered, STATUS_COLOR.mastered)}
      {row(t("learning"), stage.learning, STATUS_COLOR.learning)}
      {row(t("needPractice"), stage.needPractice, STATUS_COLOR.need_practice)}
      {row(t("new"), stage.newCount, STATUS_COLOR.new)}
    </div>
  );
}

export function StatusPill({ status }: { status: WordStatus }) {
  const { t } = useLT();
  const c = STATUS_COLOR[status];
  const label = { mastered: t("mastered"), learning: t("learning"), need_practice: t("needPractice"), new: t("new") }[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${c}22`, color: status === "new" ? "#7a8699" : c }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {label}
    </span>
  );
}

/**
 * The main habit card: what to do today + one big Start button. Used on the
 * portal Home and at the top of Learn.
 */
export function TodayCard({ compact = false }: { compact?: boolean }) {
  const { t } = useLT();
  const [, go] = useLocation();
  const q = useLearnHome();
  if (q.isLoading) return <div className="h-40 animate-pulse rounded-[22px] bg-dark/[0.06]" />;
  if (q.error || !q.data) return null;
  const d = q.data;
  const cur = d.currentStage;
  const pct = Math.min(100, Math.round((d.today.done / Math.max(1, d.today.goal)) * 100));
  const start = () => {
    haptic("light");
    go(d.today.reviewDue + d.today.newWords > 0 ? "/learn/cards?mode=daily" : "/learn/practice?source=daily");
  };
  return (
    <div className="hero relative overflow-hidden">
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-sm font-bold text-white/90">
            <BookOpen size={16} /> {t("todaysPractice")}
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">
            <Flame size={13} /> {d.streak > 0 ? t("dayStreak", { n: d.streak }) : t("noStreak")}
          </div>
        </div>
        {d.today.goalMet ? (
          <div className="mt-3 inline-flex items-center gap-2 text-xl font-extrabold">
            <Check size={22} /> {t("goalMet")}
          </div>
        ) : (
          <div className="mt-3 space-y-0.5 text-[15px] font-semibold">
            {d.today.reviewDue > 0 && <div>{t("wordsToReview", { n: d.today.reviewDue })}</div>}
            {d.today.newWords > 0 && <div>{t("newWords", { n: d.today.newWords })}</div>}
            <div>{t("exercisesN", { n: d.today.exercises })}</div>
          </div>
        )}
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={start}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white text-base font-extrabold text-primary shadow-card active:scale-[0.98]"
          >
            <Play size={18} fill="currentColor" /> {d.today.goalMet ? t("practiceMore") : d.today.done > 0 ? t("continue") : t("start")}
          </button>
          {!compact && cur && (
            <Link href={`/learn/stage/${cur.id}`} className="shrink-0 text-right text-xs font-semibold text-white/90">
              {t("stage", { n: cur.position })}
              <div className="figure text-lg font-extrabold text-white">{cur.percent}%</div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** Full-screen player frame: close button + progress bar, no tab bar. */
export function PlayerShell({ progress, children, onClose }: { progress: number; children: ReactNode; onClose?: () => void }) {
  const { t } = useLT();
  const [, go] = useLocation();
  return (
    <div className="flex min-h-[100dvh] flex-col pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center gap-3 pb-3 pt-4">
        <button
          aria-label={t("close")}
          onClick={() => (onClose ? onClose() : go("/learn"))}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-muted shadow-card"
        >
          <X size={20} />
        </button>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-dark/[0.07]">
          <div className="h-full rounded-full bg-status-paid transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

const BADGE_ICONS: Record<string, LucideIcon> = { sparkles: Sparkles, book: BookOpen, library: Library, flame: Flame, target: Target, trophy: Trophy };

export function Badge({ code, earned, size = 48 }: { code: AchievementCode; earned: boolean; size?: number }) {
  const { locale } = useLT();
  const a = ACHIEVEMENTS[code];
  const Icon = BADGE_ICONS[a.icon] ?? Trophy;
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <span
        className={`grid place-items-center rounded-2xl ${earned ? "bg-warning/15 text-warning" : "bg-dark/[0.05] text-muted/60"}`}
        style={{ width: size, height: size }}
      >
        <Icon size={Math.round(size * 0.46)} />
      </span>
      <span className={`text-[11px] font-bold leading-tight ${earned ? "text-text" : "text-muted"}`}>{a[locale]}</span>
    </div>
  );
}

/** Big, thumb-friendly button for players. */
export function BigButton({
  children,
  onClick,
  tone = "primary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "primary" | "success" | "danger" | "ghost";
  disabled?: boolean;
}) {
  const cls = {
    primary: "bg-primary text-white shadow-tactile active:translate-y-[3px] active:shadow-tactile-press",
    success: "bg-status-paid text-white shadow-[0_4px_0_0_#0e9458]",
    danger: "bg-danger text-white shadow-[0_4px_0_0_#b82a35]",
    ghost: "bg-surface text-text ring-1 ring-border",
  }[tone];
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-extrabold transition active:scale-[0.98] disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}
