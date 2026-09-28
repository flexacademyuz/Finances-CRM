/**
 * Exercise player. The server builds the set and grades every answer; the
 * app only shows prompts/options and the feedback it gets back, so nothing
 * here can be gamed from the client.
 *
 * Choice questions submit on tap (fast in Telegram); typed questions have a
 * Check button; matching pairs by tapping a word then its meaning.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X, Volume2, Trophy, ArrowRight, RotateCcw, Eye } from "lucide-react";
import type { PublicQuestion } from "@shared/learning/exercises";
import type { PracticeSource } from "@shared/learning/types";
import type { ApiError } from "../../lib/api";
import { haptic } from "../../lib/telegram";
import { useMe } from "../PortalApp";
import { EmptyState, ErrorState } from "../ui";
import { answer as sendAnswer, finish, startSession, speak, canSpeak, type AnswerResult, type FinishResult, type Session } from "./api";
import { useLT, type LKey } from "./i18n";
import { BigButton, PlayerShell } from "./ui";
import { BadgeToast } from "./Flashcards";

export function PracticePage() {
  const { t } = useLT();
  const me = useMe();
  const search = new URLSearchParams(useSearch());
  const source = (search.get("source") ?? "mixed") as PracticeSource;
  const unit = search.get("unit") ?? undefined;
  const [, go] = useLocation();
  const qc = useQueryClient();

  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [i, setI] = useState(0);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [chosen, setChosen] = useState<number | string | number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<FinishResult | null>(null);
  const [run, setRun] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === run) return;
    started.current = run;
    setSession(null);
    setError(null);
    setI(0);
    setResult(null);
    setChosen(null);
    setSummary(null);
    startSession({ source, unitId: unit })
      .then(setSession)
      .catch((e: ApiError) => setError(e));
  }, [run, source, unit]);

  if (error) {
    if (error.code === "nothing_to_practise" || error.code === "preview_read_only") {
      return (
        <PlayerShell progress={0}>
          <div className="mt-8">
            <EmptyState
              icon={error.code === "preview_read_only" ? <Eye size={24} /> : <Check size={24} />}
              title={error.code === "preview_read_only" ? t("previewNote") : t("nothingToPractise")}
            />
            <div className="mt-4">
              <BigButton tone="ghost" onClick={() => go("/learn")}>
                {t("backToLearn")}
              </BigButton>
            </div>
          </div>
        </PlayerShell>
      );
    }
    return <ErrorState onRetry={() => setRun((r) => r + 1)} message={error.message} />;
  }
  if (!session) {
    return (
      <PlayerShell progress={0}>
        <div className="mt-10 text-center text-sm font-semibold text-muted">{t("preparing")}</div>
        <div className="mx-auto mt-4 h-48 w-full animate-pulse rounded-[24px] bg-dark/[0.06]" />
      </PlayerShell>
    );
  }

  const q = session.questions[i];
  const total = session.questions.length;

  const submit = async (value: number | string | number[]) => {
    if (busy || result || me.preview) return;
    setBusy(true);
    setChosen(value);
    try {
      const r = await sendAnswer(session.id, q.index, value);
      haptic(r.correct ? "success" : "error");
      setResult(r);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    haptic("light");
    if (i + 1 < total) {
      setI(i + 1);
      setResult(null);
      setChosen(null);
      return;
    }
    setBusy(true);
    try {
      const s = await finish(session.id);
      setSummary(s);
      void qc.invalidateQueries({ queryKey: ["portal", "learn"] });
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  if (summary) {
    const good = summary.accuracy >= 80;
    return (
      <PlayerShell progress={100}>
        <div className="learn-pop mt-8 flex flex-1 flex-col items-center text-center">
          <div className={`grid h-20 w-20 place-items-center rounded-[28px] ${good ? "bg-status-paid/15 text-status-paid" : "bg-primary-soft text-primary"}`}>
            <Trophy size={38} />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">{t("resultTitle")}</h1>
          <div className="figure mt-3 text-5xl font-extrabold" style={{ color: good ? "#12b76a" : "#3457f5" }}>
            {summary.accuracy}%
          </div>
          <p className="mt-1 text-sm text-muted">{t("resultBody", { c: summary.correct, t: summary.answered })}</p>
          <div className="mt-3 rounded-full bg-warning/15 px-3 py-1 text-sm font-extrabold text-warning">{t("earnedXp", { n: summary.xp })}</div>
          {summary.earned.length > 0 && <BadgeToast codes={summary.earned} />}
          <div className="mt-auto w-full space-y-3 pt-8">
            <BigButton onClick={() => setRun((r) => r + 1)}>
              <RotateCcw size={18} /> {t("tryAgain")}
            </BigButton>
            <BigButton tone="ghost" onClick={() => go(unit ? `/learn/stage/${unit}` : "/learn")}>
              {t("backToLearn")}
            </BigButton>
          </div>
        </div>
      </PlayerShell>
    );
  }

  const answered = i + (result ? 1 : 0);
  return (
    <PlayerShell progress={(answered / total) * 100}>
      <div className="px-1 text-xs font-semibold text-muted">
        {i + 1} / {total}
      </div>
      <div className="mt-1 text-lg font-extrabold">{t(`q_${q.type}` as LKey)}</div>
      <div key={q.index} className="learn-pop mt-3 flex flex-1 flex-col">
        {q.type === "matching" ? (
          <Matching q={q} result={result} onSubmit={submit} disabled={!!me.preview} />
        ) : q.type === "gap" || q.type === "spelling" ? (
          <Typed q={q} result={result} onSubmit={submit} busy={busy} />
        ) : (
          <Choice q={q} result={result} chosen={chosen as number | null} onPick={submit} />
        )}
      </div>

      {result && <Feedback q={q} result={result} onNext={next} last={i + 1 >= total} busy={busy} />}
    </PlayerShell>
  );
}

/* ───────────────────────────── prompts ───────────────────────────── */

