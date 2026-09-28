/** My Bookmarks: saved words + practise them as cards or exercises. */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Star, Layers, Dumbbell } from "lucide-react";
import { PageSkeleton, ErrorState, EmptyState } from "../ui";
import { lapi, type Card } from "./api";
import { useLT } from "./i18n";
import { WordList } from "./WordsPage";

export function BookmarksPage() {
  const { t } = useLT();
  const q = useQuery({ queryKey: ["portal", "learn", "bookmarks"], queryFn: () => lapi<{ cards: Card[] }>("/bookmarks") });
  const cards = q.data?.cards ?? [];
  return (
    <div className="space-y-3 animate-slide-up">
      <Link href="/learn" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft size={16} /> {t("learn")}
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("bookmarks")}</h1>
      {q.isLoading ? (
        <PageSkeleton />
      ) : q.error ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : cards.length === 0 ? (
        <EmptyState icon={<Star size={24} />} title={t("noBookmarks")} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/learn/cards?mode=bookmarks" className="btn btn-primary h-12 rounded-2xl">
              <Layers size={17} /> {t("flashcards")}
            </Link>
            <Link href="/learn/practice?source=bookmarks" className="btn btn-ghost h-12 rounded-2xl">
              <Dumbbell size={17} /> {t("practiceExercises")}
            </Link>
          </div>
          <WordList cards={cards} />
        </>
      )}
    </div>
  );
}
