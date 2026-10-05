/** Student-app homework (read-only): API, strings and the status pill. */
import { CheckCircle2, Clock, AlertTriangle, Check, X } from "lucide-react";
import type { HomeworkState, PartMark } from "@shared/homework";
import { papi } from "../api";
import { useI18n } from "../../lib/i18n";

export type HwListItem = {
  id: string;
  title: string;
  parts: { id: string; text: string; mark: PartMark | null }[];
  instructions: string | null;
  dueAt: string;
  state: HomeworkState;
};

export type HwTable = { id: string; title: string; columns: { id: string; label: string; done: boolean }[] };

export const hwApi = <T,>(path: string) => papi<T>(`/homework${path}`);

const D = {
  homework: { en: "Homework", uz: "Uy vazifasi" },
  toDo: { en: "To do", uz: "Bajarish kerak" },
  done: { en: "Done", uz: "Bajarilgan" },
  nothingToDo: { en: "No homework right now.", uz: "Hozircha uy vazifasi yo'q." },
  nothingDone: { en: "Nothing ticked yet.", uz: "Hali belgilanmagan." },
  due: { en: "Due {d}", uz: "Muddat: {d}" },
  dueIn: { en: "{n} left", uz: "{n} qoldi" },
  st_todo: { en: "To do", uz: "Bajarish kerak" },
  st_missed: { en: "Not done", uz: "Bajarilmagan" },
  st_done: { en: "Done", uz: "Bajarildi" },
  howItWorks: {
    en: "Do your homework in your notebook. Your teacher ticks it as done in class.",
    uz: "Uy vazifasini daftaringizda bajaring. O'qituvchingiz darsda uni bajarilgan deb belgilaydi.",
  },
  pendingN: { en: "{n} to do", uz: "{n} ta bajarish kerak" },
  nextDue: { en: "Next: {t} · {d}", uz: "Keyingisi: {t} · {d}" },
  allDone: { en: "All homework done", uz: "Barcha vazifalar bajarilgan" },
  tables: { en: "Tasks", uz: "Topshiriqlar" },
  tablesHint: {
    en: "Your teacher ticks each task when you finish it. There is no deadline.",
    uz: "Har bir topshiriqni bajarganingizda o'qituvchingiz belgilaydi. Muddat yo'q.",
  },
  markDone: { en: "Done", uz: "Bajarildi" },
  markMissed: { en: "Not done", uz: "Bajarilmagan" },
  markNone: { en: "Not checked yet", uz: "Hali tekshirilmagan" },
} as const;

export function useHT() {
  const { locale } = useI18n();
  const t = (k: keyof typeof D, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce<string>((s, [a, b]) => s.replaceAll(`{${a}}`, String(b)), D[k][locale]);
  return { t, locale };
}

const STATE_STYLE: Record<HomeworkState, { cls: string; Icon: typeof Clock }> = {
  todo: { cls: "bg-primary-soft text-primary", Icon: Clock },
  missed: { cls: "bg-danger/10 text-danger", Icon: AlertTriangle },
  done: { cls: "bg-status-paid/15 text-status-paid", Icon: CheckCircle2 },
};

export function StatePill({ state }: { state: HomeworkState }) {
  const { t } = useHT();
  const s = STATE_STYLE[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.cls}`}>
      <s.Icon size={12} /> {t(`st_${state}` as keyof typeof D)}
    </span>
  );
}

/** "2 days" / "5 h" / "20 min" until a deadline. */
export function timeLeft(dueAt: string, l: "en" | "uz"): string {
  const ms = new Date(dueAt).getTime() - Date.now();
  const h = Math.floor(ms / 3600_000);
  if (h >= 48) return l === "uz" ? `${Math.floor(h / 24)} kun` : `${Math.floor(h / 24)} days`;
  if (h >= 1) return l === "uz" ? `${h} soat` : `${h} h`;
  const m = Math.max(1, Math.floor(ms / 60_000));
  return l === "uz" ? `${m} daq` : `${m} min`;
}

/** A read-only tick box: ticked (done), crossed (not done) or empty (not checked yet). */
export function MarkBox({ mark, size = "md" }: { mark: PartMark | boolean | null; size?: "sm" | "md" }) {
  const { t } = useHT();
  const m = mark === true ? "done" : mark === false ? null : mark;
  const dim = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const cls =
    m === "done"
      ? "border-status-paid bg-status-paid text-white"
      : m === "missed"
        ? "border-danger bg-danger text-white"
        : "border-dark/15 bg-surface text-transparent";
  return (
    <span
      role="img"
      aria-label={m === "done" ? t("markDone") : m === "missed" ? t("markMissed") : t("markNone")}
      className={`grid ${dim} shrink-0 place-items-center rounded-md border-2 ${cls}`}
    >
      {m === "missed" ? <X size={13} strokeWidth={3.5} /> : <Check size={13} strokeWidth={3.5} />}
    </span>
  );
}
