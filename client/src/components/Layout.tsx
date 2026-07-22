import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Wallet,
  BookOpen,
  BadgeDollarSign,
  ClipboardList,
  UserCog,
  Clock,
  Settings as SettingsIcon,
} from "lucide-react";
import type { Role } from "@shared/schema";
import { useI18n, type StringKey } from "../lib/i18n";
import { haptic } from "../lib/telegram";

type NavItem = { href: string; label: StringKey; icon: ReactNode };

const NAV: Record<Role, NavItem[]> = {
  ceo: [
    { href: "/", label: "dashboard", icon: <LayoutDashboard size={20} /> },
    { href: "/record", label: "recordPayment", icon: <Wallet size={20} /> },
    { href: "/students", label: "students", icon: <GraduationCap size={20} /> },
    { href: "/classes", label: "groups", icon: <BookOpen size={20} /> },
    { href: "/payroll", label: "payroll", icon: <BadgeDollarSign size={20} /> },
    { href: "/payments", label: "payments", icon: <ClipboardList size={20} /> },
    { href: "/users", label: "users", icon: <UserCog size={20} /> },
  ],
  accountant: [
    { href: "/", label: "recordPayment", icon: <Wallet size={20} /> },
    { href: "/students", label: "students", icon: <GraduationCap size={20} /> },
    { href: "/groups", label: "groups", icon: <BookOpen size={20} /> },
    { href: "/payments", label: "payments", icon: <ClipboardList size={20} /> },
    { href: "/awaiting", label: "awaiting", icon: <Clock size={20} /> },
  ],
  teacher: [
    { href: "/", label: "myClasses", icon: <Users size={20} /> },
    { href: "/salary", label: "mySalary", icon: <BadgeDollarSign size={20} /> },
  ],
};

export function Layout({ role, children }: { role: Role; children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const [location] = useLocation();
  const items = NAV[role];

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-tg-bg/90 px-4 py-3 backdrop-blur">
        <div className="text-base font-bold">{t("appName")}</div>
        <button
          className="rounded-lg bg-tg-secondary-bg px-2 py-1 text-xs font-semibold uppercase"
          onClick={() => setLocale(locale === "en" ? "uz" : "en")}
        >
          {locale === "en" ? "UZ" : "EN"}
        </button>
      </header>

      <main className="flex-1 px-4 pb-24 pt-1">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md justify-around gap-1 overflow-x-auto border-t border-tg-hint/15 bg-tg-bg/95 px-2 py-2 backdrop-blur">
        {items.map((item) => {
          const active = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptic("light")}
              className={`flex min-w-[58px] flex-1 shrink-0 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-medium ${
                active ? "text-tg-link" : "text-tg-hint"
              }`}
            >
              {item.icon}
              <span className="truncate">{t(item.label)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
