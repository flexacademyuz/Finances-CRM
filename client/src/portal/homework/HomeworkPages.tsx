/**
 * Student-app homework: read-only. Students see each homework as a list of
 * tick boxes (one per task) that their teacher / assistant ticks or crosses,
 * and the group's task tables — nothing is handed in or ticked here.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ClipboardList, Info, Table2 } from "lucide-react";
import { fmtDue } from "@shared/homework";
import { PCard, PageSkeleton, ErrorState, EmptyState } from "../ui";
import { hwApi, MarkBox, StatePill, timeLeft, useHT, type HwListItem, type HwTable } from "./shared";

export function useHomeworkList() {
  return useQuery({ queryKey: ["portal", "homework"], queryFn: () => hwApi<HwListItem[]>("") });
}

function useHomeworkTables() {
  return useQuery({ queryKey: ["portal", "homework", "tables"], queryFn: () => hwApi<HwTable[]>("/tables") });
}

export function HomeworkListPage() {
  const { t } = useHT();
  const q = useHomeworkList();
  const tables = useHomeworkTables();
  const [tab, setTab] = useState<"open" | "done" | "tables">("open");
  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  // To do first (soonest deadline), then the ones not done; done ones on their own tab.
  const open = q.data
    .filter((h) => h.state !== "done")
    .sort((a, b) => (a.state === b.state ? (a.state === "todo" ? a.dueAt.localeCompare(b.dueAt) : b.dueAt.localeCompare(a.dueAt)) : a.state === "todo" ? -1 : 1));
  const done = q.data.filter((h) => h.state === "done");
  const tableList = tables.data ?? [];
  const tabs = tableList.length ? (["open", "done", "tables"] as const) : (["open", "done"] as const);
  const list = tab === "open" ? open : done;
  const count = { open: open.length, done: done.length, tables: tableList.length };
  const label = { open: t("toDo"), done: t("done"), tables: t("tables") };

  return (
    <div className="space-y-3 animate-slide-up">
      <div className="inline-flex w-full rounded-full bg-surface p-1 shadow-card ring-1 ring-dark/[0.04]">
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`flex-1 rounded-full py-2 text-sm font-bold transition ${tab === k ? "bg-primary text-white shadow-brand" : "text-muted"}`}
          >
            {label[k]} <span className="figure opacity-80">({count[k]})</span>
          </button>
        ))}
      </div>
      <div className="flex items-start gap-2 rounded-2xl bg-primary-soft/60 px-3.5 py-2.5 text-xs font-medium text-primary">
        <Info size={15} className="mt-px shrink-0" /> {tab === "tables" ? t("tablesHint") : t("howItWorks")}
      </div>
      {tab === "tables" ? (
        <div className="space-y-2">
          {tableList.map((tb) => (
            <TableCard key={tb.id} tb={tb} />
          ))}
        </div>
      ) : list.length === 0 ? (
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
      <div className="flex items-center justify-between gap-2">
        <StatePill state={h.state} />
        <div className={`text-xs ${h.state === "missed" || soon ? "font-semibold text-danger" : "text-muted"}`}>
          {t("due", { d: fmtDue(h.dueAt, locale) })}
          {h.state === "todo" && ` · ${t("dueIn", { n: timeLeft(h.dueAt, locale) })}`}
        </div>
      </div>
      <ul className="mt-2.5 space-y-2">
        {h.parts.map((p) => (
          <li key={p.id} className="flex items-start gap-2.5">
            <MarkBox mark={p.mark} />
            <span className={`text-sm font-semibold leading-snug ${p.mark === "done" ? "text-muted line-through decoration-status-paid/60" : ""}`}>{p.text}</span>
          </li>
        ))}
      </ul>
      {h.instructions && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{h.instructions}</p>}
    </PCard>
  );
}

function TableCard({ tb }: { tb: HwTable }) {
  const done = tb.columns.filter((c) => c.done).length;
  const numbered = tb.columns.every((c, i) => c.label === String(i + 1));
  return (
    <PCard className="!p-3.5">
      <div className="flex items-center gap-2">
        <Table2 size={16} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1 truncate font-bold">{tb.title}</div>
        <span className={`figure text-sm font-bold ${done === tb.columns.length ? "text-status-paid" : "text-muted"}`}>
          {done}/{tb.columns.length}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-dark/[0.06]">
        <div className="h-full rounded-full bg-status-paid transition-all" style={{ width: `${tb.columns.length ? (done / tb.columns.length) * 100 : 0}%` }} />
      </div>
      {numbered ? (
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {tb.columns.map((c) => (
            <div key={c.id} className="flex flex-col items-center gap-1">
              <MarkBox mark={c.done} />
              <span className="figure text-[11px] font-semibold text-muted">{c.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {tb.columns.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5">
              <MarkBox mark={c.done} />
              <span className={`text-sm font-semibold ${c.done ? "text-muted" : ""}`}>{c.label}</span>
            </li>
          ))}
        </ul>
      )}
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
