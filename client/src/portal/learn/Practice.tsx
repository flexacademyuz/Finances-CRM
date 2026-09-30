/**
 * Exercise player. The server builds the set and grades every answer; the
 * app only shows prompts/options and the feedback it gets back, so nothing
 * here can be gamed from the client.
 *
 * Choice questions submit on tap (fast in Telegram); typed questions have a
 * Check button; matching pairs by tapping a word then its meaning; cloze
 * fills gaps from a word bank; word order builds a sentence from tiles.
 * From B1+ up the Uzbek hint is hidden behind a tap and costs XP if opened.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X, Volume2, Trophy, ArrowRight, RotateCcw, Eye, Lightbulb, Undo2 } from "lucide-react";
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
  const [hintShown, setHintShown] = useState(false);
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
    setHintShown(false);
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
      const r = await sendAnswer(session.id, q.index, value, !!q.hintOnDemand && hintShown);
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
      setHintShown(false);
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
  // Opening a hidden hint is remembered for this question (it lowers the XP).
  const hint: HintState = {
    shown: hintShown || !q.hintOnDemand || !!result,
    onShow: () => {
      haptic("light");
      setHintShown(true);
    },
  };
  return (
    <PlayerShell progress={(answered / total) * 100}>
      <div className="px-1 text-xs font-semibold text-muted">
        {i + 1} / {total}
      </div>
      <div className="mt-1 text-lg font-extrabold">{t(`q_${q.type}` as LKey)}</div>
      <div key={q.index} className="learn-pop mt-3 flex flex-1 flex-col">
        {q.type === "matching" ? (
          <Matching q={q} result={result} onSubmit={submit} disabled={!!me.preview} />
        ) : q.type === "cloze" ? (
          <Cloze q={q} result={result} onSubmit={submit} disabled={!!me.preview} hint={hint} />
        ) : q.type === "word_order" ? (
          <WordOrder q={q} result={result} onSubmit={submit} disabled={!!me.preview || busy} hint={hint} />
        ) : q.type === "gap" || q.type === "spelling" ? (
          <Typed q={q} result={result} onSubmit={submit} busy={busy} hint={hint} />
        ) : (
          <Choice q={q} result={result} chosen={chosen as number | null} onPick={submit} hint={hint} />
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

type HintState = { shown: boolean; onShow: () => void };

/** The Uzbek hint: shown, or (B1+ and up) a button that reveals it. */
function MeaningHint({ text, hint, many }: { text: ReactNode; hint: HintState; many?: boolean }) {
  const { t } = useLT();
  if (hint.shown) return <>{text}</>;
  return (
    <button onClick={hint.onShow} className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs font-bold text-warning">
      <Lightbulb size={14} /> {t(many ? "showHints" : "showHint")} <span className="font-semibold opacity-70">({t("hintCostsXp")})</span>
    </button>
  );
}

