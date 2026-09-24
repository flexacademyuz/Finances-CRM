import { useContext, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  HandCoins,
  PieChart,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { LocaleContext, type Locale } from "../lib/i18n";

/**
 * Public marketing page — sells the platform to other academies. Shown to
 * logged-out web visitors at "/" (and always at "/welcome"); needs no API.
 * Everything visual is CSS/SVG (see the `.lp-*` classes in index.css).
 */

// ── Sales settings — edit these before going live. ──────────────────────────
const BRAND = "FinancesCRM";
/** Where every "Book a demo" button goes (a Telegram chat, a form, a wa.me link…). */
const DEMO_URL = "https://t.me/your_sales_handle";
/** Monthly price per plan, e.g. "990 000". `null` shows "Let's talk". */
const PRICES: Record<"starter" | "growth" | "network", string | null> = {
  starter: null,
  growth: null,
  network: null,
};

type Copy = typeof en;

const en = {
  nav: { features: "Features", how: "How it works", pricing: "Pricing", faq: "FAQ", login: "Log in", demo: "Book a demo" },
  hero: {
    badge: "Built for learning centers in Uzbekistan",
    title: ["Your academy's finances,", "on autopilot"],
    sub: "Payments, debts, teacher salaries and schedules for every branch, in one place and right inside Telegram. No spreadsheets. No chasing.",
    cta: "Book a free demo",
    cta2: "See how it works",
    chips: ["Works inside Telegram", "Multi-branch", "English & O'zbek"],
  },
  dash: {
    title: "CEO dashboard",
    month: "This month",
    collected: "Collected",
    vsLast: "vs last month",
    paid: "Paid",
    awaiting: "Awaiting",
    overdue: "Overdue",
    students: "students",
    recent: "Recent payments",
    trend: "Revenue, 6 months",
  },
  stats: [
    { big: "1 tap", small: "to record a payment from your phone" },
    { big: "Daily", small: "automatic debt & overdue checks" },
    { big: "∞", small: "branches, groups and students" },
    { big: "0", small: "spreadsheets to reconcile" },
  ],
  features: {
    kicker: "Everything a learning center runs on",
    title: "One platform instead of five notebooks",
    debt: {
      t: "Payments that chase themselves",
      d: "Every student's paid period is tracked to the day. When it runs out they move to Awaiting, then Overdue after your grace period. Partial payments and top-ups included.",
    },
    tg: {
      t: "Every payment, instantly in Telegram",
      d: "The bot posts each payment to the right branch group and messages your finance team. You watch money arrive in real time.",
      msg: "Payment received",
    },
    payroll: {
      t: "Teacher salaries without the math",
      d: "Calculated from what students actually paid, with advances, payouts and sponsored students handled for you.",
      share: "of month paid",
    },
    timetable: {
      t: "A timetable that catches clashes",
      d: "Plan weekly groups per branch. Teacher and room double-bookings are flagged before they happen.",
      clash: "Clash",
    },
    branches: { t: "One account, every branch", d: "Switch branches in a tap or see the whole network at once." },
    roles: { t: "The right access for everyone", d: "CEO, accountant, assistant and teacher roles with fine-grained permissions." },
    analytics: { t: "Know where every so'm goes", d: "Revenue, expenses, debts and profit by branch and month, plus leads to follow up." },
  },
  how: {
    kicker: "How it works",
    title: "Live in days, not months",
    steps: [
      { t: "Set up your academy", d: "Add branches, groups and teachers. We help you bring over what you already have." },
      { t: "Staff record payments", d: "Admins log a payment in seconds from Telegram. The receipt lands in the right chat." },
      { t: "You see everything, live", d: "Debts, salaries and profit update on their own, per branch and across the network." },
    ],
  },
  pricing: {
    kicker: "Pricing",
    title: "A plan for every size of academy",
    perMonth: "/ month",
    talk: "Let's talk",
    popular: "Most popular",
    choose: "Get started",
    plans: {
      starter: { name: "Starter", for: "For a single center", items: ["1 branch", "Payments & debt tracking", "Telegram bot & alerts", "Teacher salaries"] },
      growth: { name: "Growth", for: "For growing academies", items: ["Up to 3 branches", "Everything in Starter", "Timetable with clash detection", "Roles & permissions", "Analytics & expenses"] },
      network: { name: "Network", for: "For academy chains", items: ["Unlimited branches", "Everything in Growth", "Priority onboarding", "Custom reports"] },
    },
  },
  faq: {
    title: "Questions, answered",
    items: [
      { q: "Do my staff need to install anything?", a: "No. It runs inside Telegram as a Mini App, and in any web browser on a computer." },
      { q: "Can I manage several branches?", a: "Yes. Each branch has its own students, groups, payments and Telegram group, and the CEO can see them all together." },
      { q: "How are teacher salaries calculated?", a: "From the payments students actually made in each group, prorated by how much of the month was paid. Advances and payouts are tracked too." },
      { q: "Who can see the money?", a: "Only who you allow. Access is role-based, staff can be limited to their own branches, and every payment records who took it." },
      { q: "We use Excel today. Can we switch?", a: "Yes. During onboarding we help you bring over your students, groups and current balances." },
    ],
  },
  final: { title: "Stop chasing payments. Start running your academy.", sub: "See it working with your own groups in a 20-minute demo.", cta: "Book a free demo" },
  footer: "Finance software for learning centers in Uzbekistan.",
};

const uz: Copy = {
  nav: { features: "Imkoniyatlar", how: "Qanday ishlaydi", pricing: "Narxlar", faq: "Savollar", login: "Kirish", demo: "Demo so'rash" },
  hero: {
    badge: "O'zbekistondagi o'quv markazlari uchun",
    title: ["Akademiyangiz moliyasi", "avtopilotda"],
    sub: "To'lovlar, qarzlar, o'qituvchilar maoshi va dars jadvali: barcha filiallar uchun bir joyda, to'g'ridan-to'g'ri Telegram ichida. Excel ham, qarz quvish ham yo'q.",
    cta: "Bepul demo so'rash",
    cta2: "Qanday ishlashini ko'rish",
    chips: ["Telegram ichida ishlaydi", "Ko'p filialli", "English & O'zbek"],
  },
  dash: {
    title: "Rahbar paneli",
    month: "Shu oy",
    collected: "Yig'ildi",
    vsLast: "o'tgan oyga nisbatan",
    paid: "To'langan",
    awaiting: "Kutilmoqda",
    overdue: "Muddati o'tgan",
    students: "o'quvchi",
    recent: "So'nggi to'lovlar",
    trend: "Daromad, 6 oy",
  },
  stats: [
    { big: "1 bosish", small: "telefondan to'lovni kiritish uchun" },
    { big: "Har kuni", small: "qarzlar avtomatik tekshiriladi" },
    { big: "∞", small: "filial, guruh va o'quvchilar" },
    { big: "0", small: "solishtiriladigan Excel jadval" },
  ],
  features: {
    kicker: "O'quv markazi uchun hamma narsa",
    title: "Beshta daftar o'rniga bitta platforma",
    debt: {
      t: "Qarzlar o'zi kuzatiladi",
      d: "Har bir o'quvchining to'langan davri kunigacha hisoblanadi. Muddat tugasa u \"Kutilmoqda\"ga, imtiyozli kunlardan so'ng \"Muddati o'tgan\"ga o'tadi. Qisman to'lovlar ham hisobga olinadi.",
    },
    tg: {
      t: "Har bir to'lov darhol Telegramda",
      d: "Bot har bir to'lovni tegishli filial guruhiga yuboradi va moliya bo'limiga xabar beradi. Pul tushishini real vaqtda ko'rasiz.",
      msg: "To'lov qabul qilindi",
    },
    payroll: {
      t: "O'qituvchi maoshi hisob-kitobsiz",
      d: "O'quvchilar haqiqatda to'lagan summadan hisoblanadi; avanslar, to'lovlar va homiylikdagi o'quvchilar ham hisobga olinadi.",
      share: "oy to'langan",
    },
    timetable: {
      t: "To'qnashuvlarni ushlaydigan jadval",
      d: "Har bir filial uchun haftalik guruhlarni rejalashtiring. O'qituvchi yoki xona band bo'lsa, oldindan ogohlantiradi.",
      clash: "To'qnashuv",
    },
    branches: { t: "Bitta akkaunt, barcha filiallar", d: "Filiallar orasida bir bosishda o'ting yoki butun tarmoqni birga ko'ring." },
    roles: { t: "Har kimga o'z huquqi", d: "Rahbar, buxgalter, yordamchi va o'qituvchi rollari hamda aniq ruxsatlar." },
    analytics: { t: "Har bir so'm qayerga ketayotganini biling", d: "Filial va oy bo'yicha daromad, xarajat, qarz va foyda, hamda lidlar." },
  },
  how: {
    kicker: "Qanday ishlaydi",
    title: "Oylar emas, bir necha kunda ishga tushadi",
    steps: [
      { t: "Akademiyani sozlang", d: "Filiallar, guruhlar va o'qituvchilarni qo'shing. Mavjud ma'lumotlarni ko'chirishda yordam beramiz." },
      { t: "Xodimlar to'lovni kiritadi", d: "Administrator to'lovni Telegramdan bir necha soniyada kiritadi. Chek kerakli chatga boradi." },
      { t: "Hammasini jonli ko'rasiz", d: "Qarzlar, maoshlar va foyda filial va butun tarmoq bo'yicha o'zi yangilanadi." },
    ],
  },
  pricing: {
    kicker: "Narxlar",
    title: "Har qanday akademiya uchun tarif",
    perMonth: "/ oy",
    talk: "Kelishamiz",
    popular: "Eng mashhur",
    choose: "Boshlash",
    plans: {
      starter: { name: "Starter", for: "Bitta markaz uchun", items: ["1 ta filial", "To'lov va qarzlarni kuzatish", "Telegram bot va xabarlar", "O'qituvchilar maoshi"] },
      growth: { name: "Growth", for: "O'sayotgan akademiyalar uchun", items: ["3 tagacha filial", "Starter'dagi hamma narsa", "To'qnashuvni aniqlovchi jadval", "Rollar va ruxsatlar", "Tahlil va xarajatlar"] },
      network: { name: "Network", for: "Akademiyalar tarmog'i uchun", items: ["Cheksiz filiallar", "Growth'dagi hamma narsa", "Ustuvor ishga tushirish", "Maxsus hisobotlar"] },
    },
  },
  faq: {
    title: "Ko'p beriladigan savollar",
    items: [
      { q: "Xodimlar biror narsa o'rnatishi kerakmi?", a: "Yo'q. U Telegram ichida Mini App sifatida va kompyuterdagi istalgan brauzerda ishlaydi." },
      { q: "Bir nechta filialni boshqarsa bo'ladimi?", a: "Ha. Har bir filialning o'z o'quvchilari, guruhlari, to'lovlari va Telegram guruhi bor, rahbar esa hammasini birga ko'radi." },
      { q: "O'qituvchi maoshi qanday hisoblanadi?", a: "Har bir guruhda o'quvchilar haqiqatda to'lagan summadan, oyning qancha qismi to'langaniga qarab. Avans va to'lovlar ham yuritiladi." },
      { q: "Pulni kim ko'ra oladi?", a: "Faqat siz ruxsat berganlar. Kirish rollarga asoslangan, xodimlarni o'z filiali bilan cheklash mumkin, har bir to'lovda uni kim qabul qilgani yoziladi." },
      { q: "Hozir Excel ishlatamiz. O'tsak bo'ladimi?", a: "Ha. Ishga tushirishda o'quvchilar, guruhlar va joriy balanslarni ko'chirishda yordam beramiz." },
    ],
  },
  final: { title: "Qarz quvishni to'xtating. Akademiyangizni boshqaring.", sub: "20 daqiqalik demoda o'z guruhlaringiz bilan ko'ring.", cta: "Bepul demo so'rash" },
  footer: "O'zbekistondagi o'quv markazlari uchun moliya dasturi.",
};

const COPY: Record<Locale, Copy> = { en, uz };

/* ───────────────────────────── Small pieces ───────────────────────────── */

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-white shadow-brand">
        <Wallet className="h-4 w-4" />
      </span>
      <span className={`text-[17px] font-extrabold tracking-tight ${light ? "text-white" : "text-text"}`}>{BRAND}</span>
    </span>
  );
}

