import { createContext, useContext } from "react";
import { detectLocale } from "./telegram";

export type Locale = "en" | "uz";

/** Bilingual UI strings (spec §7: English + Uzbek). */
const dict = {
  appName: { en: "Flex Academy Finances", uz: "Flex Academy Moliya" },
  dashboard: { en: "Dashboard", uz: "Boshqaruv paneli" },
  students: { en: "Students", uz: "O'quvchilar" },
  classes: { en: "Classes", uz: "Guruhlar" },
  teachers: { en: "Teachers", uz: "O'qituvchilar" },
  payments: { en: "Payments", uz: "To'lovlar" },
  payroll: { en: "Payroll", uz: "Oylik maosh" },
  users: { en: "Users", uz: "Foydalanuvchilar" },
  reports: { en: "Reports", uz: "Hisobotlar" },
  settings: { en: "Settings", uz: "Sozlamalar" },
  recordPayment: { en: "Record Payment", uz: "To'lovni kiritish" },
  awaiting: { en: "Awaiting / Overdue", uz: "Kutilmoqda / Muddati o'tgan" },
  myClasses: { en: "My Classes", uz: "Mening guruhlarim" },
  mySalary: { en: "My Salary", uz: "Mening maoshim" },

  totalRevenue: { en: "Revenue this month", uz: "Shu oy daromadi" },
  cash: { en: "Cash", uz: "Naqd" },
  online: { en: "Online", uz: "Onlayn" },
  paid: { en: "Paid", uz: "To'langan" },
  awaiting_payment: { en: "Awaiting", uz: "Kutilmoqda" },
  overdue: { en: "Overdue", uz: "Muddati o'tgan" },
  totalStudents: { en: "Total students", uz: "Jami o'quvchilar" },
  payrollObligation: { en: "Payroll estimate", uz: "Maosh hisob-kitobi" },

  teacher: { en: "Teacher", uz: "O'qituvchi" },
  class: { en: "Class", uz: "Guruh" },
  student: { en: "Student", uz: "O'quvchi" },
  amount: { en: "Amount", uz: "Summa" },
  method: { en: "Method", uz: "To'lov turi" },
  date: { en: "Date", uz: "Sana" },
  status: { en: "Status", uz: "Holat" },
  phone: { en: "Phone", uz: "Telefon" },
  fee: { en: "Monthly fee", uz: "Oylik to'lov" },
  save: { en: "Save", uz: "Saqlash" },
  cancel: { en: "Cancel", uz: "Bekor qilish" },
  confirm: { en: "Confirm", uz: "Tasdiqlash" },
  add: { en: "Add", uz: "Qo'shish" },
  search: { en: "Search…", uz: "Qidirish…" },
  selectTeacher: { en: "Select a teacher", uz: "O'qituvchini tanlang" },
  selectClass: { en: "Select a class", uz: "Guruhni tanlang" },
  selectStudent: { en: "Select a student", uz: "O'quvchini tanlang" },
  confirmPayment: { en: "Confirm payment", uz: "To'lovni tasdiqlang" },
  paymentRecorded: { en: "Payment recorded", uz: "To'lov qabul qilindi" },
  notRegistered: {
    en: "Your Telegram account isn't registered. Ask the CEO to add you.",
    uz: "Telegram hisobingiz ro'yxatdan o'tmagan. CEO'dan qo'shishni so'rang.",
  },
  loading: { en: "Loading…", uz: "Yuklanmoqda…" },
  noData: { en: "Nothing here yet.", uz: "Hozircha ma'lumot yo'q." },
  estimatedSalary: { en: "Estimated salary", uz: "Taxminiy maosh" },
  collected: { en: "Collected", uz: "Yig'ilgan" },
  paidStudents: { en: "Paid students", uz: "To'lagan o'quvchilar" },
  gracePeriod: { en: "Grace period (days)", uz: "Imtiyoz muddati (kun)" },
  currency: { en: "Currency", uz: "Valyuta" },
  exportCsv: { en: "Export CSV", uz: "CSV yuklab olish" },
  void: { en: "Void", uz: "Bekor qilish" },
  edit: { en: "Edit", uz: "Tahrirlash" },
  reason: { en: "Reason", uz: "Sabab" },
  role: { en: "Role", uz: "Rol" },
  telegramId: { en: "Telegram ID", uz: "Telegram ID" },
  fullName: { en: "Full name", uz: "To'liq ism" },
  salaryModel: { en: "Salary model", uz: "Maosh modeli" },
  percentage: { en: "% of tuition", uz: "To'lovdan %" },
  per_student: { en: "Per student", uz: "Har o'quvchiga" },
  fixed: { en: "Fixed monthly", uz: "Qat'iy oylik" },
  value: { en: "Value", uz: "Qiymat" },
  invite: { en: "Invite user", uz: "Foydalanuvchi qo'shish" },
} as const;

export type StringKey = keyof typeof dict;

export function translate(key: StringKey, locale: Locale): string {
  return dict[key]?.[locale] ?? key;
}

export const LocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({
  locale: detectLocale(),
  setLocale: () => {},
});

export function useI18n() {
  const { locale, setLocale } = useContext(LocaleContext);
  return { locale, setLocale, t: (k: StringKey) => translate(k, locale) };
}