function Prompt({ q, hint }: { q: PublicQuestion; hint: HintState }) {
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
          <MeaningHint text={<span className="chip">{q.hintMeaning}</span>} hint={hint} />
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

function Choice({
  q,
  result,
  chosen,
  onPick,
  hint,
}: {
  q: PublicQuestion;
  result: AnswerResult | null;
  chosen: number | null;
  onPick: (i: number) => void;
  hint: HintState;
}) {
  const grid = q.type === "recognition";
  const right = result ? (result.correctAnswer as number) : -1;
  return (
    <>
      <Prompt q={q} hint={hint} />
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

function Typed({
  q,
  result,
  onSubmit,
  busy,
  hint,
}: {
  q: PublicQuestion;
  result: AnswerResult | null;
  onSubmit: (v: string) => void;
  busy: boolean;
  hint: HintState;
}) {
  const { t } = useLT();
  const [v, setV] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const ring = result ? (result.correct ? "border-status-paid ring-2 ring-status-paid/30" : "border-danger ring-2 ring-danger/30") : "";
  return (
    <>
      <Prompt q={q} hint={hint} />
      {q.hint && (q.hint.first || q.hint.length) && (
        <div className="mt-3 text-center text-sm text-muted">
          {q.hint.first && q.hint.length
            ? t("hintLetters", { f: q.hint.first, n: q.hint.length })
            : q.hint.first
              ? t("hintFirst", { f: q.hint.first })
              : t("hintLength", { n: q.hint.length! })}
        </div>
      )}
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

/* ───────────────────────────── cloze ───────────────────────────── */

/** Several sentences with gaps; tap a gap, then a word from the bank (some words are extra). */
function Cloze({
  q,
  result,
  onSubmit,
  disabled,
  hint,
}: {
  q: PublicQuestion;
  result: AnswerResult | null;
  onSubmit: (v: number[]) => void;
  disabled: boolean;
  hint: HintState;
}) {
  const { t } = useLT();
  const sentences = q.left!;
  const bank = q.right!;
  const [fill, setFill] = useState<(number | null)[]>(() => sentences.map(() => null));
  const [sel, setSel] = useState(0);
  const key = result ? (result.correctAnswer as number[]) : null;
  const used = new Set(fill.filter((f): f is number => f != null));

  const pickGap = (k: number) => {
    if (result) return;
    haptic("light");
    if (fill[k] != null) setFill((f) => f.map((x, j) => (j === k ? null : x)));
    setSel(k);
  };
  const pickWord = (w: number) => {
    if (result || used.has(w)) return;
    haptic("light");
    const next = fill.map((x, j) => (j === sel ? w : x));
    setFill(next);
    const free = next.findIndex((x) => x == null);
    if (free >= 0) setSel(free);
  };

  return (
    <>
      <div className="text-center text-xs font-semibold text-muted">{t("clozeHelp")}</div>
      {q.hints && !hint.shown && (
        <div className="mt-2 text-center">
          <MeaningHint text={null} hint={hint} many />
        </div>
      )}
      <ol className="mt-3 space-y-2.5">
        {sentences.map((s, k) => {
          const [a, b] = s.split("___");
          const f = fill[k];
          const ok = key ? f === key[k] : null;
          const cls =
            ok === true
              ? "bg-status-paid/15 text-status-paid"
              : ok === false
                ? "bg-danger/10 text-danger line-through"
                : sel === k && !result
                  ? "bg-primary text-white"
                  : f != null
                    ? "bg-primary-soft text-primary"
                    : "border-b-[3px] border-primary/60 text-muted";
          return (
            <li key={k} className="rounded-2xl bg-surface px-4 py-3 text-[15px] font-semibold leading-relaxed shadow-card ring-1 ring-dark/[0.04]">
              {a}
              <button
                onClick={() => pickGap(k)}
                className={`mx-1 inline-flex min-w-[72px] items-center justify-center rounded-lg px-2 py-0.5 align-baseline text-[15px] font-extrabold ${cls}`}
              >
                {f != null ? bank[f] : " "}
              </button>
              {key && ok === false && <b className="mr-1 text-status-paid">{bank[key[k]]}</b>}
              {b}
              {hint.shown && q.hints?.[k] && <div className="mt-1 text-xs font-medium text-muted">{q.hints[k]}</div>}
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {bank.map((w, k) => (
          <button
            key={k}
            disabled={!!result || used.has(k)}
            onClick={() => pickWord(k)}
            className={`rounded-xl px-3 py-2 text-[15px] font-bold transition active:scale-[0.97] ${
              used.has(k) ? "bg-bg text-muted opacity-50" : "bg-surface ring-1 ring-border"
            }`}
          >
            {w}
          </button>
        ))}
      </div>
      {!result && (
        <div className="mt-4">
          <BigButton disabled={fill.some((f) => f == null) || disabled} onClick={() => onSubmit(fill as number[])}>
            {t("check")}
          </BigButton>
        </div>
      )}
    </>
  );
}

/* ───────────────────────────── word order ───────────────────────────── */

/** Build the example sentence from shuffled word tiles. */
function WordOrder({
  q,
  result,
  onSubmit,
  disabled,
  hint,
}: {
  q: PublicQuestion;
  result: AnswerResult | null;
  onSubmit: (v: string) => void;
  disabled: boolean;
  hint: HintState;
}) {
  const { t } = useLT();
  const tiles = q.tiles!;
  const [order, setOrder] = useState<number[]>([]);
  const placed = new Set(order);
  const ring = result ? (result.correct ? "ring-2 ring-status-paid" : "ring-2 ring-danger") : "ring-1 ring-dark/[0.04]";

  return (
    <>
      <div className="rounded-[24px] bg-surface px-5 py-4 text-center shadow-card ring-1 ring-dark/[0.04]">
        <div className="text-xs font-semibold text-muted">{t("wordOrderHelp")}</div>
        <div className="mt-1 text-2xl font-extrabold">{q.prompt}</div>
        {q.hintMeaning && (
          <div className="mt-2">
            <MeaningHint text={<span className="chip">{q.hintMeaning}</span>} hint={hint} />
          </div>
        )}
      </div>
      <div className={`mt-3 flex min-h-[64px] flex-wrap content-start items-end gap-2 rounded-2xl bg-surface p-3 shadow-card ${ring}`}>
        {order.map((k, pos) => (
          <button
            key={`${k}-${pos}`}
            disabled={!!result}
            onClick={() => {
              haptic("light");
              setOrder((o) => o.filter((_, j) => j !== pos));
            }}
            className="rounded-xl bg-primary-soft px-3 py-2 text-[15px] font-bold text-primary"
          >
            {tiles[k]}
          </button>
        ))}
        {order.length === tiles.length && q.suffix && <span className="pb-2 text-lg font-bold">{q.suffix}</span>}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {tiles.map((w, k) => (
          <button
            key={k}
            disabled={!!result || placed.has(k)}
            onClick={() => {
              haptic("light");
              setOrder((o) => [...o, k]);
            }}
            className={`rounded-xl px-3 py-2 text-[15px] font-bold transition active:scale-[0.97] ${
              placed.has(k) ? "bg-bg text-transparent" : "bg-surface ring-1 ring-border"
            }`}
          >
            {w}
          </button>
        ))}
      </div>
      {!result && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setOrder((o) => o.slice(0, -1))}
            disabled={order.length === 0}
            aria-label={t("clear")}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface text-muted ring-1 ring-border disabled:opacity-40"
          >
            <Undo2 size={20} />
          </button>
          <div className="flex-1">
            <BigButton disabled={order.length !== tiles.length || disabled} onClick={() => onSubmit(order.map((k) => tiles[k]).join(" "))}>
              {t("check")}
            </BigButton>
          </div>
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
