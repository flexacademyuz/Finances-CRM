/**
 * Gate test (/learn/grammar/:slug/test), full-screen. Uzbek shown, the
 * student types the English. Answers stay on the device until Finish (no
 * per-item feedback — it's a test); they can go back and change any answer.
 * The server grades and returns the result screen's data.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, X, Trophy, RotateCcw, Eye, AlertTriangle, Lock, Play, Flag } from "lucide-react";
import { GRAMMAR_PASS_SCORE, GRAMMAR_TEST_SIZE, type GrammarTestResult, type GrammarTestRound } from "@shared/grammar/types";
import type { ApiError } from "../../../lib/api";
import { haptic } from "../../../lib/telegram";
import { useMe } from "../../PortalApp";
import { EmptyState } from "../../ui";
import { BigButton, PlayerShell } from "../ui";
import { finishTest, fmtScore, gKeys, startTest, useGrammarTopics } from "./api";
import { grammarErrorText, topicTitle } from "./GrammarPages";
import { useGT } from "./i18n";

export function GrammarTestPage() {
  const { t } = useGT();
  const me = useMe();
  const [, params] = useRoute("/learn/grammar/:slug/test");
  const slug = params?.slug ?? "";
  const [, go] = useLocation();
  const qc = useQueryClient();

  const [round, setRound] = useState<GrammarTestRound | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [confirmBlank, setConfirmBlank] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GrammarTestResult | null>(null);
  const [run, setRun] = useState(0);
  const started = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!slug || started.current === run) return;
    started.current = run;
    setRound(null);
    setError(null);
    setResult(null);
    setI(0);
    startTest(slug)
      .then((r) => {
        setRound(r);
        setAnswers(r.items.map(() => ""));
      })
      .catch((e: ApiError) => setError(e));
  }, [run, slug]);

  const inProgress = !!round && !result && !error;
  const dirty = inProgress && answers.some((a) => a.trim() !== "");

  // Warn before a reload / tab close drops a half-finished test.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Keep the keyboard up while moving between sentences.
  useEffect(() => {
    if (inProgress) inputRef.current?.focus({ preventScroll: true });
  }, [i, inProgress]);

  const toTopic = () => go(`/learn/grammar/${slug}`);
  const close = () => {
    if (dirty) setLeaving(true);
    else toTopic();
  };

  if (error) return <TestError error={error} slug={slug} onRetry={() => setRun((r) => r + 1)} />;

  if (result) return <TestResultView result={result} slug={slug} />;

  if (!round) {
    return (
      <PlayerShell progress={0} onClose={toTopic}>
        <div className="mx-auto mt-6 h-36 w-full animate-pulse rounded-[24px] bg-dark/[0.06]" />
        <div className="mx-auto mt-3 h-14 w-full animate-pulse rounded-2xl bg-dark/[0.06]" />
      </PlayerShell>
    );
  }

  if (submitting) {
    return (
      <PlayerShell progress={100} onClose={() => undefined}>
        <div className="mt-16 text-center text-sm font-semibold text-muted">{t("checking")}</div>
        <div className="mx-auto mt-4 h-40 w-full animate-pulse rounded-[24px] bg-dark/[0.06]" />
      </PlayerShell>
    );
  }

  const n = round.items.length;
  const item = round.items[i];
  const last = i === n - 1;
  const answeredCount = answers.filter((a) => a.trim()).length;
  const blanks = n - answeredCount;

  const setAnswer = (v: string) => {
    setConfirmBlank(false);
    setAnswers((a) => a.map((x, k) => (k === i ? v : x)));
  };

  const submit = async () => {
    if (me.preview) return;
    setSubmitting(true);
    try {
      const r = await finishTest(round.sessionId, answers.map((a) => a.trim()));
      haptic(r.passed ? "success" : "error");
      setResult(r);
      void qc.invalidateQueries({ queryKey: gKeys.all });
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setSubmitting(false);
    }
  };

  const tryFinish = () => {
    haptic("light");
    if (blanks > 0 && !confirmBlank) {
      setConfirmBlank(true);
      return;
    }
    void submit();
  };

  const forward = () => {
    if (last) tryFinish();
    else {
      haptic("light");
      setI(i + 1);
    }
  };

  return (
    <PlayerShell progress={(answeredCount / Math.max(1, n)) * 100} onClose={close}>
      <div className="flex items-center justify-between gap-2 px-1 text-xs font-semibold text-muted">
        <span className="inline-flex items-center gap-1">
          <Flag size={13} /> {t("testTitle")}
        </span>
        <span className="figure">
          {i + 1} / {n}
        </span>
      </div>
      {me.preview && <div className="mt-2 rounded-xl bg-warning/15 px-3 py-1.5 text-xs font-semibold text-warning">{t("previewNote")}</div>}

      {/* Jump to any sentence (answered ones are filled). */}
      <div className="mt-2 flex gap-1" role="tablist">
        {round.items.map((_, k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === i}
            aria-label={`${k + 1}`}
            onClick={() => {
              haptic("light");
              setI(k);
            }}
            className={`h-8 min-w-0 flex-1 rounded-lg text-[11px] font-extrabold transition ${
              k === i ? "bg-primary text-white" : answers[k]?.trim() ? "bg-primary-soft text-primary" : "bg-dark/[0.06] text-muted"
            }`}
          >
            {k + 1}
          </button>
        ))}
      </div>

      <div key={i} className="learn-pop mt-3">
        <div className="rounded-[24px] bg-surface px-4 py-5 text-center shadow-card ring-1 ring-dark/[0.04]">
          <div className="text-xs font-semibold text-muted">{t("testHelp")}</div>
          <div className="mt-1 break-words text-[22px] font-extrabold leading-snug">{item.uz}</div>
        </div>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            forward();
          }}
        >
          <input
            ref={inputRef}
            value={answers[i] ?? ""}
            onChange={(e) => setAnswer(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint={last ? "done" : "next"}
            placeholder={t("typeHere")}
            maxLength={300}
            className="input h-14 text-[17px] font-semibold"
          />
          {confirmBlank && (
            <div className="learn-pop mt-3 rounded-2xl bg-warning/10 p-3">
              <div className="flex items-start gap-2 text-sm font-semibold text-warning">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{t("blanksLeft", { n: blanks })}</span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmBlank(false);
                    const firstBlank = answers.findIndex((a) => !a.trim());
                    if (firstBlank >= 0) setI(firstBlank);
                  }}
                  className="min-h-[44px] rounded-xl bg-surface text-sm font-bold ring-1 ring-border"
                >
                  {t("keepGoing")}
                </button>
                <button type="button" onClick={() => void submit()} className="min-h-[44px] rounded-xl bg-warning text-sm font-bold text-white">
                  {t("yesFinish")}
                </button>
              </div>
            </div>
          )}
          <div className="mt-3 flex gap-2 pb-4">
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setI(Math.max(0, i - 1));
              }}
              disabled={i === 0}
              aria-label={t("back")}
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface text-muted ring-1 ring-border disabled:opacity-40"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <BigButton tone={last ? "success" : "primary"} disabled={!!me.preview && last}>
                {last ? (
                  <>
                    <Check size={18} /> {t("finishTest")}
                  </>
                ) : (
                  <>
                    {t("next")} <ArrowRight size={18} />
                  </>
                )}
              </BigButton>
            </div>
          </div>
        </form>
      </div>

      {leaving && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setLeaving(false)}>
          <div
            className="learn-pop w-full max-w-[480px] rounded-t-[24px] bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="text-lg font-extrabold">{t("leaveTitle")}</div>
            <p className="mt-1 text-sm text-muted">{t("leaveBody")}</p>
            <div className="mt-4 space-y-2.5">
              <BigButton onClick={() => setLeaving(false)}>{t("stay")}</BigButton>
              <BigButton tone="ghost" onClick={toTopic}>
                {t("leave")}
              </BigButton>
            </div>
          </div>
        </div>
      )}
    </PlayerShell>
  );
}

