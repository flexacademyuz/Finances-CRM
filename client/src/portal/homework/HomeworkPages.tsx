/**
 * Student-app homework: read-only. Students see what's set and whether their
 * teacher / assistant ticked it as done — nothing is handed in here.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ClipboardList, Info } from "lucide-react";
import { fmtDue } from "@shared/homework";
import { PCard, PageSkeleton, ErrorState, EmptyState } from "../ui";
import { hwApi, StatePill, timeLeft, useHT, type HwListItem } from "./shared";

export function useHomeworkList() {
  return useQuery({ queryKey: ["portal", "homework"], queryFn: () => hwApi<HwListItem[]>("") });
}

export function HomeworkListPage() {
  const { t } = useHT();
  const q = useHomeworkList();
  const [tab, setTab] = useState<"open" | "done">("open");
  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  // To do first (soonest deadline), then the ones not done; done ones on their own tab.
  const open = q.data
    .filter((h) => h.state !== "done")
    .sort((a, b) => (a.state === b.state ? (a.state === "todo" ? a.dueAt.localeCompare(b.dueAt) : b.dueAt.localeCompare(a.dueAt)) : a.state === "todo" ? -1 : 1));
  const done = q.data.filter((h) => h.state === "done");
  const list = tab === "open" ? open : done;

  return (
    <div className="space-y-3 animate-slide-up">
      <div className="inline-flex w-full rounded-full bg-surface p-1 shadow-card ring-1 ring-dark/[0.04]">
        {(["open", "done"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`flex-1 rounded-full py-2 text-sm font-bold transition ${tab === k ? "bg-primary text-white shadow-brand" : "text-muted"}`}
          >
            {k === "open" ? t("toDo") : t("done")} <span className="figure opacity-80">({k === "open" ? open.length : done.length})</span>
          </button>
        ))}
      </div>
      <div className="flex items-start gap-2 rounded-2xl bg-primary-soft/60 px-3.5 py-2.5 text-xs font-medium text-primary">
        <Info size={15} className="mt-px shrink-0" /> {t("howItWorks")}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<ClipboardList size={24} />} title={tab === "open" ? t("nothingToDo") : t("nothingDone")} />
      ) : (
        <div className="space-y-2">
          {list.map((h) => (
            <HomeworkCard key={h.id} h={h} />
          ))}
        </div>
      )}
    </div>
  );
}

function HomeworkCard({ h }: { h: HwListItem }) {
  const { t, locale } = useHT();
  const soon = h.state === "todo" && new Date(h.dueAt).getTime() - Date.now() < 24 * 3600_000;
  return (
    <PCard className="!p-3.5">
      <StatePill state={h.state} />
      <div className="mt-1.5 font-bold leading-snug">{h.title}</div>
      {h.instructions && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{h.instructions}</p>}
      <div className={`mt-1 text-xs ${h.state === "missed" || soon ? "font-semibold text-danger" : "text-muted"}`}>
        {t("due", { d: fmtDue(h.dueAt, locale) })}
        {h.state === "todo" && ` · ${t("dueIn", { n: timeLeft(h.dueAt, locale) })}`}
      </div>
    </PCard>
  );
}

/** Compact card for the portal Home: what's due next. */
export function HomeworkHomeCard() {
  const { t, locale } = useHT();
  const q = useHomeworkList();
  if (!q.data || q.data.length === 0) return null;
  const open = q.data.filter((h) => h.state === "todo");
  const next = [...open].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  return (
    <Link href="/homework" className="block">
      <PCard className="flex items-center gap-3 !p-3.5">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${open.length ? "bg-warning/15 text-warning" : "bg-status-paid/15 text-status-paid"}`}>
          <ClipboardList size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-muted">{t("homework")}</div>
          <div className="truncate font-bold">{open.length ? t("pendingN", { n: open.length }) : t("allDone")}</div>
          {next && <div className="truncate text-[11px] text-muted">{t("nextDue", { t: next.title, d: fmtDue(next.dueAt, locale) })}</div>}
        </div>
        <ChevronRight size={18} className="text-muted" />
      </PCard>
    </Link>
  );
}
