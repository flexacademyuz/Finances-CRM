/**
 * Sentence-building round (/learn/grammar/:slug/build), full-screen.
 *
 * One item at a time: the Uzbek meaning is the goal; the student taps word
 * bubbles (the sentence's words + 1–2 traps) into the answer line, taps a
 * placed bubble to send it back, then Check. The server grades; a wrong item
 * moves to the end of the queue and must be done again. In "review" mode
 * (after a failed test) the queue is the test sentences they got wrong.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, X, Undo2, Trophy, PenLine, RotateCcw, Eye, AlertTriangle, Puzzle } from "lucide-react";
import type { GrammarBuildResult, GrammarBuildRound } from "@shared/grammar/types";
import type { ApiError } from "../../../lib/api";
import { haptic } from "../../../lib/telegram";
import { useMe } from "../../PortalApp";
import { EmptyState } from "../../ui";
import { BigButton, PlayerShell } from "../ui";
import { answerBuild, displaySentence, gKeys, startBuild, useGrammarTopic } from "./api";
import { grammarErrorText } from "./GrammarPages";
import { useGT } from "./i18n";

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function GrammarBuildPage() {
  const { t } = useGT();
  const me = useMe();
  const [, params] = useRoute("/learn/grammar/:slug/build");
  const slug = params?.slug ?? "";
  const [, go] = useLocation();
  const qc = useQueryClient();
  const topic = useGrammarTopic(slug);

  const [round, setRound] = useState<GrammarBuildRound | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [queue, setQueue] = useState<number[]>([]);
  /** Bubble display order per item (re-shuffled when an item comes back). */
  const [orders, setOrders] = useState<Record<number, number[]>>({});
  const [placed, setPlaced] = useState<number[]>([]);
  const [result, setResult] = useState<GrammarBuildResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [xp, setXp] = useState(0);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);
  const started = useRef(-1);
  /** Build progress the student had before this round began (a resumed round). */
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!slug || started.current === run) return;
    started.current = run;
    setRound(null);
    setError(null);
    setPlaced([]);
    setResult(null);
    setDone(false);
    setOrders({});
    startBuild(slug)
      .then((r) => {
        setRound(r);
        setQueue(r.items.map((x) => x.index));
      })
      .catch((e: ApiError) => setError(e));
  }, [run, slug]);

  // A resumed build round may hold only the sentences still to do: count the
  // ones already done so the bar shows real progress through the topic.
  useEffect(() => {
    if (!round || round.mode !== "build" || !topic.data) return;
    setOffset((o) => (o > 0 ? o : Math.max(0, topic.data.buildTotal - round.items.length)));
  }, [round, topic.data]);

  const close = () => go(`/learn/grammar/${slug}`);

  if (error) {
    const msg = grammarErrorText(error, t) ?? error.message;
    const preview = error.code === "preview_read_only";
    return (
      <PlayerShell progress={0} onClose={close}>
        <div className="mt-8">
          <EmptyState icon={preview ? <Eye size={24} /> : <AlertTriangle size={24} />} title={msg} />
          <div className="mt-4 space-y-3">
            {!preview && error.code !== "locked" && error.status !== 404 && (
              <BigButton onClick={() => setRun((r) => r + 1)}>
                <RotateCcw size={18} /> {t("startAgain")}
              </BigButton>
            )}
            <BigButton tone="ghost" onClick={close}>
              {t("backToTopic")}
            </BigButton>
          </div>
        </div>
      </PlayerShell>
    );
  }

  if (!round) {
    return (
      <PlayerShell progress={0} onClose={close}>
        <div className="mt-10 text-center text-sm font-semibold text-muted">{t("preparing")}</div>
        <div className="mx-auto mt-4 h-40 w-full animate-pulse rounded-[24px] bg-dark/[0.06]" />
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {[64, 88, 52, 76, 60].map((w, i) => (
            <div key={i} className="h-12 animate-pulse rounded-2xl bg-dark/[0.06]" style={{ width: w }} />
          ))}
        </div>
      </PlayerShell>
    );
  }

  const review = round.mode === "review";

  if (round.items.length === 0) {
    return (
      <PlayerShell progress={100} onClose={close}>
        <div className="mt-8">
          <EmptyState icon={<Puzzle size={24} />} title={t("nothingToBuild")} />
          <div className="mt-4">
            <BigButton tone="ghost" onClick={close}>
              {t("backToTopic")}
            </BigButton>
          </div>
        </div>
      </PlayerShell>
    );
  }

  if (done) {
    const canTest = topic.data?.canTest ?? false;
    return (
      <PlayerShell progress={100} onClose={close}>
        <div className="learn-pop mt-8 flex flex-1 flex-col items-center text-center">
          <div className="grid h-20 w-20 place-items-center rounded-[28px] bg-status-paid/15 text-status-paid">
            <Trophy size={38} />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">{review ? t("reviewDone") : t("roundDone")}</h1>
          <p className="mt-1 max-w-xs text-sm text-muted">{review ? t("reviewDoneBody") : t("roundDoneBody")}</p>
          {xp > 0 && <div className="mt-3 rounded-full bg-warning/15 px-3 py-1 text-sm font-extrabold text-warning">{t("earnedXp", { n: xp })}</div>}
          <div className="mt-auto w-full space-y-3 pb-4 pt-8">
            {canTest && (
              <BigButton onClick={() => go(`/learn/grammar/${slug}/test`)}>
                <PenLine size={18} /> {review ? t("retakeTest") : t("takeTest")}
              </BigButton>
            )}
            <BigButton tone="ghost" onClick={close}>
              {t("backToTopic")}
            </BigButton>
          </div>
        </div>
      </PlayerShell>
    );
  }

  const total = round.items.length;
  const cur = round.items.find((x) => x.index === queue[0]) ?? round.items[0];
  const order = orders[cur.index] ?? cur.bubbles.map((_, k) => k);
  const tokens = placed.map((k) => cur.bubbles[k]);
  const placedSet = new Set(placed);
  const doneCount = total - queue.length + (result?.correct ? 1 : 0);
  const progress = ((offset + doneCount) / Math.max(1, offset + total)) * 100;

  const check = async () => {
    if (busy || result || placed.length === 0) return;
    setBusy(true);
    try {
      const r = await answerBuild(round.sessionId, cur.index, tokens);
      haptic(r.correct ? "success" : "error");
      setResult(r);
      setXp((x) => x + (r.xp || 0));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (!result) return;
    haptic("light");
    if (result.roundDone) {
      setDone(true);
      void qc.invalidateQueries({ queryKey: gKeys.all });
      return;
    }
    const [head, ...rest] = queue;
    const q2 = result.correct ? rest : [...rest, head];
    if (!result.correct) setOrders((o) => ({ ...o, [head]: shuffled(cur.bubbles.length) }));
    setPlaced([]);
    setResult(null);
    if (q2.length === 0) {
      // Out of sync with the server (it still wants more): fetch the round again.
      setRun((r) => r + 1);
      return;
    }
    setQueue(q2);
  };

  const place = (k: number) => {
    if (result || placedSet.has(k)) return;
    haptic("light");
    setPlaced((p) => [...p, k]);
  };
  const unplace = (pos: number) => {
    if (result) return;
    haptic("light");
    setPlaced((p) => p.filter((_, j) => j !== pos));
  };

  const lineRing = result ? (result.correct ? "ring-2 ring-status-paid bg-status-paid/[0.06]" : "ring-2 ring-danger bg-danger/[0.05]") : "ring-1 ring-dark/[0.06]";
  const placedCls = result ? (result.correct ? "bg-status-paid/15 text-status-paid" : "bg-danger/10 text-danger") : "bg-primary-soft text-primary active:scale-95";

  return (
    <PlayerShell progress={progress} onClose={close}>
      {review ? (
        <div className="flex items-start gap-2 rounded-2xl bg-danger/10 px-3 py-2 text-[13px] font-bold text-danger">
          <RotateCcw size={15} className="mt-0.5 shrink-0" />
          <span>{t("fixBeforeRetry")}</span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 px-1 text-xs font-semibold text-muted">
          <span>{t("buildGoal")}</span>
          <span className="figure">
            {Math.min(offset + doneCount + (result?.correct ? 0 : 1), offset + total)} / {offset + total}
          </span>
        </div>
      )}
      {me.preview && <div className="mt-2 rounded-xl bg-warning/15 px-3 py-1.5 text-xs font-semibold text-warning">{t("previewNote")}</div>}

      <div key={`${cur.index}-${queue.length}`} className="learn-pop mt-3 flex flex-1 flex-col">
        {/* Goal: the Uzbek meaning */}
        <div className="rounded-[24px] bg-surface px-4 py-5 text-center shadow-card ring-1 ring-dark/[0.04]">
          <div className="break-words text-[22px] font-extrabold leading-snug">{cur.uz}</div>
        </div>

        {/* Answer line */}
        <div
          className={`mt-3 flex min-h-[124px] flex-wrap content-start items-start gap-2 rounded-2xl p-3 transition-colors ${result ? "" : "bg-surface"} ${lineRing}`}
          aria-live="polite"
        >
          {placed.length === 0 && <span className="m-auto text-sm font-semibold text-muted/70">{t("answerHere")}</span>}
          {placed.map((k, pos) => (
            <button
              key={`${k}-${pos}`}
              type="button"
              disabled={!!result}
              onClick={() => unplace(pos)}
              className={`learn-pop min-h-[48px] max-w-full break-words rounded-2xl px-4 py-2 text-[17px] font-bold transition ${placedCls}`}
            >
              {cur.bubbles[k]}
            </button>
          ))}
        </div>

        {/* Bubble pool */}
        {!result && (
          <>
            <div className="mt-3 text-center text-xs font-semibold text-muted">{t("tapWords")}</div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {order.map((k) => {
                const used = placedSet.has(k);
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={used}
                    onClick={() => place(k)}
                    aria-hidden={used}
                    className={`min-h-[48px] max-w-full break-words rounded-2xl px-4 py-2 text-[17px] font-bold transition active:scale-95 ${
                      used ? "bg-dark/[0.05] text-transparent shadow-none" : "bg-surface text-text shadow-[0_3px_0_0_rgba(26,35,56,0.10)] ring-1 ring-border"
                    }`}
                  >
                    {cur.bubbles[k]}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {!result ? (
          <div className="mt-auto flex gap-2 pb-4 pt-5">
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setPlaced((p) => p.slice(0, -1));
              }}
              disabled={placed.length === 0}
              aria-label={t("undo")}
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface text-muted ring-1 ring-border disabled:opacity-40"
            >
              <Undo2 size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <BigButton disabled={placed.length === 0 || busy || !!me.preview} onClick={check}>
                {t("check")}
              </BigButton>
            </div>
          </div>
        ) : (
          <div
            className={`learn-pop -mx-4 mt-auto rounded-t-[24px] px-4 pb-4 pt-4 ${result.correct ? "bg-status-paid/15" : "bg-danger/10"}`}
            role="status"
            aria-live="polite"
          >
            <div className={`flex items-center gap-2 text-lg font-extrabold ${result.correct ? "text-status-paid" : "text-danger"}`}>
              {result.correct ? <Check size={22} /> : <X size={22} />}
              {result.correct ? t("correct") : t("wrong")}
              {result.xp > 0 && <span className="ml-auto text-sm font-bold text-warning">{t("earnedXp", { n: result.xp })}</span>}
            </div>
            {result.correct ? (
              <div className="mt-1 break-words text-[17px] font-bold">{displaySentence(tokens, cur.uz)}</div>
            ) : (
              <>
                <div className="mt-1 text-sm font-semibold text-muted">{t("correctAnswer")}</div>
                <div className="break-words text-[17px] font-bold text-text">{result.expected}</div>
                {!result.roundDone && <div className="mt-1 text-xs font-semibold text-muted">{t("comesBack")}</div>}
              </>
            )}
            <div className="mt-3">
              <BigButton tone={result.correct ? "success" : "danger"} onClick={next}>
                {t("continue")} <ArrowRight size={18} />
              </BigButton>
            </div>
          </div>
        )}
      </div>
    </PlayerShell>
  );
}