function TestError({ error, slug, onRetry }: { error: ApiError; slug: string; onRetry: () => void }) {
  const { t } = useGT();
  const [, go] = useLocation();
  const msg = grammarErrorText(error, t) ?? error.message;
  const toTopic = () => go(`/learn/grammar/${slug}`);
  const icon =
    error.code === "preview_read_only" ? <Eye size={24} /> : error.code === "locked" ? <Lock size={24} /> : <AlertTriangle size={24} />;
  return (
    <PlayerShell progress={0} onClose={toTopic}>
      <div className="mt-8">
        <EmptyState icon={icon} title={msg} />
        <div className="mt-4 space-y-3">
          {error.code === "build_first" && (
            <BigButton onClick={() => go(`/learn/grammar/${slug}/build`)}>
              <Play size={18} fill="currentColor" /> {t("continueBuilding")}
            </BigButton>
          )}
          {error.code === "review_first" && (
            <BigButton tone="danger" onClick={() => go(`/learn/grammar/${slug}/build`)}>
              <RotateCcw size={18} /> {t("fixMistakes")}
            </BigButton>
          )}
          {error.status >= 500 || error.status === 0 || error.code === "error" ? (
            <BigButton onClick={onRetry}>
              <RotateCcw size={18} /> {t("startAgain")}
            </BigButton>
          ) : null}
          <BigButton tone="ghost" onClick={toTopic}>
            {t("backToTopic")}
          </BigButton>
        </div>
      </div>
    </PlayerShell>
  );
}

