/** Student-app homework (read-only): API, strings and the status pill. */
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import type { HomeworkState } from "@shared/homework";
import { papi } from "../api";
import { useI18n } from "../../lib/i18n";

export type HwListItem = {
  id: string;
  title: string;
  instructions: string | null;
  dueAt: string;
  state: HomeworkState;
};

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
