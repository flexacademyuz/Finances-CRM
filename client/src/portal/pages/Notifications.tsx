import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BellOff, ChevronRight, Eye } from "lucide-react";
import { renderNotification } from "@shared/notifications";
import { papi, type Notification } from "../api";
import { usePT } from "../i18n";
import { useMe } from "../PortalApp";
import { PageSkeleton, ErrorState, EmptyState, NotifIcon, relTime } from "../ui";

type Page = { items: Notification[]; nextCursor: string | null; unread: number };

/** Where a notification's "Open" goes inside the portal. */
function target(n: Notification): string | null {
  switch (n.category) {
    case "financial":
      return "/payments";
    case "academic":
      return "/progress";
    case "attendance":
      return "/attendance";
    default:
      return null;
  }
}

/**
 * Notification centre. Opening it marks everything read (so the badges clear),
 * while the items that were new on this visit keep a "New" highlight until the
 * student leaves the page. In staff preview nothing is written to the
 * student's data — read state is only tracked on screen.
 */
export function NotificationsPage() {
  const { t, locale } = usePT();
  const me = useMe();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string> | null>(null);
  const markedOnOpen = useRef(false);
  const preview = !!me.preview;

  const q = useInfiniteQuery({
    queryKey: ["portal", "notifications"],
    queryFn: ({ pageParam }) => papi<Page>("/notifications", { query: { cursor: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const readAll = useMutation({
    mutationFn: () => papi("/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      // Clear the bell / tab badges and the Home preview dots.
      void qc.invalidateQueries({ queryKey: ["portal", "me"] });
      void qc.invalidateQueries({ queryKey: ["portal", "dashboard"] });
    },
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  // First load: remember what was unread, then mark it all read.
  useEffect(() => {
    if (!q.data || fresh) return;
    const unread = new Set(items.filter((n) => !n.readAt).map((n) => n.id));
    setFresh(unread);
    if (unread.size > 0 && !preview && !markedOnOpen.current) {
      markedOnOpen.current = true;
      readAll.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  // Older pages loaded later may hold unread items too.
  useEffect(() => {
    if (!fresh || preview) return;
    const more = items.filter((n) => !n.readAt && !fresh.has(n.id));
    if (more.length) {
      setFresh(new Set([...fresh, ...more.map((n) => n.id)]));
      readAll.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.pages.length]);

  if (q.isLoading) return <PageSkeleton />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;

  return (
    <div className="space-y-3 animate-slide-up">
      {preview && (
        <div className="flex items-start gap-2 rounded-2xl bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">
          <Eye size={14} className="mt-0.5 shrink-0" />
          {t("previewReadNote")}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<BellOff size={24} />} title={t("noNotifications")} />
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const r = renderNotification(n.type, n.params, locale);
            const isNew = fresh?.has(n.id) ?? !n.readAt;
            const isOpen = expanded === n.id;
            const to = target(n);
            return (
              <div
                key={n.id}
                className={`rounded-[20px] bg-surface shadow-card ring-1 transition ${isNew ? "ring-primary/30" : "ring-dark/[0.04]"}`}
              >
                <button className="flex w-full gap-3 p-3.5 text-left" onClick={() => setExpanded(isOpen ? null : n.id)}>
                  <NotifIcon icon={r.icon} tone={r.tone} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold">{r.title}</span>
                      {isNew && (
                        <span className="mt-0.5 shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                          {t("newBadge")}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-medium text-muted">{relTime(n.createdAt, t, locale)}</div>
                    <p className={`mt-1 whitespace-pre-line text-sm text-text/80 ${isOpen ? "" : "line-clamp-2"}`}>{r.body}</p>
                  </div>
                </button>
                {isOpen && to && (
                  <button
                    onClick={() => navigate(to)}
                    className="flex w-full items-center justify-between border-t border-border px-4 py-2.5 text-sm font-semibold text-primary"
                  >
                    {t("open")} <ChevronRight size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {q.hasNextPage && (
        <button className="btn btn-ghost w-full" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          {t("loadMore")}
        </button>
      )}
    </div>
  );
}
