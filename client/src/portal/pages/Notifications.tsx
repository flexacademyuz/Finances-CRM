import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BellOff, CheckCheck, ChevronRight } from "lucide-react";
import { renderNotification } from "@shared/notifications";
import { Segmented } from "../../components/ui";
import { haptic } from "../../lib/telegram";
import { papi, type Notification } from "../api";
import { usePT } from "../i18n";
import { useMe } from "../PortalApp";
import { PageSkeleton, ErrorState, EmptyState, relTime } from "../ui";

type Page = { items: Notification[]; nextCursor: string | null; unread: number };

const TONE: Record<string, string> = {
  success: "bg-status-paid/15",
  danger: "bg-status-overdue/15",
  warning: "bg-warning/15",
  info: "bg-primary-soft",
  neutral: "bg-bg",
};

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

export function NotificationsPage() {
  const { t, locale } = usePT();
  const me = useMe();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const readOnly = !!me.preview;

  const q = useInfiniteQuery({
    queryKey: ["portal", "notifications", tab],
    queryFn: ({ pageParam }) =>
      papi<Page>("/notifications", { query: { cursor: pageParam ?? undefined, unread: tab === "unread" ? "1" : undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["portal"] });
  };
  const markOne = useMutation({
    mutationFn: (id: string) => papi(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: () => papi("/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      haptic("success");
      refresh();
    },
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = q.data?.pages[0]?.unread ?? me.unread;

  return (
    <div className="space-y-3 animate-slide-up">
      <div className="flex items-center justify-between gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: t("all") },
            { value: "unread", label: `${t("unread")}${unread ? ` · ${unread}` : ""}` },
          ]}
        />
        {unread > 0 && !readOnly && (
          <button
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-primary"
          >
            <CheckCheck size={16} /> {t("markAllRead")}
          </button>
        )}
      </div>

      {q.isLoading ? (
        <PageSkeleton />
      ) : q.error ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<BellOff size={24} />} title={t("noNotifications")} />
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const r = renderNotification(n.type, n.params, locale);
            const isOpen = expanded === n.id;
            const to = target(n);
            return (
              <div
                key={n.id}
                className={`rounded-[20px] bg-surface shadow-card ring-1 transition ${n.readAt ? "ring-dark/[0.04]" : "ring-primary/25"}`}
              >
                <button
                  className="flex w-full gap-3 p-3.5 text-left"
                  onClick={() => {
                    setExpanded(isOpen ? null : n.id);
                    if (!n.readAt && !readOnly) markOne.mutate(n.id);
                  }}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg ${TONE[r.tone]}`}>{r.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`font-bold ${n.readAt ? "" : "text-text"}`}>{r.title}</span>
                      {!n.readAt && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
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
