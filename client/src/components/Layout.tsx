import { useState, type ReactNode } from "react";
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
  Receipt,
  TrendingUp,
  BarChart3,
  Menu,
} from "lucide-react";
import type { Role } from "@shared/schema";
import { useI18n, type StringKey } from "../lib/i18n";
import { useSession } from "../lib/session";
import { haptic } from "../lib/telegram";

type NavItem = { href: string; label: StringKey; icon: ReactNode };

const NAV: Record<Role, NavItem[]> = {
  ceo: [
    { href: "/", label: "dashboard", icon: <LayoutDashboard size={18} /> },
    { href: "/record", label: "recordPayment", icon: <Wallet size={18} /> },
    { href: "/students", label: "students", icon: <GraduationCap size={18} /> },
    { href: "/classes", label: "groups", icon: <BookOpen size={18} /> },
    { href: "/payroll", label: "payroll", icon: <BadgeDollarSign size={18} /> },
    { href: "/payments", label: "payments", icon: <ClipboardList size={18} /> },
    { href: "/expenses", label: "expenses", icon: <Receipt size={18} /> },
    { href: "/finances", label: "finances", icon: <TrendingUp size={18} /> },
    { href: "/analytics", label: "analytics", icon: <BarChart3 size={18} /> },
    { href: "/users", label: "users", icon: <UserCog size={18} /> },
  ],
  accountant: [
    { href: "/", label: "recordPayment", icon: <Wallet size={18} /> },
    { href: "/students", label: "students", icon: <GraduationCap size={18} /> },
    { href: "/groups", label: "groups", icon: <BookOpen size={18} /> },
    { href: "/payments", label: "payments", icon: <ClipboardList size={18} /> },
    { href: "/awaiting", label: "awaiting", icon: <Clock size={18} /> },
    { href: "/expenses", label: "expenses", icon: <Receipt size={18} /> },
  ],
  teacher: [
    { href: "/", label: "myClasses", icon: <Users size={18} /> },
    { href: "/salary", label: "mySalary", icon: <BadgeDollarSign size={18} /> },
  ],
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

export function Layout({ role, children }: { role: Role; children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const { user } = useSession();
  const [location] = useLocation();
  const [drawer, setDrawer] = useState(false);
  const items = NAV[role];

  const current = items.find((i) => i.href === location) ?? items[0];
  const title = t(current.label);

  const nav = (
    <SidebarContent
      items={items}
      location={location}
      role={role}
      userName={user.fullName}
      locale={locale}
      onNavigate={() => setDrawer(false)}
      onToggleLocale={() => setLocale(locale === "en" ? "uz" : "en")}
    />
  );

  return (
    <div className="min-h-full bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 md:block">{nav}</aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40 animate-fade-in" />
          <div className="absolute inset-y-0 left-0 w-64 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {nav}
          </div>
        </div>
      )}

      <div className="md:pl-60">
        {/* Top bar — 64px, shows the section name only (no branding). */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur">
          <button className="md:hidden" onClick={() => setDrawer(true)} aria-label="Menu">
            <Menu size={22} />
          </button>
          <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
          <button
            className="rounded-btn bg-bg px-2.5 py-1 text-xs font-semibold uppercase ring-1 ring-border"
            onClick={() => setLocale(locale === "en" ? "uz" : "en")}
          >
            {locale === "en" ? "UZ" : "EN"}
          </button>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-white">
            {initials(user.fullName)}
          </div>
        </header>

        <main className="mx-auto max-w-[1280px] px-4 pb-16 pt-4 md:px-6">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  items,
  location,
  role,
  userName,
  locale,
  onNavigate,
  onToggleLocale,
}: {
  items: NavItem[];
  location: string;
  role: Role;
  userName: string;
  locale: string;
  onNavigate: () => void;
  onToggleLocale: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col bg-sidebar-bg text-sidebar-text">
      {/* Brand / role */}
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar-active text-sm font-bold text-white">
          {initials(userName)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{userName}</div>
          <div className="text-xs capitalize text-sidebar-text/70">{role}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => { haptic("light"); onNavigate(); }}
              className={`flex items-center gap-3 rounded-btn px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                active
                  ? "bg-sidebar-active text-white shadow-sm"
                  : "text-sidebar-text hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.icon}
              <span className="truncate">{t(item.label)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs">
        <span className="text-sidebar-text/70">{t("appName")}</span>
        <button className="rounded bg-white/10 px-2 py-1 font-semibold uppercase" onClick={onToggleLocale}>
          {locale === "en" ? "UZ" : "EN"}
        </button>
      </div>
    </div>
  );
}
