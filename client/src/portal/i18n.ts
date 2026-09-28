/** Student-portal strings (EN/UZ). Shares the app's LocaleContext. */
import { useI18n } from "../lib/i18n";

const dict = {
  home: { en: "Home", uz: "Asosiy" },
  payments: { en: "Payments", uz: "To'lovlar" },
  progress: { en: "Progress", uz: "Natijalar" },
  attendance: { en: "Attendance", uz: "Davomat" },
  notifications: { en: "Alerts", uz: "Xabarlar" },
  notificationsTitle: { en: "Notifications", uz: "Bildirishnomalar" },
  profile: { en: "Profile", uz: "Profil" },
  hello: { en: "Hello, {name}!", uz: "Salom, {name}!" },
  teacher: { en: "Teacher", uz: "O'qituvchi" },
  room: { en: "Room", uz: "Xona" },
  nextClass: { en: "Next class", uz: "Keyingi dars" },
  noUpcoming: { en: "No upcoming classes scheduled", uz: "Yaqin darslar rejalashtirilmagan" },
  today: { en: "Today", uz: "Bugun" },
  tomorrow: { en: "Tomorrow", uz: "Ertaga" },
  yesterday: { en: "Yesterday", uz: "Kecha" },
  cancelledOn: { en: "Cancelled: {date}", uz: "Bekor qilingan: {date}" },

  // money
  payment: { en: "Payment", uz: "To'lov" },
  allPaid: { en: "All paid", uz: "To'langan" },
  dueNow: { en: "Amount due", uz: "To'lanadigan summa" },
  overdueAmount: { en: "Overdue", uz: "Muddati o'tgan" },
  outstanding: { en: "Outstanding balance", uz: "Qarz qoldig'i" },
  nextPayment: { en: "Next payment", uz: "Keyingi to'lov" },
  monthlyFee: { en: "Monthly fee", uz: "Oylik to'lov" },
  dueIn: { en: "in {n} days", uz: "{n} kundan keyin" },
  dueTodayShort: { en: "due today", uz: "bugun" },
  overdueBy: { en: "{n} days overdue", uz: "{n} kun kechikkan" },
  discount: { en: "Discount", uz: "Chegirma" },
  until: { en: "until {date}", uz: "{date} gacha" },
  freeze: { en: "Payments frozen", uz: "To'lov muzlatilgan" },
  sponsored: { en: "Your studies are fully covered by the academy.", uz: "O'qishingiz to'liq markaz tomonidan qoplanadi." },
  history: { en: "Payment history", uz: "To'lovlar tarixi" },
  noPayments: { en: "No payments yet", uz: "Hozircha to'lovlar yo'q" },
  loadMore: { en: "Load more", uz: "Yana yuklash" },
  statusPaid: { en: "Paid", uz: "To'langan" },
  statusPartial: { en: "Partial", uz: "Qisman" },
  statusOverdue: { en: "Overdue", uz: "Muddati o'tgan" },
  statusAwaiting: { en: "Payment due", uz: "To'lov kutilmoqda" },
  statusFrozen: { en: "Frozen", uz: "Muzlatilgan" },
  statusNotDue: { en: "Not due yet", uz: "Muddati kelmagan" },
  monthlyPayment: { en: "Monthly payment", uz: "Oylik to'lov" },
  forMonth: { en: "For", uz: "Oy" },
  paidOn: { en: "Paid on", uz: "To'langan sana" },
  method: { en: "Method", uz: "Usul" },
  cash: { en: "Cash", uz: "Naqd" },
  online: { en: "Online", uz: "Onlayn" },
  amountDue: { en: "Amount due for the month", uz: "Oy uchun summa" },
  remaining: { en: "Remaining", uz: "Qoldiq" },
  refunded: { en: "Refunded", uz: "Qaytarilgan" },
  installments: { en: "Payments toward this month", uz: "Shu oy uchun to'lovlar" },

  // attendance
  present: { en: "Present", uz: "Keldi" },
  absent: { en: "Absent", uz: "Kelmadi" },
  late: { en: "Late", uz: "Kechikdi" },
  excused: { en: "Excused", uz: "Sababli" },
  left_early: { en: "Left early", uz: "Erta ketdi" },
  attendanceRate: { en: "Attendance rate", uz: "Davomat foizi" },
  last30: { en: "Last 30 days: {rate}", uz: "Oxirgi 30 kun: {rate}" },
  noAttendance: { en: "No attendance recorded yet", uz: "Hali davomat qayd etilmagan" },
  lesson: { en: "Lesson", uz: "Dars" },
  group: { en: "Group", uz: "Guruh" },
  time: { en: "Time", uz: "Vaqt" },
  topic: { en: "Topic", uz: "Mavzu" },
  teacherNote: { en: "Teacher's note", uz: "O'qituvchi izohi" },
  lessonsThisMonth: { en: "{n} lessons this month", uz: "Bu oyda {n} ta dars" },

  // scores
  latestScore: { en: "Latest score", uz: "Oxirgi baho" },
  noScores: { en: "No scores yet", uz: "Hali baholar yo'q" },
  noScoresHint: { en: "Your teacher's marks will appear here.", uz: "O'qituvchi qo'ygan baholar shu yerda ko'rinadi." },
  average: { en: "Average score", uz: "O'rtacha ball" },
  vsLastMonth: { en: "{d} pts vs last month", uz: "o'tgan oyga nisbatan {d} ball" },
  byCategory: { en: "By skill", uz: "Ko'nikmalar bo'yicha" },
  overTime: { en: "Progress over time", uz: "Vaqt bo'yicha o'sish" },
  strongest: { en: "Strongest", uz: "Eng kuchli" },
  needsWork: { en: "Needs work", uz: "E'tibor kerak" },
  recentScores: { en: "Recent scores", uz: "Oxirgi baholar" },
  all: { en: "All", uz: "Hammasi" },
  teacherComment: { en: "Teacher comment", uz: "O'qituvchi izohi" },
  attachment: { en: "Attachment", uz: "Ilova" },
  date: { en: "Date", uz: "Sana" },
  scoresCount: { en: "{n} scores", uz: "{n} ta baho" },

  // notifications
  unread: { en: "Unread", uz: "O'qilmagan" },
  markAllRead: { en: "Mark all read", uz: "Hammasini o'qildi" },
  noNotifications: { en: "You're all caught up", uz: "Yangi xabarlar yo'q" },
  seeAll: { en: "See all", uz: "Hammasi" },
  newCount: { en: "{n} new", uz: "{n} ta yangi" },
  open: { en: "Open", uz: "Ochish" },

  // profile
  enrolled: { en: "Enrolled", uz: "Qabul qilingan" },
  statusLabel: { en: "Status", uz: "Holat" },
  active: { en: "Active", uz: "Faol" },
  stopped: { en: "Stopped", uz: "To'xtatilgan" },
  phone: { en: "Phone", uz: "Telefon" },
  schedule: { en: "Schedule", uz: "Dars jadvali" },
  branch: { en: "Branch", uz: "Filial" },
  telegram: { en: "Telegram", uz: "Telegram" },
  notificationSettings: { en: "Notification settings", uz: "Bildirishnoma sozlamalari" },
  alwaysOnNote: {
    en: "Security notices and overdue-payment alerts are always sent.",
    uz: "Xavfsizlik va muddati o'tgan to'lov xabarlari doim yuboriladi.",
  },
  language: { en: "Language", uz: "Til" },
  disconnect: { en: "Disconnect Telegram", uz: "Telegramni uzish" },
  disconnectConfirm: {
    en: "Disconnect this Telegram account? You'll need to verify again to reconnect.",
    uz: "Bu Telegram hisobini uzasizmi? Qayta ulanish uchun yana tasdiqlash kerak bo'ladi.",
  },
  cancel: { en: "Cancel", uz: "Bekor qilish" },
  confirm: { en: "Confirm", uz: "Tasdiqlash" },
  saved: { en: "Saved", uz: "Saqlandi" },

  // gates / states
  loading: { en: "Loading…", uz: "Yuklanmoqda…" },
  error: { en: "Something went wrong", uz: "Xatolik yuz berdi" },
  retry: { en: "Try again", uz: "Qayta urinish" },
  offline: { en: "Check your connection and try again.", uz: "Internet aloqasini tekshirib, qayta urinib ko'ring." },
  notLinkedTitle: { en: "Connect your account", uz: "Hisobingizni ulang" },
  notLinkedBody: {
    en: "Your Telegram isn't linked to a student yet. Go back to the chat, press /start and follow the steps — it takes a minute.",
    uz: "Telegram hisobingiz hali o'quvchiga ulanmagan. Chatga qayting, /start ni bosing va ko'rsatmalarga amal qiling — bu bir daqiqa oladi.",
  },
  backToChat: { en: "Back to chat", uz: "Chatga qaytish" },
  openInTelegram: {
    en: "Open this page from the academy's Telegram bot.",
    uz: "Bu sahifani markazning Telegram botidan oching.",
  },
  previewBanner: { en: "Preview as student · read-only", uz: "O'quvchi sifatida ko'rish · faqat o'qish" },
  exitPreview: { en: "Exit", uz: "Chiqish" },
} as const;

export type PKey = keyof typeof dict;

export function usePT() {
  const { locale, setLocale } = useI18n();
  const t = (k: PKey, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce<string>((s, [a, b]) => s.replaceAll(`{${a}}`, String(b)), dict[k]?.[locale] ?? k);
  return { t, locale, setLocale };
}
