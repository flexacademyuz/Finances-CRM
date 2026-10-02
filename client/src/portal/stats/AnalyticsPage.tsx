/**
 * "My stats": time in the app, a year-long streak calendar (GitHub /
 * Monkeytype style), words per level, accuracy, homework and badges.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Flame, BookOpen, Target, CalendarDays, ClipboardCheck, Trophy, Zap } from "lucide-react";
import { addDaysIso } from "@shared/lesson-schedule";
import { fmtDay } from "@shared/notifications";
import { levelLabel } from "@shared/learning/types";
import type { AchievementCode } from "@shared/learning/gamification";
import { PCard, PageSkeleton, ErrorState, SectionTitle } from "../ui";
import { lapi } from "../learn/api";
import { Badge } from "../learn/ui";
import { useI18n } from "../../lib/i18n";
import { fmtDuration } from "./useAppTime";

type Day = { day: string; xp: number; seconds: number; answers: number; correct: number; newWords: number; practised: boolean };
type Analytics = {
  wordsSeen: number;
  wordsLearned: number;
  wordsMastered: number;
  needPractice: number;
  answers: number;
  accuracy: number | null;
  exercisesAnswered: number;
  exerciseAccuracy: number | null;
  sessionsCompleted: number;
  xp: number;
  streak: number;
  longestStreak: number;
  practisedToday: boolean;
  secondsToday: number;
  seconds7d: number;
  seconds30d: number;
  secondsTotal: number;
  activeDaysTotal: number;
  avgSecondsPerDay30: number;
  practisedDays30: number;
  byMode: { mode: string; total: number; correct: number }[];
  achievements: { code: AchievementCode; earnedAt: string | null }[];
  levels: { resourceId: string; level: string | null; title: string; words: number; studied: number; learned: number; mastered: number; percent: number; stagesCompleted: number; stages: number }[];
  calendar: Day[];
  homework: { assigned: number; done: number; submitted: number; overdue: number; onTime: number; late: number; averagePercent: number | null };
};

const S = {
  title: { en: "My stats", uz: "Statistikam" },
  timeToday: { en: "Time today", uz: "Bugungi vaqt" },
  streak: { en: "Day streak", uz: "Kunlik seriya" },
  best: { en: "Best: {n}", uz: "Eng uzun: {n}" },
  timeInApp: { en: "Time in the app", uz: "Ilovadagi vaqt" },
  week: { en: "7 days", uz: "7 kun" },
  month: { en: "30 days", uz: "30 kun" },
  total: { en: "All time", uz: "Jami" },
  avgDay: { en: "{t} a day on average", uz: "Kuniga o'rtacha {t}" },
  calendar: { en: "Activity", uz: "Faollik" },
  activeDays: { en: "{n} active days", uz: "{n} faol kun" },
  less: { en: "Less", uz: "Kam" },
  more: { en: "More", uz: "Ko'p" },
  noActivity: { en: "No practice", uz: "Mashq qilinmagan" },
  tapDay: { en: "Tap a day to see details", uz: "Batafsil ko'rish uchun kunni bosing" },
  last14: { en: "Last 14 days", uz: "Oxirgi 14 kun" },
  minutes: { en: "Minutes", uz: "Daqiqa" },
  words: { en: "Words", uz: "So'zlar" },
  studied: { en: "Studied", uz: "Ko'rilgan" },
  learned: { en: "Learned", uz: "O'rganilgan" },
  mastered: { en: "Mastered", uz: "O'zlashtirilgan" },
  needPractice: { en: "Need practice", uz: "Mashq kerak" },
  stagesDone: { en: "{a}/{b} stages complete", uz: "{b} tadan {a} bosqich yakunlandi" },
  accuracy: { en: "Accuracy", uz: "Aniqlik" },
  answers: { en: "{n} answers", uz: "{n} ta javob" },
  sets: { en: "{n} practice sets", uz: "{n} ta mashq to'plami" },
  byType: { en: "By exercise type", uz: "Mashq turlari bo'yicha" },
  homework: { en: "Homework", uz: "Uy vazifasi" },
  hwDone: { en: "Done", uz: "Bajarilgan" },
  hwOnTime: { en: "On time", uz: "O'z vaqtida" },
  hwAvg: { en: "Average mark", uz: "O'rtacha baho" },
  hwOverdue: { en: "{n} overdue", uz: "{n} ta muddati o'tgan" },
  achievements: { en: "Achievements", uz: "Yutuqlar" },
  xp: { en: "XP", uz: "XP" },
  newWords: { en: "{n} new words", uz: "{n} ta yangi so'z" },
} as const;

const MODE_LABEL: Record<string, { en: string; uz: string }> = {
  flashcard: { en: "Flashcards", uz: "Kartochkalar" },
  meaning: { en: "Meaning in context", uz: "Kontekstdagi ma'no" },
  en_uz: { en: "English → Uzbek", uz: "Inglizcha → o'zbekcha" },
  uz_en: { en: "Uzbek → English", uz: "O'zbekcha → inglizcha" },
  sentence: { en: "Complete the sentence", uz: "Gapni to'ldirish" },
  matching: { en: "Matching", uz: "Moslashtirish" },
  gap: { en: "Type the word", uz: "So'zni yozish" },
  recognition: { en: "Recognition", uz: "Tanib olish" },
  spelling: { en: "Spelling", uz: "Imlo" },
  word_order: { en: "Word order", uz: "So'z tartibi" },
  cloze: { en: "Fill the gaps", uz: "Bo'sh joylar" },
};

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  uz: ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"],
};
const WEEKDAYS = { en: ["Mon", "", "Wed", "", "Fri", "", ""], uz: ["Du", "", "Cho", "", "Ju", "", ""] };

const todayTashkent = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
/** Monday-based weekday 0..6 of a YYYY-MM-DD date. */
const weekday = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Calendar intensity 0–4 from XP (practice), so a day "lights up" like a streak square. */
function level(d: Day | undefined): number {
  if (!d || !d.practised) return 0;
  if (d.xp >= 200) return 4;
  if (d.xp >= 100) return 3;
  if (d.xp >= 40) return 2;
  return 1;
}
const LEVEL_CLASS = ["bg-dark/[0.07]", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"];

export function AnalyticsPage() {
  const { locale } = useI18n();
  const t = (k: keyof typeof S, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce<string>((s, [a, b]) => s.replaceAll(`{${a}}`, String(b)), S[k][locale]);
  const q = useQuery({ queryKey: ["portal", "learn", "analytics"], queryFn: () => lapi<Analytics>("/analytics") });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const a = q.data;
  const dur = (s: number) => fmtDuration(s, locale);

  return (
    <div className="space-y-3 animate-slide-up">
      <div className="grid grid-cols-2 gap-3">
        <div className="hero !p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white/85">
            <Clock size={14} /> {t("timeToday")}
          </div>
          <div className="figure mt-1 text-2xl font-extrabold">{dur(a.secondsToday)}</div>
        </div>
        <PCard className="!p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-muted">
            <Flame size={14} className={a.practisedToday ? "text-warning" : ""} /> {t("streak")}
          </div>
          <div className="figure mt-1 text-2xl font-extrabold">{a.streak}</div>
          <div className="text-[11px] text-muted">{t("best", { n: a.longestStreak })}</div>
        </PCard>
      </div>

      <SectionTitle>{t("calendar")}</SectionTitle>
      <PCard>
        <Heatmap days={a.calendar} locale={locale} t={t} />
      </PCard>

      <SectionTitle>{t("timeInApp")}</SectionTitle>
      <PCard>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Mini label={t("week")} value={dur(a.seconds7d)} />
          <Mini label={t("month")} value={dur(a.seconds30d)} />
          <Mini label={t("total")} value={dur(a.secondsTotal)} />
        </div>
        {a.avgSecondsPerDay30 > 0 && <div className="mt-2 text-center text-xs text-muted">{t("avgDay", { t: dur(a.avgSecondsPerDay30) })}</div>}
        <Last14 days={a.calendar} locale={locale} t={t} />
      </PCard>

      <SectionTitle>{t("words")}</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <Tile icon={<BookOpen size={15} />} tone="bg-bg text-muted" label={t("studied")} value={a.wordsSeen} />
        <Tile icon={<Zap size={15} />} tone="bg-primary-soft text-primary" label={t("learned")} value={a.wordsLearned} />
        <Tile icon={<Trophy size={15} />} tone="bg-status-paid/15 text-status-paid" label={t("mastered")} value={a.wordsMastered} />
      </div>
      {a.levels.length > 0 && (
        <PCard className="space-y-3">
          {a.levels.map((l) => (
            <div key={l.resourceId}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-bold">{levelLabel(l.level, locale) || l.title}</span>
                <span className="figure font-extrabold text-primary">{l.percent}%</span>
              </div>
              <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-dark/[0.07]">
                <div className="bg-status-paid" style={{ width: `${(l.mastered / Math.max(1, l.words)) * 100}%` }} />
                <div className="bg-primary/60" style={{ width: `${((l.learned - l.mastered) / Math.max(1, l.words)) * 100}%` }} />
                <div className="bg-warning/60" style={{ width: `${((l.studied - l.learned) / Math.max(1, l.words)) * 100}%` }} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                <span>
                  <Dot c="bg-status-paid" /> {l.mastered} {t("mastered").toLowerCase()}
                </span>
                <span>
                  <Dot c="bg-primary/60" /> {l.learned} {t("learned").toLowerCase()}
                </span>
                <span>
                  <Dot c="bg-warning/60" /> {l.studied} / {l.words} {t("studied").toLowerCase()}
                </span>
                <span>{t("stagesDone", { a: l.stagesCompleted, b: l.stages })}</span>
              </div>
            </div>
          ))}
        </PCard>
      )}

      <SectionTitle>{t("accuracy")}</SectionTitle>
      <PCard>
        <div className="flex items-center gap-4">
          <div className="figure text-3xl font-extrabold text-primary">{a.accuracy == null ? "—" : `${a.accuracy}%`}</div>
          <div className="text-xs text-muted">
            <div>{t("answers", { n: a.answers })}</div>
            <div>{t("sets", { n: a.sessionsCompleted })}</div>
            <div>
              {a.xp} {t("xp")}
            </div>
          </div>
        </div>
        {a.byMode.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t("byType")}</div>
            {[...a.byMode]
              .sort((x, y) => y.total - x.total)
              .map((m) => {
                const pct = m.total ? Math.round((m.correct / m.total) * 100) : 0;
                return (
                  <div key={m.mode} className="flex items-center gap-2 text-xs">
                    <span className="w-36 shrink-0 truncate text-muted">{MODE_LABEL[m.mode]?.[locale] ?? m.mode}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-dark/[0.07]">
                      <div className={`h-full rounded-full ${pct >= 80 ? "bg-status-paid" : pct >= 60 ? "bg-warning" : "bg-danger"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="figure w-10 text-right font-bold">{pct}%</span>
                  </div>
                );
              })}
          </div>
        )}
      </PCard>

      {a.homework.assigned > 0 && (
        <>
          <SectionTitle>{t("homework")}</SectionTitle>
          <PCard>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Mini label={t("hwDone")} value={`${a.homework.done}/${a.homework.assigned}`} icon={<ClipboardCheck size={14} />} />
              <Mini
                label={t("hwOnTime")}
                value={a.homework.onTime + a.homework.late ? `${Math.round((a.homework.onTime / (a.homework.onTime + a.homework.late)) * 100)}%` : "—"}
                icon={<CalendarDays size={14} />}
              />
              <Mini label={t("hwAvg")} value={a.homework.averagePercent == null ? "—" : `${a.homework.averagePercent}%`} icon={<Target size={14} />} />
            </div>
            {a.homework.overdue > 0 && <div className="mt-2 text-center text-xs font-semibold text-danger">{t("hwOverdue", { n: a.homework.overdue })}</div>}
          </PCard>
        </>
      )}

      <SectionTitle>{t("achievements")}</SectionTitle>
      <PCard>
        <div className="grid grid-cols-3 gap-4">
          {a.achievements.map((x) => (
            <Badge key={x.code} code={x.code} earned={!!x.earnedAt} />
          ))}
        </div>
      </PCard>
    </div>
  );
}

type T = (k: keyof typeof S, vars?: Record<string, string | number>) => string;

/** A year of days: 53 week columns × 7 weekday rows, scrolled to today. */
function Heatmap({ days, locale, t }: { days: Day[]; locale: "en" | "uz"; t: T }) {
  const today = todayTashkent();
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const [sel, setSel] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);
  // Start on the Monday 52 weeks before this week's Monday.
  const start = addDaysIso(addDaysIso(today, -weekday(today)), -52 * 7);
  const weeks: string[][] = [];
  for (let w = 0; w < 53; w++) weeks.push(Array.from({ length: 7 }, (_, d) => addDaysIso(start, w * 7 + d)));
  const active = days.filter((d) => d.practised && d.day >= start).length;
  const s = sel ? byDay.get(sel) : undefined;
  const CELL = 12;
  const GAP = 3;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-bold">{t("activeDays", { n: active })}</span>
        <span className="flex items-center gap-1 text-muted">
          {t("less")}
          {LEVEL_CLASS.map((c, i) => (
            <span key={i} className={`inline-block rounded-[3px] ${c}`} style={{ width: 10, height: 10 }} />
          ))}
          {t("more")}
        </span>
      </div>
      <div className="flex gap-1.5">
        <div className="flex shrink-0 flex-col pt-[16px] text-[9px] leading-none text-muted" style={{ gap: GAP }}>
          {WEEKDAYS[locale].map((w, i) => (
            <span key={i} style={{ height: CELL }} className="flex items-center">
              {w}
            </span>
          ))}
        </div>
        <div ref={scroller} className="no-scrollbar overflow-x-auto">
          <div className="flex" style={{ gap: GAP }}>
            {weeks.map((wk, wi) => {
              const first = wk[0];
              const showMonth = wi === 0 || first.slice(5, 7) !== weeks[wi - 1][0].slice(5, 7);
              return (
                <div key={first} className="flex flex-col" style={{ gap: GAP, width: CELL }}>
                  <span className="h-[13px] whitespace-nowrap text-[9px] leading-none text-muted">
                    {showMonth ? MONTHS[locale][Number(first.slice(5, 7)) - 1] : ""}
                  </span>
                  {wk.map((d) => {
                    const future = d > today;
                    const lv = level(byDay.get(d));
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={future}
                        onClick={() => setSel(d === sel ? null : d)}
                        aria-label={fmtDay(d, locale)}
                        className={`rounded-[3px] ${future ? "opacity-0" : LEVEL_CLASS[lv]} ${d === today ? "ring-1 ring-primary ring-offset-1" : ""} ${
                          d === sel ? "ring-2 ring-dark/60" : ""
                        }`}
                        style={{ width: CELL, height: CELL }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 min-h-[34px] rounded-xl bg-bg px-3 py-2 text-xs">
        {sel ? (
          <>
            <b>{fmtDay(sel, locale)}</b>
            {": "}
            {s && (s.practised || s.seconds > 0) ? (
              <span className="text-muted">
                {fmtDuration(s.seconds, locale)} · {s.xp} {t("xp")} · {t("answers", { n: s.answers })}
                {s.answers ? ` (${Math.round((s.correct / s.answers) * 100)}%)` : ""}
                {s.newWords ? ` · ${t("newWords", { n: s.newWords })}` : ""}
              </span>
            ) : (
              <span className="text-muted">{t("noActivity")}</span>
            )}
          </>
        ) : (
          <span className="text-muted">{t("tapDay")}</span>
        )}
      </div>
    </div>
  );
}

function Last14({ days, locale, t }: { days: Day[]; locale: "en" | "uz"; t: T }) {
  const [metric, setMetric] = useState<"min" | "xp">("min");
  const today = todayTashkent();
  const byDay = new Map(days.map((d) => [d.day, d]));
  const list = Array.from({ length: 14 }, (_, k) => addDaysIso(today, k - 13));
  const val = (d: string) => {
    const x = byDay.get(d);
    if (!x) return 0;
    return metric === "min" ? Math.round(x.seconds / 60) : x.xp;
  };
  const max = Math.max(metric === "min" ? 10 : 50, ...list.map(val));
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold">{t("last14")}</span>
        <div className="inline-flex rounded-full bg-bg p-0.5 text-[11px] font-bold">
          {(["min", "xp"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`rounded-full px-2.5 py-1 ${metric === m ? "bg-surface text-text shadow-card" : "text-muted"}`}
            >
              {m === "min" ? t("minutes") : t("xp")}
            </button>
          ))}
        </div>
      </div>
      <div className="flex h-24 items-end gap-1" role="img" aria-label={t("last14")}>
        {list.map((d) => {
          const v = val(d);
          return (
            <div key={d} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5" title={`${fmtDay(d, locale)}: ${v}`}>
              {v > 0 && <span className="figure text-[9px] font-bold text-muted">{v}</span>}
              <div className={`w-full rounded-t-[4px] ${v ? "bg-primary" : "bg-dark/[0.06]"}`} style={{ height: v ? `${Math.max(6, (v / max) * 80)}%` : "4%" }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{fmtDay(list[0], locale)}</span>
        <span>{fmtDay(list[13], locale)}</span>
      </div>
    </div>
  );
}

function Mini({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl bg-bg px-2 py-2.5">
      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-muted">
        {icon}
        {label}
      </div>
      <div className="figure mt-0.5 text-[15px] font-extrabold">{value}</div>
    </div>
  );
}

function Tile({ icon, tone, label, value }: { icon: ReactNode; tone: string; label: string; value: number }) {
  return (
    <PCard className="!p-3">
      <span className={`grid h-7 w-7 place-items-center rounded-full ${tone}`}>{icon}</span>
      <div className="figure mt-1.5 text-xl font-extrabold">{value}</div>
      <div className="text-[11px] font-semibold text-muted">{label}</div>
    </PCard>
  );
}

const Dot = ({ c }: { c: string }) => <span className={`mr-0.5 inline-block h-2 w-2 rounded-full align-middle ${c}`} />;