function Blanked({ text }: { text: string }) {
  const [a, b] = text.split("___");
  return (
    <span>
      {a}
      <span className="mx-0.5 inline-block min-w-[64px] border-b-[3px] border-primary/60 align-baseline">&nbsp;</span>
      {b}
    </span>
  );
}

function Prompt({ q }: { q: PublicQuestion }) {
  const english = q.type === "en_uz" || q.type === "meaning";
  let body: ReactNode;
  if (q.type === "meaning" && q.context && q.highlight) {
    const idx = q.context.toLowerCase().indexOf(q.highlight.toLowerCase());
    body =
      idx >= 0 ? (
        <span className="text-xl font-semibold leading-snug">
          {q.context.slice(0, idx)}
          <b className="rounded-md bg-primary-soft px-1 text-primary">{q.context.slice(idx, idx + q.highlight.length)}</b>
          {q.context.slice(idx + q.highlight.length)}
        </span>
      ) : (
        <span className="text-xl font-semibold">{q.context}</span>
      );
  } else if (q.type === "sentence" || q.type === "gap") {
    body = (
      <span className="text-xl font-semibold leading-snug">
        <Blanked text={q.prompt} />
      </span>
    );
  } else {
    body = <span className="break-words text-3xl font-extrabold leading-tight">{q.prompt}</span>;
  }
  return (
    <div className="rounded-[24px] bg-surface px-5 py-6 text-center shadow-card ring-1 ring-dark/[0.04]">
      {body}
      {q.hintMeaning && (
        <div className="mt-3">
          <span className="chip">{q.hintMeaning}</span>
        </div>
      )}
      {english && canSpeak() && (
        <button
          aria-label="listen"
          onClick={() => speak(q.type === "meaning" ? q.context ?? q.prompt : q.prompt)}
          className="mx-auto mt-3 grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary"
        >
          <Volume2 size={18} />
        </button>
      )}
    </div>
  );
}

/* ───────────────────────────── choice ───────────────────────────── */

