import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Award, TrendingUp, TrendingDown, MessageSquareQuote, Paperclip, ChevronRight } from "lucide-react";
import { categoryLabel } from "@shared/scores";
import { fmtDay } from "@shared/notifications";
import { Modal } from "../../components/ui";
import { papi, type Progress, type Score } from "../api";
import { usePT } from "../i18n";
import { PCard, SectionTitle, PageSkeleton, ErrorState, EmptyState, Meter, pctColor } from "../ui";

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_UZ = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];

export function ProgressPage() {
  const { t, locale } = usePT();
  const [cat, setCat] = useState<string>("all");
  const [open, setOpen] = useState<Score | null>(null);
  const progress = useQuery({ queryKey: ["portal", "progress"], queryFn: () => papi<Progress>("/progress") });
  const scores = useQuery({ queryKey: ["portal", "scores"], queryFn: () => papi<Score[]>("/scores") });

  const trend = useMemo(
    () =>
      (progress.data?.analytics.trend ?? []).map((p) => {
        const m = Number(p.month.slice(5, 7)) - 1;
        return { label: (locale === "uz" ? MONTHS_UZ : MONTHS_EN)[m], average: p.average, count: p.count };
      }),
    [progress.data, locale],
  );

  if (progress.isLoading) return <PageSkeleton />;
  if (progress.error || !progress.data) return <ErrorState onRetry={() => progress.refetch()} />;
  const a = progress.data.analytics;

  if (a.count === 0) {
    return <EmptyState icon={<Award size={24} />} title={t("noScores")} hint={t("noScoresHint")} />;
  }

  const categories = [...new Set((scores.data ?? []).map((s) => s.category))];
  const list = (scores.data ?? []).filter((s) => cat === "all" || s.category === cat);

  return (
    <div className="space-y-3 animate-slide-up">
      {/* Headline number */}
      <PCard className="flex items-center gap-4 !p-5">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t("average")}</div>
          <div className="figure mt-1 text-4xl font-extrabold tracking-tight" style={{ color: pctColor(a.average) }}>
            {a.average}%
          </div>
          <div className="mt-1 text-xs text-muted">{t("scoresCount", { n: a.count })}</div>
        </div>
        {a.trendDelta != null && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
              a.trendDelta >= 0 ? "bg-status-paid/15 text-status-paid" : "bg-status-overdue/15 text-status-overdue"
            }`}
          >
            {a.trendDelta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {t("vsLastMonth", { d: `${a.trendDelta >= 0 ? "+" : ""}${a.trendDelta}` })}
          </span>
        )}
      </PCard>

      {/* Strongest / needs work */}
      {a.strongest && a.weakest && (
        <div className="grid grid-cols-2 gap-3">
          <PCard className="!p-3.5">
            <div className="text-xs font-semibold text-status-paid">💪 {t("strongest")}</div>
            <div className="mt-1 truncate font-bold">{categoryLabel(a.strongest.category, locale)}</div>
            <div className="figure text-sm text-muted">{a.strongest.average}%</div>
          </PCard>
          <PCard className="!p-3.5">
            <div className="text-xs font-semibold text-warning">🎯 {t("needsWork")}</div>
            <div className="mt-1 truncate font-bold">{categoryLabel(a.weakest.category, locale)}</div>
            <div className="figure text-sm text-muted">{a.weakest.average}%</div>
          </PCard>
        </div>
      )}

      {/* Trend over time (single series → no legend; the title names it) */}
      {trend.length >= 2 && (
        <PCard>
          <div className="mb-2 text-sm font-bold">{t("overTime")}</div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid vertical={false} stroke="rgba(26,35,56,0.07)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7a8699" }} />
                <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7a8699" }} />
                <Tooltip
                  cursor={{ stroke: "rgba(26,35,56,0.2)", strokeWidth: 1 }}
                  contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 8px 24px -8px rgba(24,32,56,.25)", fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, t("average")]}
                />
                <Line
                  type="monotone"
                  dataKey="average"
                  stroke="#3457f5"
                  strokeWidth={2}
                  dot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: "#3457f5" }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </PCard>
      )}

      {/* By skill */}
      <PCard className="space-y-3">
        <div className="text-sm font-bold">{t("byCategory")}</div>
        {a.byCategory.map((c) => (
          <Meter key={c.category} label={categoryLabel(c.category, locale)} value={c.average} sub={`· ${c.count}`} />
        ))}
      </PCard>

      {/* Recent scores with a category filter */}
      <SectionTitle>{t("recentScores")}</SectionTitle>
      {categories.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {["all", ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                cat === c ? "bg-primary text-white shadow-brand" : "bg-surface text-muted ring-1 ring-border"
              }`}
            >
              {c === "all" ? t("all") : categoryLabel(c, locale)}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {list.map((s) => (
          <PCard key={s.id} onClick={() => setOpen(s)} className="flex items-center gap-3 !p-3.5">
            <div
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-sm font-extrabold"
              style={{ background: `${pctColor(s.percent)}1a`, color: pctColor(s.percent) }}
            >
              {Math.round(s.percent)}%
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{s.title}</div>
              <div className="truncate text-xs text-muted">
                {categoryLabel(s.category, locale)} · {s.score} / {s.maxScore} · {fmtDay(s.scoreDate, locale)}
              </div>
            </div>
            {s.comment && <MessageSquareQuote size={16} className="shrink-0 text-primary" />}
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </PCard>
        ))}
      </div>

      {open && (
        <Modal open onClose={() => setOpen(null)} title={open.title}>
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-sm font-semibold text-muted">{categoryLabel(open.category, locale)}</div>
              <div className="figure mt-1 text-4xl font-extrabold">
                {open.score} <span className="text-xl text-muted">/ {open.maxScore}</span>
              </div>
              <div className="mt-1 text-lg font-bold" style={{ color: pctColor(open.percent) }}>
                {open.percent}%
              </div>
            </div>
            <dl className="divide-y divide-border rounded-2xl bg-bg px-4 text-sm">
              <div className="flex justify-between py-2.5">
                <dt className="text-muted">{t("teacher")}</dt>
                <dd className="font-semibold">{open.teacherName ?? "—"}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-muted">{t("date")}</dt>
                <dd className="font-semibold">{fmtDay(open.scoreDate, locale)}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-muted">{t("group")}</dt>
                <dd className="font-semibold">{open.className}</dd>
              </div>
            </dl>
            {open.comment && (
              <div className="rounded-2xl bg-primary-soft px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">{t("teacherComment")}</div>
                <p className="mt-1 text-sm">“{open.comment}”</p>
              </div>
            )}
            {open.attachmentUrl && (
              <a
                href={open.attachmentUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="btn btn-ghost w-full"
              >
                <Paperclip size={15} /> {t("attachment")}
              </a>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
