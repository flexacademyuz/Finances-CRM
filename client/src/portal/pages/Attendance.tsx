import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarCheck } from "lucide-react";
import type { AttendanceSummary } from "@shared/attendance";
import type { AttendanceStatus } from "@shared/schema";
import { Modal } from "../../components/ui";
import { papi, type AttRecord } from "../api";
import { usePT } from "../i18n";
import {
  PCard,
  SectionTitle,
  PageSkeleton,
  ErrorState,
  EmptyState,
  Ring,
  pctColor,
  AttendancePill,
  ATT_COLOR,
  weekdayShort,
  dayLabel,
} from "../ui";

type Resp = { summary: AttendanceSummary; range: AttendanceSummary; records: AttRecord[] };

const MONTHS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  uz: ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"],
};

const LEGEND: AttendanceStatus[] = ["present", "late", "absent", "excused", "left_early"];

export function AttendancePage() {
  const { t, locale } = usePT();
  const q = useQuery({ queryKey: ["portal", "attendance"], queryFn: () => papi<Resp>("/attendance") });
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth()]);
  const [open, setOpen] = useState<AttRecord | null>(null);

  const byDate = useMemo(() => {
    const m = new Map<string, AttRecord[]>();
    for (const r of q.data?.records ?? []) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return m;
  }, [q.data]);

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const s = q.data.summary;
  if (s.total === 0) return <EmptyState icon={<CalendarCheck size={24} />} title={t("noAttendance")} />;

  const [y, m] = ym;
  const prefix = `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthRecords = q.data.records.filter((r) => r.date.startsWith(prefix));
  const first = new Date(Date.UTC(y, m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid
  const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const shift = (d: number) => setYm(([yy, mm]) => {
    const n = new Date(Date.UTC(yy, mm + d, 1));
    return [n.getUTCFullYear(), n.getUTCMonth()];
  });
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth();

  return (
    <div className="space-y-3 animate-slide-up">
      {/* Summary */}
      <PCard className="flex items-center gap-4 !p-5">
        <Ring value={s.rate} size={96} stroke={10} color={pctColor(s.rate)} />
        <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 text-sm">
          {(
            [
              ["present", s.present],
              ["absent", s.absent],
              ["late", s.late],
              ["excused", s.excused],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: ATT_COLOR[k] }} />
                {t(k)}
              </div>
              <div className="figure text-lg font-extrabold leading-tight">{v}</div>
            </div>
          ))}
        </div>
      </PCard>
      <div className="px-1 text-xs text-muted">
        {t("attendanceRate")}: <span className="font-bold text-text">{s.rate == null ? "—" : `${s.rate}%`}</span>
        {s.leftEarly > 0 && ` · ${t("left_early")}: ${s.leftEarly}`}
      </div>

      {/* Calendar */}
      <PCard>
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => shift(-1)} className="grid h-9 w-9 place-items-center rounded-full bg-bg" aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <div className="font-extrabold">
              {MONTHS[locale][m]} {y}
            </div>
            <div className="text-xs text-muted">{t("lessonsThisMonth", { n: monthRecords.length })}</div>
          </div>
          <button
            onClick={() => shift(1)}
            disabled={isCurrentMonth}
            className="grid h-9 w-9 place-items-center rounded-full bg-bg disabled:opacity-30"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="pb-1 text-[11px] font-semibold text-muted">
              {weekdayShort(i, locale)}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d == null) return <div key={`e${i}`} />;
            const iso = `${prefix}-${String(d).padStart(2, "0")}`;
            const recs = byDate.get(iso);
            const rec = recs?.[0];
            const color = rec ? ATT_COLOR[rec.status] : undefined;
            return (
              <button
                key={iso}
                disabled={!rec}
                onClick={() => rec && setOpen(rec)}
                aria-label={rec ? `${iso} ${t(rec.status)}` : iso}
                className={`relative grid aspect-square place-items-center rounded-xl text-sm font-semibold transition ${
                  rec ? "text-white active:scale-95" : "text-text/70"
                } ${iso === todayIso && !rec ? "ring-2 ring-primary/40" : ""}`}
                style={rec ? { background: color } : undefined}
              >
                {d}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 border-t border-border pt-3">
          {LEGEND.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 text-[11px] text-muted">
              <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: ATT_COLOR[k] }} />
              {t(k)}
            </span>
          ))}
        </div>
      </PCard>

      {/* That month's lessons as a list (same data, text form) */}
      {monthRecords.length > 0 && (
        <>
          <SectionTitle>{MONTHS[locale][m]}</SectionTitle>
          <div className="overflow-hidden rounded-[20px] bg-surface shadow-card ring-1 ring-dark/[0.04]">
            {monthRecords.map((r, i) => (
              <button
                key={r.id}
                onClick={() => setOpen(r)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left active:bg-bg ${i ? "border-t border-border" : ""}`}
              >
                <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: ATT_COLOR[r.status] }} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{dayLabel(r.date, locale)}</div>
                  <div className="truncate text-xs text-muted">
                    {r.className}
                    {r.startTime ? ` · ${r.startTime}` : ""}
                  </div>
                </div>
                <AttendancePill status={r.status} />
              </button>
            ))}
          </div>
        </>
      )}

      {open && (
        <Modal open onClose={() => setOpen(null)} title={dayLabel(open.date, locale)}>
          <div className="space-y-4">
            <div className="flex justify-center">
              <AttendancePill status={open.status} />
            </div>
            <dl className="divide-y divide-border rounded-2xl bg-bg px-4 text-sm">
              <Row label={t("group")} value={open.className} />
              <Row label={t("teacher")} value={open.teacherName ?? "—"} />
              {open.startTime && <Row label={t("time")} value={`${open.startTime}${open.endTime ? `–${open.endTime}` : ""}`} />}
              {open.room && <Row label={t("room")} value={open.room} />}
              {open.topic && <Row label={t("topic")} value={open.topic} />}
            </dl>
            {open.note && (
              <div className="rounded-2xl bg-primary-soft px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">{t("teacherNote")}</div>
                <p className="mt-1 text-sm">{open.note}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
