/**
 * Flashcard player. English word first; tap to reveal the meaning, then
 * "I know" / "I don't know" (saved immediately). Cards the learner doesn't know
 * come back once more at the end of the deck, so a session ends on success.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Volume2, Check, X, Dumbbell, ArrowLeft, Eye } from "lucide-react";
import { posLabel } from "@shared/learning/types";
import { parseExample } from "@shared/learning/text";
import type { AchievementCode } from "@shared/learning/gamification";
import { ACHIEVEMENTS } from "@shared/learning/gamification";
import { haptic } from "../../lib/telegram";
import { useMe } from "../PortalApp";
import { ErrorState, EmptyState } from "../ui";
import { lapi, reviewCard, toggleBookmark, speak, canSpeak, type Card, type DeckMode } from "./api";
import { useLT } from "./i18n";
import { BigButton, PlayerShell, StatusPill } from "./ui";

export function FlashcardsPage() {
  const { t, locale } = useLT();
  const me = useMe();
  const readOnly = !!me.preview;
  const search = new URLSearchParams(useSearch());
  const mode = (search.get("mode") ?? "learn") as DeckMode;
  const unit = search.get("unit") ?? undefined;
  const [, go] = useLocation();
  const qc = useQueryClient();

  const deckQ = useQuery({
    queryKey: ["portal", "learn", "deck", mode, unit ?? ""],
    queryFn: () => lapi<{ cards: Card[] }>(`/deck?mode=${mode}${unit ? `&unit=${unit}` : ""}&limit=20`),
    staleTime: Infinity,
    gcTime: 0,
  });

  const [queue, setQueue] = useState<Card[] | null>(null);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [unknown, setUnknown] = useState(0);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [badges, setBadges] = useState<AchievementCode[]>([]);
  const requeued = useRef(new Set<string>());

  useEffect(() => {
    if (deckQ.data && queue === null) {
      setQueue(deckQ.data.cards);
      setSaved(Object.fromEntries(deckQ.data.cards.map((c) => [c.id, c.bookmarked])));
    }
  }, [deckQ.data, queue]);

  const card = queue?.[i];
  const done = queue !== null && i >= queue.length;

  // Refresh home/stage numbers once the deck is over.
  useEffect(() => {
    if (done) void qc.invalidateQueries({ queryKey: ["portal", "learn"], refetchType: "active" });
  }, [done, qc]);

  // "I know" appears exactly where "Tap to see the meaning" was, so a quick
  // double tap would rate the card by accident. Ignore ratings for a moment
  // after the card is revealed.
  const revealedAt = useRef(0);
  const flip = () => {
    haptic("light");
    setFlipped((f) => {
      if (!f) revealedAt.current = Date.now();
      return !f;
    });
  };

  const rate = (isKnown: boolean) => {
    if (!card || Date.now() - revealedAt.current < 450) return;
    haptic(isKnown ? "success" : "error");
    if (isKnown) setKnown((n) => n + (marks[card.id] === undefined ? 1 : 0));
    else setUnknown((n) => n + (marks[card.id] === undefined ? 1 : 0));
    setMarks((m) => ({ ...m, [card.id]: m[card.id] ?? isKnown }));
    if (!readOnly) {
      reviewCard(card.id, isKnown)
        .then((r) => r.earned.length && setBadges((b) => [...b, ...r.earned]))
        .catch(() => undefined);
    }
    // Missed cards come back once at the end.
    if (!isKnown && !requeued.current.has(card.id)) {
      requeued.current.add(card.id);
      setQueue((q) => (q ? [...q, card] : q));
    }
    setFlipped(false);
    setI((x) => x + 1);
  };

  const bookmark = () => {
    if (!card || readOnly) return;
    const next = !saved[card.id];
    haptic("light");
    setSaved((s) => ({ ...s, [card.id]: next }));
    toggleBookmark(card.id, next).catch(() => setSaved((s) => ({ ...s, [card.id]: !next })));
  };

  // Desktop keys: space/enter flip, ← don't know, → know.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      } else if (flipped && e.key === "ArrowRight") rate(true);
      else if (flipped && e.key === "ArrowLeft") rate(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const total = queue?.length ?? 0;
  const progress = total ? (Math.min(i, total) / total) * 100 : 0;

  if (deckQ.error) return <ErrorState onRetry={() => deckQ.refetch()} />;
  if (queue === null) {
    return (
      <PlayerShell progress={0}>
        <div className="mx-auto mt-6 h-[360px] w-full animate-pulse rounded-[28px] bg-dark/[0.06]" />
      </PlayerShell>
    );
  }
  if (queue.length === 0) {
    return (
      <PlayerShell progress={0}>
        <div className="mt-8">
          <EmptyState icon={<Check size={24} />} title={t("nothingHere")} />
          <div className="mt-4">
            <BigButton tone="ghost" onClick={() => go("/learn")}>
              <ArrowLeft size={18} /> {t("backToLearn")}
            </BigButton>
          </div>
        </div>
      </PlayerShell>
    );
  }

  if (done) {
    const practiceHref =
      mode === "daily" ? "/learn/practice?source=daily" : unit ? `/learn/practice?source=stage&unit=${unit}` : mode === "bookmarks" ? "/learn/practice?source=bookmarks" : "/learn/practice?source=mixed";
    return (
      <PlayerShell progress={100}>
        <div className="learn-pop mt-8 flex flex-1 flex-col items-center text-center">
          <div className="grid h-20 w-20 place-items-center rounded-[28px] bg-status-paid/15 text-status-paid">
            <Check size={40} />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">{t("deckDone")}</h1>
          <p className="mt-2 max-w-xs text-sm text-muted">{t("deckDoneBody", { n: known + unknown, k: known, u: unknown })}</p>
          {badges.length > 0 && <BadgeToast codes={badges} />}
          <div className="mt-auto w-full space-y-3 pt-8">
            <BigButton onClick={() => go(practiceHref)}>
              <Dumbbell size={18} /> {t("practiceExercises")}
            </BigButton>
            <BigButton tone="ghost" onClick={() => go(unit ? `/learn/stage/${unit}` : "/learn")}>
              {t("backToLearn")}
            </BigButton>
          </div>
        </div>
      </PlayerShell>
    );
  }

  return (
    <PlayerShell progress={progress}>
      {readOnly && (
        <div className="mb-2 inline-flex items-center gap-1.5 self-center rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">
          <Eye size={13} /> {t("previewNote")}
        </div>
      )}
      <div className="flex items-center justify-between px-1 text-xs font-semibold text-muted">
        <span>
          {Math.min(i + 1, total)} / {total}
        </span>
        <StatusPill status={card!.status} />
      </div>

      <CardView
        key={`${card!.id}-${i}`}
        card={card!}
        flipped={flipped}
        onFlip={flip}
        saved={!!saved[card!.id]}
        onBookmark={bookmark}
        locale={locale}
        readOnly={readOnly}
      />

      <div className="mt-auto pt-5">
        {flipped ? (
          <div className="grid grid-cols-2 gap-3">
            <BigButton tone="danger" onClick={() => rate(false)}>
              <X size={20} /> {t("iDontKnow")}
            </BigButton>
            <BigButton tone="success" onClick={() => rate(true)}>
              <Check size={20} /> {t("iKnow")}
            </BigButton>
          </div>
        ) : (
          <BigButton onClick={flip}>{t("tapToReveal")}</BigButton>
        )}
      </div>
    </PlayerShell>
  );
}

function CardView({
  card,
  flipped,
  onFlip,
  saved,
  onBookmark,
  locale,
  readOnly,
}: {
  card: Card;
  flipped: boolean;
  onFlip: () => void;
  saved: boolean;
  onBookmark: () => void;
  locale: "en" | "uz";
  readOnly: boolean;
}) {
  const { t } = useLT();
  const ex = useMemo(() => parseExample(card.example), [card.example]);
  const say = (e: React.MouseEvent) => {
    e.stopPropagation();
    speak(card.word);
  };
  const star = (
    <button
      aria-label={t("bookmark")}
      aria-pressed={saved}
      disabled={readOnly}
      onClick={(e) => {
        e.stopPropagation();
        onBookmark();
      }}
      className={`grid h-11 w-11 place-items-center rounded-full ${saved ? "bg-warning/15 text-warning" : "bg-bg text-muted"}`}
    >
      <Star size={20} fill={saved ? "currentColor" : "none"} />
    </button>
  );
  const audio = canSpeak() && (
    <button aria-label={t("listen")} onClick={say} className="grid h-11 w-11 place-items-center rounded-full bg-primary-soft text-primary">
      <Volume2 size={20} />
    </button>
  );

  return (
    <div className="flip learn-pop mt-3 h-[min(58vh,420px)] w-full" onClick={onFlip} role="button" aria-label={t("tapToReveal")}>
      <div className={`flip-inner ${flipped ? "flipped" : ""}`}>
        {/* FRONT: the English word */}
        <div className="flip-face flex flex-col rounded-[28px] bg-surface p-5 shadow-card ring-1 ring-dark/[0.04]">
          <div className="flex justify-between">
            {audio || <span />}
            {star}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="break-words text-[40px] font-extrabold uppercase leading-tight tracking-tight">{card.word}</div>
            {card.phonetic && <div className="mt-2 text-lg text-muted">{card.phonetic}</div>}
          </div>
          <div className="text-center text-xs font-semibold text-muted">{t("tapToReveal")}</div>
        </div>

        {/* BACK: meaning + details */}
        <div className="flip-face flip-back flex flex-col rounded-[28px] bg-surface p-5 shadow-card ring-1 ring-dark/[0.04]">
          <div className="flex justify-between">
            {audio || <span />}
            {star}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="text-sm font-bold uppercase tracking-wide text-muted">{card.word}</div>
            <div className="mt-1 break-words text-[32px] font-extrabold leading-tight text-primary">{card.translation}</div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
              {card.phonetic && <span>{card.phonetic}</span>}
              {card.partOfSpeech && <span className="chip">{posLabel(card.partOfSpeech, locale)}</span>}
            </div>
            {card.imageUrl && <img src={card.imageUrl} alt="" className="mt-3 max-h-24 rounded-xl object-contain" loading="lazy" />}
            {ex && (
              <div className="mt-4 w-full rounded-2xl bg-bg px-4 py-3 text-left">
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted">{t("example")}</div>
                <div className="mt-0.5 text-[15px] leading-snug">
                  {ex.before}
                  <b className="text-primary">{ex.gap}</b>
                  {ex.after}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BadgeToast({ codes }: { codes: AchievementCode[] }) {
  const { t, locale } = useLT();
  const unique = [...new Set(codes)];
  return (
    <div className="learn-pop mt-5 w-full rounded-2xl bg-warning/10 px-4 py-3 text-left">
      <div className="text-[11px] font-bold uppercase tracking-wide text-warning">{t("newBadge")}</div>
      <div className="mt-0.5 font-bold">{unique.map((c) => ACHIEVEMENTS[c][locale]).join(", ")}</div>
    </div>
  );
}
