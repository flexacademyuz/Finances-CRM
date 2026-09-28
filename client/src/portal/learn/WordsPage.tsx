/** A stage's word list with status filters and bookmark toggles. */
import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Star, Volume2 } from "lucide-react";
import { PCard, PageSkeleton, ErrorState } from "../ui";
import { useMe } from "../PortalApp";
import { lapi, toggleBookmark, speak, canSpeak, type Card } from "./api";
import { useLT, type LKey } from "./i18n";
import { STATUS_COLOR } from "./ui";

const FILTERS: { key: string; label: LKey }[] = [
  { key: "all", label: "filterAll" },
  { key: "new", label: "new" },
  { key: "learning", label: "learning" },
  { key: "need_practice", label: "needPractice" },
  { key: "mastered", label: "mastered" },
  { key: "bookmarked", label: "filterBookmarked" },
];

export function WordsPage() {
  const { t } = useLT();
  const [, params] = useRoute("/learn/stage/:id/words");
  const id = params?.id ?? "";
  const [filter, setFilter] = useState("all");
  const q = useInfiniteQuery({
    queryKey: ["portal", "learn", "words", id, filter],
    queryFn: ({ pageParam }) => lapi<{ items: Card[]; nextAfter: number | null }>(`/stages/${id}/words?filter=${filter}&after=${pageParam}&limit=50`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextAfter ?? undefined,
    enabled: !!id,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-3 animate-slide-up">
      <Link href={`/learn/stage/${id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft size={16} /> {t("allWords")}
      </Link>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-bold ${filter === f.key ? "bg-primary text-white" : "bg-surface text-muted ring-1 ring-border"}`}
          >
            {t(f.label)}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <PageSkeleton />
      ) : q.error ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <PCard className="text-center text-sm text-muted">{t("noWords")}</PCard>
      ) : (
        <WordList cards={items} />
      )}
      {q.hasNextPage && (
        <button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} className="btn btn-ghost w-full">
          {t("loadMore")}
        </button>
      )}
    </div>
  );
}

/** Compact list rows: status dot, word, meaning, listen + bookmark. */
export function WordList({ cards }: { cards: Card[] }) {
  const { t } = useLT();
  const me = useMe();
  const qc = useQueryClient();
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const isSaved = (c: Card) => saved[c.id] ?? c.bookmarked;
  const toggle = (c: Card) => {
    if (me.preview) return;
    const next = !isSaved(c);
    setSaved((s) => ({ ...s, [c.id]: next }));
    toggleBookmark(c.id, next)
      .then(() => qc.invalidateQueries({ queryKey: ["portal", "learn", "home"] }))
      .catch(() => setSaved((s) => ({ ...s, [c.id]: !next })));
  };
  return (
    <PCard className="!p-0">
      <ul className="divide-y divide-border">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[c.status] }} title={c.status} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{c.word}</div>
              <div className="truncate text-sm text-muted">{c.translation}</div>
            </div>
            {canSpeak() && (
              <button aria-label={t("listen")} onClick={() => speak(c.word)} className="grid h-9 w-9 place-items-center rounded-full text-muted">
                <Volume2 size={17} />
              </button>
            )}
            <button
              aria-label={t("bookmark")}
              aria-pressed={isSaved(c)}
              onClick={() => toggle(c)}
              className={`grid h-9 w-9 place-items-center rounded-full ${isSaved(c) ? "text-warning" : "text-muted"}`}
            >
              <Star size={18} fill={isSaved(c) ? "currentColor" : "none"} />
            </button>
          </li>
        ))}
      </ul>
    </PCard>
  );
}