function DemoButton({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <a href={DEMO_URL} target="_blank" rel="noreferrer" className={`btn btn-primary px-5 py-3 ${className}`}>
      {children}
      <ArrowRight className="h-4 w-4" />
    </a>
  );
}

function SectionHead({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      {kicker && <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-primary">{kicker}</div>}
      <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h2>
    </div>
  );
}

/* ───────────────────────────── Hero glass scene ───────────────────────────── */

function GlassScene() {
  return (
    <div className="relative mx-auto h-[360px] w-full max-w-[460px] sm:h-[440px]" aria-hidden>
      {/* soft glow behind the glass */}
      <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-30 blur-3xl" />

      {/* dish + cylinders */}
      <div className="absolute bottom-6 left-1/2 w-[330px] -translate-x-1/2 sm:bottom-8 sm:w-[380px]">
        <div className="lp-dish h-[92px] w-full" />
        <div className="absolute inset-x-0 bottom-[34px] flex items-end justify-center gap-3">
          <div className="lp-cyl" style={{ "--h": "130px", "--fill": "55%", "--tint": "59,110,245" } as React.CSSProperties}>
            <div className="lp-liquid" />
          </div>
          <div className="lp-cyl" style={{ "--h": "190px", "--fill": "68%", "--tint": "114,86,242" } as React.CSSProperties}>
            <div className="lp-liquid" />
          </div>
          <div className="lp-cyl" style={{ "--h": "150px", "--fill": "62%", "--tint": "18,183,160" } as React.CSSProperties}>
            <div className="lp-liquid" />
          </div>
          <div className="lp-cyl" style={{ "--h": "240px", "--fill": "20%", "--tint": "123,92,245" } as React.CSSProperties}>
            <div className="lp-liquid" />
          </div>
        </div>
      </div>

      {/* floating tiles */}
      <div className="lp-float lp-glass absolute left-2 top-6 grid h-[88px] w-[88px] place-items-center rounded-[26px] sm:left-0" style={{ "--r": "-10deg" } as React.CSSProperties}>
        <div className="grid grid-cols-2 gap-1.5">
          <span className="h-5 w-5 rounded-md bg-[#3b6ef5]" />
          <span className="h-5 w-5 rounded-full bg-[#7256f2]" />
          <span className="col-span-2 h-4 rounded-md bg-[#12b7a0]/80" />
        </div>
      </div>
      <div className="lp-float absolute left-[34%] top-0 grid h-[78px] w-[78px] place-items-center rounded-[24px] bg-[#1a2338] shadow-float ring-1 ring-white/10" style={{ "--r": "8deg", "--d": "-2s" } as React.CSSProperties}>
        <HandCoins className="h-8 w-8 text-[#9db2ff]" />
      </div>
      <div className="lp-float lp-glass absolute right-2 top-10 grid h-[92px] w-[92px] place-items-center rounded-[26px] sm:right-0" style={{ "--r": "12deg", "--d": "-4s" } as React.CSSProperties}>
        <TrendingUp className="h-9 w-9 text-violet" strokeWidth={2.4} />
      </div>
      <div className="lp-float absolute right-6 top-[46%] grid h-11 w-11 place-items-center rounded-full bg-primary text-white shadow-brand" style={{ "--d": "-1s" } as React.CSSProperties}>
        <Plus className="h-5 w-5" />
      </div>
      <div
        className="lp-float absolute left-4 top-[48%] h-12 w-12 rounded-full"
        style={{ background: "radial-gradient(circle at 35% 30%, #fff, rgba(157,178,255,.55) 45%, rgba(114,86,242,.55))", boxShadow: "0 18px 30px -12px rgba(114,86,242,.6)", "--d": "-3s" } as React.CSSProperties}
      />
    </div>
  );
}

/* ───────────────────────────── Product mocks ───────────────────────────── */

function Donut() {
  // paid / awaiting / overdue — illustrative split.
  const segs = [
    { v: 78, c: "#12b76a" },
    { v: 15, c: "#f5b53d" },
    { v: 7, c: "#ff5c6c" },
  ];
  const r = 34;
  const C = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg viewBox="0 0 90 90" className="h-24 w-24 -rotate-90">
      <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="12" />
      {segs.map((s, i) => {
        const len = (s.v / 100) * C;
        const el = (
          <circle key={i} cx="45" cy="45" r={r} fill="none" stroke={s.c} strokeWidth="12" strokeDasharray={`${len - 2} ${C}`} strokeDashoffset={-off} strokeLinecap="round" />
        );
        off += len;
        return el;
      })}
    </svg>
  );
}

