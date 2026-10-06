/**
 * Grammar: the Learn-home card, the topic path (/learn/grammar) and one topic
 * (/learn/grammar/:slug) with its explanation and next action.
 */
import type { ReactNode } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, Check, ChevronRight, Lock, Puzzle, PenLine, RotateCcw, Play, GraduationCap, Trophy, AlertTriangle } from "lucide-react";
import { GRAMMAR_PASS_SCORE, GRAMMAR_TEST_SIZE, type GrammarTopicDetail } from "@shared/grammar/types";
import { levelLabel } from "@shared/learning/types";
import type { ApiError } from "../../../lib/api";
import { haptic } from "../../../lib/telegram";
import { PCard, PageSkeleton, ErrorState, EmptyState, SectionTitle } from "../../ui";
import { BigButton } from "../ui";
import { fmtScore, isComingSoon, useGrammarTopic, useGrammarTopics, type GrammarTopicRow } from "./api";
import { useGT, type GKey } from "./i18n";

type T = ReturnType<typeof useGT>["t"];
type Locale = ReturnType<typeof useGT>["locale"];

export const topicTitle = (x: { title: { en: string; uz: string } }, l: Locale) => (l === "uz" ? x.title.uz || x.title.en : x.title.en || x.title.uz);

/** Friendly text for the API's refusal codes. */
export function grammarErrorText(e: unknown, t: T): string | null {
  const err = e as ApiError | null;
  if (!err) return null;
  const map: Record<string, GKey> = {
    locked: "errLocked",
    build_first: "errBuildFirst",
    review_first: "errReviewFirst",
    preview_read_only: "previewNote",
    not_found: "errNotFound",
    session_not_found: "errSession",
    session_expired: "errSession",
  };
  if (map[err.code]) return t(map[err.code]);
  if (err.status === 404) return t("errNotFound");
  return null;
}

/** The topic a student should be working on: the first one not passed and not locked. */
export function currentTopic(topics: GrammarTopicRow[]): GrammarTopicRow | null {
  return topics.find((x) => x.status === "open") ?? null;
}

/* ───────────────────────────── Learn home card ───────────────────────────── */

export function GrammarCard() {
  const { t, locale } = useGT();
  const q = useGrammarTopics();
  if (q.isLoading) return <div className="h-36 animate-pulse rounded-[20px] bg-dark/[0.06]" />;
  const soon = isComingSoon(q.error) || (q.data && q.data.topics.length === 0);
  if (soon) {
    return (
      <PCard className="flex items-center gap-3 !p-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet/15 text-violet">
          <Puzzle size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold">{t("grammar")}</div>
          <div className="text-xs text-muted">{t("comingSoon")}</div>
        </div>
      </PCard>
    );
  }
  if (q.error || !q.data) return null;
  const topics = q.data.topics;
  const passed = topics.filter((x) => x.status === "passed").length;
  const cur = currentTopic(topics);
  const pct = Math.round((passed / Math.max(1, topics.length)) * 100);
  return (
    <PCard className="relative overflow-hidden !p-0 ring-2 ring-violet/25">
      <Link href={cur ? `/learn/grammar/${cur.slug}` : "/learn/grammar"} onClick={() => haptic("light")} className="block p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet text-white shadow-card">
            <Puzzle size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold uppercase tracking-wide text-violet">
              {t("grammar")} · {t("sentenceBuilding")}
            </div>
            {cur ? (
              <>
                <div className="mt-0.5 truncate text-lg font-extrabold leading-tight">{topicTitle(cur, locale)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted">
                  {cur.reviewPending > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 font-bold text-danger">
                      <RotateCcw size={11} /> {t("fixN", { n: cur.reviewPending })}
                    </span>
                  ) : (
                    <span>{t("sentencesDone", { a: cur.buildDone, b: cur.buildTotal })}</span>
                  )}
                  {cur.bestScore != null && <span>· {t("best", { s: fmtScore(cur.bestScore), t: GRAMMAR_TEST_SIZE })}</span>}
                </div>
              </>
            ) : (
              <div className="mt-0.5 inline-flex items-center gap-1.5 text-lg font-extrabold text-status-paid">
                <Trophy size={18} /> {t("allPassed")}
              </div>
            )}
          </div>
          <ChevronRight size={20} className="mt-3 shrink-0 text-muted" />
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-dark/[0.07]">
          <div className="h-full rounded-full bg-violet transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-muted">
          <span>{t("topicsPassed", { a: passed, b: topics.length })}</span>
          {q.data.level && <span>{levelLabel(q.data.level, locale)}</span>}
        </div>
      </Link>
      <Link
        href="/learn/grammar"
        className="flex min-h-[44px] items-center justify-center gap-1 border-t border-border text-sm font-bold text-violet"
      >
        {t("topics")} <ChevronRight size={15} />
      </Link>
    </PCard>
  );
}