function Choice({ q, result, chosen, onPick }: { q: PublicQuestion; result: AnswerResult | null; chosen: number | null; onPick: (i: number) => void }) {
  const grid = q.type === "recognition";
  const right = result ? (result.correctAnswer as number) : -1;
  return (
    <>
      <Prompt q={q} />
      <div className={`mt-4 ${grid ? "grid grid-cols-2 gap-2.5" : "space-y-2.5"}`}>
        {q.options!.map((o, k) => {
          let cls = "bg-surface ring-1 ring-border";
          if (result) {
            if (k === right) cls = "bg-status-paid/15 ring-2 ring-status-paid text-status-paid";
            else if (k === chosen) cls = "bg-danger/10 ring-2 ring-danger text-danger";
            else cls = "bg-surface ring-1 ring-border opacity-60";
          }
          return (
            <button
              key={k}
              disabled={!!result}
              onClick={() => onPick(k)}
              className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[16px] font-bold transition active:scale-[0.98] ${cls} ${grid ? "justify-center text-center" : ""}`}
            >
              {!grid && (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-bg text-xs font-extrabold text-muted">
                  {String.fromCharCode(65 + k)}
                </span>
              )}
              <span className="min-w-0 flex-1 break-words">{o}</span>
              {result && k === right && <Check size={18} />}
              {result && k === chosen && k !== right && <X size={18} />}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ───────────────────────────── typed ───────────────────────────── */

function Typed({ q, result, onSubmit, busy }: { q: PublicQuestion; result: AnswerResult | null; onSubmit: (v: string) => void; busy: boolean }) {
  const { t } = useLT();
  const [v, setV] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const ring = result ? (result.correct ? "border-status-paid ring-2 ring-status-paid/30" : "border-danger ring-2 ring-danger/30") : "";
  return (
    <>
      <Prompt q={q} />
      {q.hint && <div className="mt-3 text-center text-sm text-muted">{t("hintLetters", { f: q.hint.first, n: q.hint.length })}</div>}
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) onSubmit(v.trim());
        }}
      >
        <input
          ref={ref}
          value={v}
          onChange={(e) => setV(e.target.value)}
          disabled={!!result}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={t("typeHere")}
          className={`input h-14 text-center text-xl font-bold ${ring}`}
        />
        {!result && (
          <div className="mt-3">
            <BigButton disabled={!v.trim() || busy}>{t("check")}</BigButton>
          </div>
        )}
      </form>
    </>
  );
}

/* ───────────────────────────── matching ───────────────────────────── */

function Matching({ q, result, onSubmit, disabled }: { q: PublicQuestion; result: AnswerResult | null; onSubmit: (v: number[]) => void; disabled: boolean }) {
  const { t } = useLT();
  const left = q.left!;
  const right = q.right!;
  const [pairs, setPairs] = useState<(number | null)[]>(() => left.map(() => null));
  const [sel, setSel] = useState<number | null>(null);
  const usedRight = new Set(pairs.filter((p): p is number => p != null));
  const key = result ? (result.correctAnswer as number[]) : null;

  const pickLeft = (k: number) => {
    if (result) return;
    haptic("light");
    setSel(k);
    if (pairs[k] != null) setPairs((p) => p.map((x, j) => (j === k ? null : x)));
  };
  const pickRight = (r: number) => {
    if (result || sel == null) return;
    haptic("light");
    setPairs((p) => p.map((x, j) => (j === sel ? r : x === r ? null : x)));
    const nextFree = pairs.findIndex((x, j) => j !== sel && x == null);
    setSel(nextFree >= 0 ? nextFree : null);
  };
  const complete = pairs.every((p) => p != null);
  const colors = ["#3457f5", "#7b5cf5", "#d18700", "#0ea5e9", "#db2777"];

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-2.5">
          {left.map((w, k) => {
            const p = pairs[k];
            const ok = key ? p === key[k] : null;
            return (
              <button
                key={k}
                onClick={() => pickLeft(k)}
                className={`flex min-h-[52px] w-full items-center justify-center rounded-2xl px-2 text-center text-[15px] font-bold transition ${
                  ok === true ? "bg-status-paid/15 text-status-paid" : ok === false ? "bg-danger/10 text-danger" : sel === k ? "bg-primary text-white" : "bg-surface ring-1 ring-border"
                }`}
                style={p != null && !key && sel !== k ? { boxShadow: `inset 4px 0 0 ${colors[k % colors.length]}` } : undefined}
              >
                {w}
              </button>
            );
          })}
        </div>
        <div className="space-y-2.5">
          {right.map((m, r) => {
            const owner = pairs.findIndex((p) => p === r);
            return (
              <button
                key={r}
                onClick={() => pickRight(r)}
                className={`flex min-h-[52px] w-full items-center justify-center rounded-2xl px-2 text-center text-[14px] font-semibold transition ${
                  usedRight.has(r) ? "bg-bg text-text" : "bg-surface ring-1 ring-border"
                }`}
                style={owner >= 0 && !key ? { boxShadow: `inset -4px 0 0 ${colors[owner % colors.length]}` } : undefined}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>
      {key && (
        <div className="mt-3 space-y-1 rounded-2xl bg-bg p-3 text-sm">
          {left.map((w, k) => (
            <div key={k} className="flex justify-between gap-2">
              <b>{w}</b>
              <span className="text-muted">{right[key[k]]}</span>
            </div>
          ))}
        </div>
      )}
      {!result && (
        <div className="mt-4">
          <BigButton disabled={!complete || disabled} onClick={() => onSubmit(pairs as number[])}>
            {t("check")}
          </BigButton>
        </div>
      )}
    </>
  );
}

/* ───────────────────────────── feedback ───────────────────────────── */

function Feedback({ q, result, onNext, last, busy }: { q: PublicQuestion; result: AnswerResult; onNext: () => void; last: boolean; busy: boolean }) {
  const { t } = useLT();
  let shown: string | null = null;
  if (!result.correct) {
    if (typeof result.correctAnswer === "number" && q.options) shown = q.options[result.correctAnswer];
    else if (typeof result.correctAnswer === "string") shown = result.correctAnswer;
  }
  return (
    <div
      className={`learn-pop -mx-4 mt-4 rounded-t-[24px] px-4 pb-4 pt-4 ${result.correct ? "bg-status-paid/15" : "bg-danger/10"}`}
      role="status"
      aria-live="polite"
    >
      <div className={`flex items-center gap-2 text-lg font-extrabold ${result.correct ? "text-status-paid" : "text-danger"}`}>
        {result.correct ? <Check size={22} /> : <X size={22} />}
        {result.correct ? t("correct") : t("incorrect")}
        {result.xp > 0 && <span className="ml-auto text-sm font-bold text-warning">{t("earnedXp", { n: result.xp })}</span>}
      </div>
      {shown && <div className="mt-1 text-[15px] font-semibold">{t("rightAnswer", { a: shown })}</div>}
      <div className="mt-3">
        <BigButton tone={result.correct ? "success" : "danger"} onClick={onNext} disabled={busy}>
          {last ? t("finish") : t("next")} <ArrowRight size={18} />
        </BigButton>
      </div>
    </div>
  );
}