function DashboardMock({ c }: { c: Copy }) {
  const bars = [52, 61, 58, 70, 76, 88];
  const payments = [
    { n: "Aziza Karimova", g: "IELTS 6.5+", a: "650 000" },
    { n: "Javohir Rustamov", g: "General B1", a: "480 000" },
    { n: "Madina Yusupova", g: "Kids Starter", a: "390 000" },
  ];
  return (
    <div className="lp-dark relative overflow-hidden rounded-[28px] p-5 text-white shadow-float ring-1 ring-white/10 sm:p-7">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold">
          <PieChart className="h-4 w-4 text-[#9db2ff]" /> {c.dash.title}
        </div>
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[1.1fr_1fr_1.2fr]">
        {/* collected */}
        <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
          <div className="text-xs text-white/60">{c.dash.month} · {c.dash.collected}</div>
          <div className="figure mt-1 text-3xl font-extrabold">48 250 000</div>
          <div className="text-xs text-white/60">so'm</div>
          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#12b76a]/20 px-2 py-0.5 text-xs font-bold text-[#5ee6a8]">
            <TrendingUp className="h-3 w-3" /> +12% <span className="font-medium text-white/60">{c.dash.vsLast}</span>
          </div>
          <div className="mt-4 text-[11px] text-white/50">{c.dash.trend}</div>
          <div className="mt-1.5 flex h-16 items-end gap-1.5">
            {bars.map((b, i) => (
              <div key={i} className={`flex-1 rounded-t-md ${i === bars.length - 1 ? "bg-brand" : "bg-white/15"}`} style={{ height: `${b}%` }} />
            ))}
          </div>
        </div>
        {/* status donut */}
        <div className="flex items-center gap-4 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
          <Donut />
          <div className="space-y-2 text-xs">
            {[
              [c.dash.paid, "#12b76a", 312],
              [c.dash.awaiting, "#f5b53d", 60],
              [c.dash.overdue, "#ff5c6c", 28],
            ].map(([l, col, n]) => (
              <div key={l as string} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: col as string }} />
                <span className="text-white/70">{l}</span>
                <span className="figure ml-auto pl-2 font-bold">{n}</span>
              </div>
            ))}
            <div className="pt-1 text-[11px] text-white/45">400 {c.dash.students}</div>
          </div>
        </div>
        {/* recent payments */}
        <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
          <div className="mb-2 text-xs text-white/60">{c.dash.recent}</div>
          <div className="space-y-2.5">
            {payments.map((p) => (
              <div key={p.n} className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-bold">
                  {p.n.split(" ").map((w) => w[0]).join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{p.n}</div>
                  <div className="text-[11px] text-white/50">{p.g}</div>
                </div>
                <div className="figure text-[13px] font-bold text-[#5ee6a8]">+{p.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TelegramMock({ c }: { c: Copy }) {
  return (
    <div className="mt-5 space-y-2">
      <div className="max-w-[270px] rounded-2xl rounded-bl-md bg-white p-3 text-[13px] shadow-card ring-1 ring-dark/5">
        <div className="mb-1 flex items-center gap-1.5 font-bold text-primary">
          <Bell className="h-3.5 w-3.5" /> {c.features.tg.msg}
        </div>
        <div className="figure text-lg font-extrabold">650 000 so'm</div>
        <div className="text-muted">Aziza Karimova · IELTS 6.5+</div>
        <div className="mt-1 text-[11px] text-muted">Chilonzor · 14:32</div>
      </div>
      <div className="ml-6 max-w-[230px] rounded-2xl rounded-bl-md bg-white/70 p-2.5 text-[12px] text-muted shadow-card ring-1 ring-dark/5">
        <span className="font-bold text-text">+480 000 so'm</span> · Javohir R. · General B1
      </div>
    </div>
  );
}

function PayrollMock({ c }: { c: Copy }) {
  const rows = [
    { n: "Dilnoza A.", p: 92, a: "7 480 000" },
    { n: "Sardor M.", p: 76, a: "5 920 000" },
  ];
  return (
    <div className="mt-5 space-y-2.5">
      {rows.map((r) => (
        <div key={r.n} className="rounded-2xl bg-white p-3 shadow-card ring-1 ring-dark/5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-soft text-[11px] font-bold text-violet">
              {r.n.slice(0, 2)}
            </span>
            <div className="flex-1 text-[13px] font-semibold">{r.n}</div>
            <div className="figure text-[13px] font-extrabold">{r.a}</div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
            <div className="h-full rounded-full bg-brand" style={{ width: `${r.p}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-muted">{r.p}% {c.features.payroll.share}</div>
        </div>
      ))}
    </div>
  );
}

function TimetableMock({ c }: { c: Copy }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const blocks: { d: number; top: number; h: number; cls: string; label: string }[] = [
    { d: 0, top: 6, h: 34, cls: "bg-primary-soft text-primary-hover", label: "IELTS" },
    { d: 1, top: 30, h: 30, cls: "bg-violet-soft text-violet", label: "B1" },
    { d: 2, top: 6, h: 34, cls: "bg-primary-soft text-primary-hover", label: "IELTS" },
    { d: 2, top: 48, h: 30, cls: "bg-danger-light text-danger ring-1 ring-danger/40", label: c.features.timetable.clash },
    { d: 3, top: 22, h: 30, cls: "bg-violet-soft text-violet", label: "B1" },
    { d: 4, top: 6, h: 34, cls: "bg-primary-soft text-primary-hover", label: "IELTS" },
  ];
  return (
    <div className="mt-5 grid grid-cols-5 gap-1.5">
      {days.map((d, i) => (
        <div key={d}>
          <div className="mb-1 text-center text-[10px] font-bold uppercase text-muted">{d}</div>
          <div className="relative h-[86px] rounded-xl bg-bg">
            {blocks.filter((b) => b.d === i).map((b, j) => (
              <div key={j} className={`absolute inset-x-1 grid place-items-center rounded-lg text-[9px] font-bold ${b.cls}`} style={{ top: b.top, height: b.h }}>
                {b.label}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────── Page ───────────────────────────── */

export function Landing() {
  const { locale, setLocale } = useContext(LocaleContext);
  const [, navigate] = useLocation();
  const c = COPY[locale];

  const planKeys = ["starter", "growth", "network"] as const;

  return (
    <div className="lp min-h-full overflow-x-hidden text-text">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 px-4 pt-3">
        <nav className="lp-glass mx-auto flex max-w-6xl items-center gap-4 rounded-full py-2 pl-4 pr-2">
          <Logo />
          <div className="ml-6 hidden items-center gap-6 text-sm font-semibold text-muted md:flex">
            <a href="#features" className="hover:text-text">{c.nav.features}</a>
            <a href="#how" className="hover:text-text">{c.nav.how}</a>
            <a href="#pricing" className="hover:text-text">{c.nav.pricing}</a>
            <a href="#faq" className="hover:text-text">{c.nav.faq}</a>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex rounded-full bg-dark/5 p-0.5 text-xs font-bold">
              {(["en", "uz"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  className={`rounded-full px-2.5 py-1 uppercase transition ${locale === l ? "bg-white text-text shadow-sm" : "text-muted"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button onClick={() => navigate("/login")} className="hidden rounded-full px-3 py-2 text-sm font-semibold text-muted hover:text-text sm:block">
              {c.nav.login}
            </button>
            <a href={DEMO_URL} target="_blank" rel="noreferrer" className="rounded-full bg-dark px-4 py-2 text-sm font-bold text-white transition hover:bg-dark/90">
              {c.nav.demo}
            </a>
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto grid max-w-6xl items-center gap-6 px-4 pb-6 pt-12 md:grid-cols-[1.05fr_1fr] md:pt-16">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-primary ring-1 ring-primary/15">
            <Sparkles className="h-3.5 w-3.5" /> {c.hero.badge}
          </div>
          <h1 className="text-[40px] font-extrabold leading-[1.05] sm:text-[56px]">
            {c.hero.title[0]}{" "}
            <span className="bg-brand bg-clip-text text-transparent">{c.hero.title[1]}</span>
          </h1>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted">{c.hero.sub}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <DemoButton>{c.hero.cta}</DemoButton>
            <a href="#how" className="btn rounded-full bg-white/80 px-5 py-3 text-text ring-1 ring-dark/5 hover:bg-white">
              {c.hero.cta2}
            </a>
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            {c.hero.chips.map((ch) => (
              <span key={ch} className="inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-muted ring-1 ring-dark/5">
                <Check className="h-3.5 w-3.5 text-status-paid" /> {ch}
              </span>
            ))}
          </div>
        </div>
        <GlassScene />
      </section>

      {/* ── Product preview ── */}
      <section className="mx-auto max-w-6xl px-4">
        <DashboardMock c={c} />
      </section>

      {/* ── Stats ── */}
      <section className="mx-auto mt-6 grid max-w-6xl grid-cols-2 gap-3 px-4 md:grid-cols-4">
        {c.stats.map((s) => (
          <div key={s.small} className="lp-glass rounded-[22px] p-5">
            <div className="figure bg-brand bg-clip-text text-3xl font-extrabold text-transparent">{s.big}</div>
            <div className="mt-1 text-sm text-muted">{s.small}</div>
          </div>
        ))}
      </section>

      {/* ── Features (bento) ── */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-24">
        <SectionHead kicker={c.features.kicker} title={c.features.title} />
        <div className="grid gap-4 md:grid-cols-6">
          {/* debt automation (dark) */}
          <div className="lp-dark flex flex-col rounded-[28px] p-6 text-white md:col-span-2 md:row-span-2">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"><Wallet className="h-5 w-5" /></div>
            <h3 className="mt-5 text-2xl font-extrabold">{c.features.debt.t}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/65">{c.features.debt.d}</p>
            <div className="mt-6 space-y-2 md:mt-auto md:pt-6">
              {[
                [c.dash.paid, "#12b76a", "bg-[#12b76a]/15"],
                [c.dash.awaiting, "#f5b53d", "bg-[#f5b53d]/15"],
                [c.dash.overdue, "#ff5c6c", "bg-[#ff5c6c]/15"],
              ].map(([l, col, bg], i) => (
                <div key={l} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${bg}`} style={{ marginLeft: i * 14 }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: col }} /> {l}
                  {i < 2 && <ArrowRight className="ml-auto h-3.5 w-3.5 text-white/40" />}
                </div>
              ))}
            </div>
          </div>

          {/* telegram */}
          <div className="lp-glass rounded-[28px] p-6 md:col-span-2">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary"><Send className="h-5 w-5" /></div>
            <h3 className="mt-4 text-xl font-extrabold">{c.features.tg.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{c.features.tg.d}</p>
            <TelegramMock c={c} />
          </div>

          {/* payroll */}
          <div className="lp-glass rounded-[28px] p-6 md:col-span-2">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-soft text-violet"><HandCoins className="h-5 w-5" /></div>
            <h3 className="mt-4 text-xl font-extrabold">{c.features.payroll.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{c.features.payroll.d}</p>
            <PayrollMock c={c} />
          </div>

          {/* timetable */}
          <div className="lp-glass rounded-[28px] p-6 md:col-span-4">
            <div className="grid gap-6 sm:grid-cols-[1fr_1.2fr] sm:items-center">
              <div>
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary"><CalendarClock className="h-5 w-5" /></div>
                <h3 className="mt-4 text-xl font-extrabold">{c.features.timetable.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{c.features.timetable.d}</p>
              </div>
              <TimetableMock c={c} />
            </div>
          </div>

          {/* small trio */}
          {[
            { i: Building2, f: c.features.branches },
            { i: ShieldCheck, f: c.features.roles },
            { i: TrendingUp, f: c.features.analytics },
          ].map(({ i: Icon, f }) => (
            <div key={f.t} className="lp-glass rounded-[28px] p-6 md:col-span-2">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-bg text-text"><Icon className="h-5 w-5" /></div>
              <h3 className="mt-4 text-lg font-extrabold">{f.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-24">
        <SectionHead kicker={c.how.kicker} title={c.how.title} />
        <div className="grid gap-4 md:grid-cols-3">
          {c.how.steps.map((s, i) => (
            <div key={s.t} className="lp-glass relative rounded-[28px] p-6">
              <div className="figure text-5xl font-extrabold text-primary/15">0{i + 1}</div>
              <div className="absolute right-6 top-6 grid h-10 w-10 place-items-center rounded-full bg-brand text-white shadow-brand">
                {[<Users key="u" className="h-4 w-4" />, <Send key="s" className="h-4 w-4" />, <PieChart key="p" className="h-4 w-4" />][i]}
              </div>
              <h3 className="mt-3 text-lg font-extrabold">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-24">
        <SectionHead kicker={c.pricing.kicker} title={c.pricing.title} />
        <div className="grid items-stretch gap-4 md:grid-cols-3">
          {planKeys.map((k) => {
            const plan = c.pricing.plans[k];
            const featured = k === "growth";
            const price = PRICES[k];
            return (
              <div
                key={k}
                className={`relative flex flex-col rounded-[28px] p-6 ${featured ? "lp-dark text-white shadow-float md:-translate-y-3" : "lp-glass"}`}
              >
                {featured && (
                  <span className="absolute right-5 top-5 rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold">{c.pricing.popular}</span>
                )}
                <div className="text-lg font-extrabold">{plan.name}</div>
                <div className={`text-sm ${featured ? "text-white/60" : "text-muted"}`}>{plan.for}</div>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="figure text-3xl font-extrabold">{price ? `${price} so'm` : c.pricing.talk}</span>
                  {price && <span className={`text-sm ${featured ? "text-white/60" : "text-muted"}`}>{c.pricing.perMonth}</span>}
                </div>
                <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                  {plan.items.map((it) => (
                    <li key={it} className="flex items-start gap-2">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${featured ? "text-[#9db2ff]" : "text-primary"}`} /> {it}
                    </li>
                  ))}
                </ul>
                <a
                  href={DEMO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={`btn mt-6 w-full py-3 ${featured ? "btn-primary" : "rounded-btn bg-white text-text ring-1 ring-dark/10 hover:ring-primary"}`}
                >
                  {c.pricing.choose}
                </a>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 pt-24">
        <SectionHead title={c.faq.title} />
        <div className="space-y-3">
          {c.faq.items.map((f) => (
            <details key={f.q} className="lp-glass group rounded-[22px] px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-24">
        <div className="hero relative overflow-hidden rounded-[32px] px-6 py-14 text-center sm:px-12">
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <h2 className="relative mx-auto max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">{c.final.title}</h2>
          <p className="relative mx-auto mt-4 max-w-md text-white/80">{c.final.sub}</p>
          <a
            href={DEMO_URL}
            target="_blank"
            rel="noreferrer"
            className="btn relative mt-8 rounded-full bg-white px-6 py-3 text-primary shadow-float hover:bg-white/90"
          >
            {c.final.cta} <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 pb-10 text-sm text-muted sm:flex-row">
        <Logo />
        <span>{c.footer}</span>
        <span>© {new Date().getFullYear()} {BRAND}</span>
      </footer>
    </div>
  );
}