function TestResultView({ result, slug }: { result: GrammarTestResult; slug: string }) {
  const { t, locale } = useGT();
  const [, go] = useLocation();
  const topics = useGrammarTopics();
  const total = result.items.length || GRAMMAR_TEST_SIZE;
  const unlocked = result.unlocked ? topics.data?.topics.find((x) => x.slug === result.unlocked) : null;
  const color = result.passed ? "#12b76a" : "#e23744";
  return (
    <PlayerShell progress={100} onClose={() => go(`/learn/grammar/${slug}`)}>
      <div className="learn-pop mt-4 flex flex-col items-center text-center">
        <div className={`grid h-16 w-16 place-items-center rounded-[24px] ${result.passed ? "bg-status-paid/15 text-status-paid" : "bg-danger/10 text-danger"}`}>
          {result.passed ? <Trophy size={32} /> : <RotateCcw size={30} />}
        </div>
        <div className="figure mt-3 text-5xl font-extrabold" style={{ color }}>
          {fmtScore(result.score)} <span className="text-3xl text-muted">/ {total}</span>
        </div>
        <h1 className="mt-1 text-xl font-extrabold">{result.passed ? t("testPassed") : t("testFailed")}</h1>
        <p className="mt-1 max-w-xs text-sm text-muted">
          {result.passed
            ? result.unlocked
              ? t("passedBody")
              : t("passedBodyLast")
            : t("failedBody", { p: GRAMMAR_PASS_SCORE, n: GRAMMAR_TEST_SIZE })}
        </p>
        {result.xp > 0 && <div className="mt-2 rounded-full bg-warning/15 px-3 py-1 text-sm font-extrabold text-warning">{t("earnedXp", { n: result.xp })}</div>}
      </div>

      <div className="mt-4 space-y-3">
        {!result.passed && (
          <BigButton tone="danger" onClick={() => go(`/learn/grammar/${slug}/build`)}>
            <RotateCcw size={18} /> {t("fixMistakes")}
          </BigButton>
        )}
        {result.passed && result.unlocked && (
          <BigButton onClick={() => go(`/learn/grammar/${result.unlocked}`)}>
            <span className="min-w-0 truncate">{t("nextTopic", { t: unlocked ? topicTitle(unlocked, locale) : "" }).replace(/:\s*$/, "")}</span>
            <ArrowRight size={18} className="shrink-0" />
          </BigButton>
        )}
      </div>

      <ol className="mt-4 space-y-2">
        {result.items.map((it, k) => {
          const tone = it.score === 1 ? "text-status-paid" : it.score === 0.5 ? "text-warning" : "text-danger";
          const badge = it.score === 1 ? "bg-status-paid text-white" : it.score === 0.5 ? "bg-warning text-white" : "bg-danger text-white";
          return (
            <li key={k} className="rounded-2xl bg-surface p-3.5 shadow-card ring-1 ring-dark/[0.04]">
              <div className="flex items-start gap-2.5">
                <span className={`grid h-8 min-w-[32px] shrink-0 place-items-center rounded-lg px-1 text-sm font-extrabold ${badge}`} aria-label={`${it.score}`}>
                  {it.score === 0.5 ? "½" : it.score}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-semibold text-muted">
                    {k + 1}. {it.uz}
                  </div>
                  <div className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{t("youTyped")}</div>
                  <div className={`break-words font-bold ${tone} ${it.score === 0 && it.typed ? "line-through decoration-2" : ""}`}>
                    {it.typed || <span className="font-semibold italic text-muted">{t("empty")}</span>}
                  </div>
                  {it.score === 0.5 && <div className="text-[11px] font-semibold text-warning">{t("halfPoint")}</div>}
                  {it.score < 1 && (
                    <>
                      <div className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{t("expected")}</div>
                      <div className="break-words font-bold text-text">{it.expected}</div>
                    </>
                  )}
                </div>
                {it.score === 1 ? <Check size={18} className="mt-1 shrink-0 text-status-paid" /> : it.score === 0 ? <X size={18} className="mt-1 shrink-0 text-danger" /> : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 pb-4">
        <BigButton tone="ghost" onClick={() => go(`/learn/grammar/${slug}`)}>
          {t("backToTopic")}
        </BigButton>
      </div>
    </PlayerShell>
  );
}