/* ───────────────────────────── topic path ───────────────────────────── */

export function GrammarTopicsPage() {
  const { t, locale } = useGT();
  const q = useGrammarTopics();
  const back = (
    <Link href="/learn" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-muted">
      <ArrowLeft size={16} /> {t("back")}
    </Link>
  );
  if (q.isLoading) return <PageSkeleton />;
  const soon = isComingSoon(q.error) || (q.data && q.data.topics.length === 0);
  if (soon) {
    return (
      <div className="space-y-3 animate-slide-up">
        {back}
        <EmptyState icon={<Puzzle size={24} />} title={t("comingSoon")} hint={t("comingSoonHint")} />
      </div>
    );
  }
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} message={(q.error as ApiError | null)?.message} />;
  const topics = [...q.data.topics].sort((a, b) => a.position - b.position);
  const cur = currentTopic(topics);
  const passed = topics.filter((x) => x.status === "passed").length;

  return (
    <div className="space-y-3 animate-slide-up">
      {back}
      <div className="px-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{t("grammar")}</h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
          {q.data.level && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-primary shadow-card">
              <GraduationCap size={13} /> {levelLabel(q.data.level, locale)}
            </span>
          )}
          <span>{t("topicsPassed", { a: passed, b: topics.length })}</span>
        </div>
        <p className="mt-1 text-sm text-muted">{t("grammarPitch")}</p>
      </div>

      <ol className="relative space-y-2">
        {topics.map((x) => {
          const isCur = cur?.slug === x.slug;
          const locked = x.status === "locked";
          const node = x.status === "passed" ? "bg-status-paid text-white" : isCur ? "bg-violet text-white" : locked ? "bg-bg text-muted" : "bg-primary-soft text-primary";
          return (
            <li key={x.slug} className="relative">
              <Link href={`/learn/grammar/${x.slug}`} onClick={() => haptic("light")} className="block">
                <PCard className={`!p-3.5 ${isCur ? "ring-2 ring-violet/40" : ""} ${locked ? "opacity-75" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className={`relative z-[1] grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-base font-extrabold ${node}`}>
                      {x.status === "passed" ? <Check size={20} /> : locked ? <Lock size={17} /> : x.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words font-bold leading-snug">{topicTitle(x, locale)}</span>
                        {x.reviewPending > 0 && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">
                            <RotateCcw size={11} /> {t("fixN", { n: x.reviewPending })}
                          </span>
                        )}
                      </div>
                      <TopicMeta x={x} t={t} />
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-muted" />
                  </div>
                </PCard>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TopicMeta({ x, t }: { x: GrammarTopicRow; t: T }) {
  const pct = Math.round((x.buildDone / Math.max(1, x.buildTotal)) * 100);
  if (x.status === "locked") return <div className="mt-0.5 text-[11px] font-semibold text-muted">{t("locked")}</div>;
  return (
    <>
      {x.status !== "passed" && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-dark/[0.07]">
          <div className="h-full rounded-full bg-violet" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] font-semibold text-muted">
        {x.status === "passed" ? <span className="text-status-paid">{t("passed")}</span> : <span>{t("sentencesDone", { a: x.buildDone, b: x.buildTotal })}</span>}
        {x.bestScore != null && <span>· {t("best", { s: fmtScore(x.bestScore), t: GRAMMAR_TEST_SIZE })}</span>}
      </div>
    </>
  );
}

/* ───────────────────────────── one topic ───────────────────────────── */

export function GrammarTopicPage() {
  const { t, locale } = useGT();
  const [, params] = useRoute("/learn/grammar/:slug");
  const slug = params?.slug ?? "";
  const q = useGrammarTopic(slug);
  const list = useGrammarTopics();
  const [, go] = useLocation();
  const back = (
    <Link href="/learn/grammar" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-muted">
      <ArrowLeft size={16} /> {t("backToTopics")}
    </Link>
  );
  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) {
    const msg = grammarErrorText(q.error, t);
    if (msg && (q.error as ApiError).status === 404) {
      return (
        <div className="space-y-3">
          {back}
          <EmptyState icon={<Puzzle size={24} />} title={msg} />
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {back}
        <ErrorState onRetry={() => q.refetch()} message={msg ?? (q.error as ApiError | null)?.message} />
      </div>
    );
  }
  const d = q.data;
  const locked = d.status === "locked";
  const prev = list.data?.topics.filter((x) => x.position < d.position).sort((a, b) => b.position - a.position)[0];
  const buildComplete = d.buildTotal > 0 && d.buildDone >= d.buildTotal;
  const nav = (path: string) => {
    haptic("light");
    go(`/learn/grammar/${slug}/${path}`);
  };

  return (
    <div className="space-y-3 animate-slide-up">
      {back}

      <PCard>
        <div className="text-xs font-bold uppercase tracking-wide text-violet">
          {t("grammar")} · {t("topicN", { n: d.position })}
        </div>
        <h1 className="mt-0.5 break-words text-2xl font-extrabold leading-tight tracking-tight">{topicTitle(d, locale)}</h1>
        {locale === "uz" && d.title.en && d.title.en !== d.title.uz && <div className="text-sm font-semibold text-muted">{d.title.en}</div>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusChip d={d} t={t} />
          {d.bestScore != null && <span className="chip">{t("best", { s: fmtScore(d.bestScore), t: GRAMMAR_TEST_SIZE })}</span>}
          {d.attempts > 0 && <span className="chip">{t("attempts", { n: d.attempts })}</span>}
        </div>
        {locked && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-warning/10 px-3 py-2.5 text-sm font-semibold text-warning">
            <Lock size={16} className="mt-0.5 shrink-0" />
            <span>{prev ? t("passPrevToUnlock", { t: topicTitle(prev, locale) }) : t("lockedGeneric")}</span>
          </div>
        )}
      </PCard>

      <Explanation d={d} t={t} />

      {/* Steps */}
      <SectionTitle>{t("sentenceBuilding")}</SectionTitle>
      <PCard className="space-y-4">
        <Step
          n={1}
          done={buildComplete}
          title={t("step1")}
          sub={t("sentencesDone", { a: d.buildDone, b: d.buildTotal })}
          bar={Math.round((d.buildDone / Math.max(1, d.buildTotal)) * 100)}
        />
        <Step
          n={2}
          done={d.status === "passed"}
          title={t("step2")}
          sub={t("step2Hint", { n: GRAMMAR_TEST_SIZE, p: GRAMMAR_PASS_SCORE })}
        />

        {!locked && (
          <div className="space-y-2.5">
            {d.reviewPending > 0 ? (
              <>
                <div className="flex items-start gap-2 rounded-2xl bg-danger/10 px-3 py-2.5 text-sm font-semibold text-danger">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>{t("fixBeforeRetry")}</span>
                </div>
                <BigButton tone="danger" onClick={() => nav("build")}>
                  <RotateCcw size={18} /> {t("fixMistakes")} ({d.reviewPending})
                </BigButton>
              </>
            ) : !buildComplete ? (
              <BigButton onClick={() => nav("build")}>
                <Play size={18} fill="currentColor" /> {d.buildDone > 0 ? t("continueBuilding") : t("startBuilding")}
              </BigButton>
            ) : null}
            {d.canTest && (
              <BigButton tone={buildComplete && d.reviewPending === 0 && d.status !== "passed" ? "primary" : "ghost"} onClick={() => nav("test")}>
                <PenLine size={18} /> {d.attempts > 0 ? t("retakeTest") : t("takeTest")}
              </BigButton>
            )}
            {!d.canTest && !buildComplete && d.reviewPending === 0 && <div className="text-center text-xs font-semibold text-muted">{t("finishBuildFirst")}</div>}
            {buildComplete && d.reviewPending === 0 && (
              <BigButton tone="ghost" onClick={() => nav("build")}>
                <Puzzle size={18} /> {t("practiseAgain")}
              </BigButton>
            )}
          </div>
        )}
      </PCard>
    </div>
  );
}

function StatusChip({ d, t }: { d: GrammarTopicDetail; t: T }) {
  if (d.status === "passed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-status-paid/15 px-2.5 py-1 text-xs font-bold text-status-paid">
        <Check size={13} /> {t("passed")}
      </span>
    );
  if (d.status === "locked")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-dark/[0.06] px-2.5 py-1 text-xs font-bold text-muted">
        <Lock size={12} /> {t("locked")}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet/15 px-2.5 py-1 text-xs font-bold text-violet">
      {d.buildDone > 0 || d.attempts > 0 ? t("inProgress") : t("notStarted")}
    </span>
  );
}

function Step({ n, done, title, sub, bar }: { n: number; done: boolean; title: string; sub: string; bar?: number }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold ${done ? "bg-status-paid text-white" : "bg-primary-soft text-primary"}`}>
        {done ? <Check size={18} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-bold">{title}</div>
        <div className="text-xs text-muted">{sub}</div>
        {bar != null && !done && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-dark/[0.07]">
            <div className="h-full rounded-full bg-violet" style={{ width: `${bar}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

/** The rule card: Uzbek text ("\n" = new paragraph / bullet line), the pattern, examples. */
function Explanation({ d, t }: { d: GrammarTopicDetail; t: T }) {
  const lines = d.explanation.uz.split("\n").map((s) => s.trim()).filter(Boolean);
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`b${blocks.length}`} className="space-y-1">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
              <span className="min-w-0 break-words">{b}</span>
            </li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const ln of lines) {
    const m = ln.match(/^[-•*–]\s*(.*)$/);
    if (m) bullets.push(m[1]);
    else {
      flush();
      blocks.push(
        <p key={`p${blocks.length}`} className="break-words">
          {ln}
        </p>,
      );
    }
  }
  flush();
  return (
    <PCard className="space-y-3">
      <div className="text-xs font-bold uppercase tracking-wide text-muted">{t("rule")}</div>
      <div className="space-y-2 text-[15px] leading-relaxed">{blocks}</div>
      {d.explanation.pattern && (
        <div className="rounded-2xl bg-primary-soft px-3.5 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-primary/80">{t("pattern")}</div>
          <div className="mt-0.5 break-words text-[15px] font-extrabold text-primary">{d.explanation.pattern}</div>
        </div>
      )}
      {d.explanation.examples.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{t("examples")}</div>
          <ul className="space-y-2">
            {d.explanation.examples.map((ex, i) => (
              <li key={i} className="rounded-2xl bg-bg px-3.5 py-2.5">
                <div className="break-words font-bold">{ex.en}</div>
                <div className="break-words text-sm text-muted">{ex.uz}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PCard>
  );
}
