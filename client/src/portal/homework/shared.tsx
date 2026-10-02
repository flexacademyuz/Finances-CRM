/** Student-app homework: API, strings and small shared pieces. */
import { CheckCircle2, Clock, AlertTriangle, RotateCcw, Hourglass } from "lucide-react";
import type { HomeworkState } from "@shared/homework";
import { papi } from "../api";
import { useI18n } from "../../lib/i18n";
import type { HwFile } from "../../components/HomeworkFiles";

export type HwListItem = {
  id: string;
  kind: "task" | "vocabulary";
  title: string;
  dueAt: string;
  maxScore: number | null;
  state: HomeworkState;
  score: number | null;
  late: boolean;
  submittedAt: string | null;
  vocab: { learned: number; total: number; percent: number; target: number } | null;
};

export type HwDetail = {
  id: string;
  kind: "task" | "vocabulary";
  title: string;
  instructions: string | null;
  linkUrl: string | null;
  dueAt: string;
  maxScore: number | null;
  stage: { id: string; position: number; resourceId: string } | null;
  vocab: { learned: number; total: number; percent: number; target: number } | null;
  files: HwFile[];
  state: HomeworkState;
  submission: {
    status: string;
    answerText: string | null;
    linkUrl: string | null;
    attempt: number;
    submittedAt: string | null;
    late: boolean;
    auto: boolean;
    score: number | null;
    feedback: string | null;
    checkedAt: string | null;
    files: HwFile[];
  } | null;
};

export const hwApi = <T,>(path: string, opts: { method?: string; body?: unknown } = {}) => papi<T>(`/homework${path}`, opts);

const D = {
  homework: { en: "Homework", uz: "Uy vazifasi" },
  vocabulary: { en: "Vocabulary", uz: "Lug'at" },
  toDo: { en: "To do", uz: "Bajarish kerak" },
  done: { en: "Done", uz: "Bajarilgan" },
  nothingToDo: { en: "No homework right now.", uz: "Hozircha uy vazifasi yo'q." },
  nothingDone: { en: "Nothing finished yet.", uz: "Hali bajarilgani yo'q." },
  due: { en: "Due {d}", uz: "Muddat: {d}" },
  dueIn: { en: "{n} left", uz: "{n} qoldi" },
  overdueBy: { en: "Overdue", uz: "Muddati o'tgan" },
  st_todo: { en: "To do", uz: "Bajarilmagan" },
  st_overdue: { en: "Overdue", uz: "Muddati o'tgan" },
  st_submitted: { en: "Waiting for check", uz: "Tekshirilmoqda" },
  st_returned: { en: "Redo", uz: "Qayta bajaring" },
  st_done: { en: "Done", uz: "Bajarildi" },
  late: { en: "late", uz: "kechikkan" },
  vocabTask: { en: "Vocabulary · Stage {n}", uz: "Lug'at · {n}-bosqich" },
  vocabGoal: { en: "Learn {p}% of the words of Stage {n} in the vocabulary app.", uz: "Lug'at ilovasida {n}-bosqich so'zlarining {p}% ini o'rganing." },
  practiseNow: { en: "Practise now", uz: "Hozir mashq qilish" },
  completesItself: { en: "This homework completes itself when you reach the goal.", uz: "Maqsadga yetganingizda bu vazifa o'zi bajarilgan bo'ladi." },
  instructions: { en: "Task", uz: "Topshiriq" },
  materials: { en: "Materials", uz: "Materiallar" },
  openLink: { en: "Open link", uz: "Havolani ochish" },
  yourAnswer: { en: "Your answer", uz: "Javobingiz" },
  answerPlaceholder: { en: "Write your answer here…", uz: "Javobingizni shu yerga yozing…" },
  linkPlaceholder: { en: "Link (Google Drive, video…) — optional", uz: "Havola (Google Drive, video…) — ixtiyoriy" },
  addPhoto: { en: "Photo", uz: "Rasm" },
  photosHint: { en: "Add photos of your notebook or a PDF. Up to 8 files.", uz: "Daftaringiz rasmini yoki PDF qo'shing. 8 tagacha fayl." },
  submit: { en: "Hand in", uz: "Topshirish" },
  resubmit: { en: "Hand in again", uz: "Qayta topshirish" },
  update: { en: "Update my answer", uz: "Javobni yangilash" },
  submitted: { en: "Handed in", uz: "Topshirildi" },
  submittedOn: { en: "Handed in {d}", uz: "Topshirilgan: {d}" },
  waitingCheck: { en: "Your teacher will check it soon. You can still change it until then.", uz: "O'qituvchingiz tez orada tekshiradi. Shu paytgacha o'zgartirishingiz mumkin." },
  returnedTitle: { en: "Sent back for revision", uz: "Qayta ishlash uchun qaytarildi" },
  acceptedTitle: { en: "Accepted", uz: "Qabul qilindi" },
  feedback: { en: "Feedback", uz: "Izoh" },
  mark: { en: "Mark", uz: "Baho" },
  empty: { en: "Add your answer, a photo or a link first.", uz: "Avval javob, rasm yoki havola qo'shing." },
  uploadFailed: { en: "Couldn't upload: {m}", uz: "Yuklab bo'lmadi: {m}" },
  previewOnly: { en: "Preview is read-only.", uz: "Ko'rish rejimi: o'zgartirib bo'lmaydi." },
  back: { en: "Homework", uz: "Uy vazifasi" },
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

export const STATE_STYLE: Record<HomeworkState, { cls: string; Icon: typeof Clock }> = {
  todo: { cls: "bg-primary-soft text-primary", Icon: Clock },
  overdue: { cls: "bg-danger/10 text-danger", Icon: AlertTriangle },
  submitted: { cls: "bg-warning/15 text-warning", Icon: Hourglass },
  returned: { cls: "bg-danger/10 text-danger", Icon: RotateCcw },
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

/** "2 d 4 h left" style countdown to a deadline. */
export function timeLeft(dueAt: string, l: "en" | "uz"): string {
  const ms = new Date(dueAt).getTime() - Date.now();
  const h = Math.floor(ms / 3600_000);
  if (h >= 48) return l === "uz" ? `${Math.floor(h / 24)} kun` : `${Math.floor(h / 24)} days`;
  if (h >= 1) return l === "uz" ? `${h} soat` : `${h} h`;
  const m = Math.max(1, Math.floor(ms / 60_000));
  return l === "uz" ? `${m} daq` : `${m} min`;
}
