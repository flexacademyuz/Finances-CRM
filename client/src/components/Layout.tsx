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
  Plus,
} from "lucide-react";
import type { Role } from "@shared/schema";
import { useI18n, type StringKey } from "../lib/i18n";
import { useSession } from "../lib/session";
import { haptic } from "../lib/telegram";

type NavItem = { href: string; label: StringKey; icon: ReactNode };
type BottomItem = NavItem & { center?: boolean };

/**
 * Mobile bottom tab bar (in addition to the sidebar drawer). The requested
 * quick-access set: Students · Groups · Record (raised +) · Payroll · Users.
 * Falls back to role-appropriate routes so it never links somewhere the role
 * can't reach; the center Record button is the primary action.
 */
const BOTTOM_NAV: Record<Role, BottomItem[]> = {
  ceo: [
    { href: "/students", label: "students", icon: <GraduationCap size={22} /> },
    { href: "/classes", label: "groups", icon: <BookOpen size={22} /> },
    { href: "/record", label: "recordPayment", icon: <Plus size={28} strokeWidth={2.5} />, center: true },
    { href: "/payroll", label: "payroll", icon: <BadgeDollarSign size={22} /> },
    { href: "/users", label: "users", icon: <UserCog size={22} /> },
  ],
  accountant: [
    { href: "/students", label: "students", icon: <GraduationCap size={22} /> },
    { href: "/groups", label: "groups", icon: <BookOpen size={22} /> },
    { href: "/", label: "recordPayment", icon: <Plus size={28} strokeWidth={2.5} />, center: true },
    { href: "/payments", label: "payments", icon: <ClipboardList size={22} /> },
    { href: "/awaiting", label: "awaiting", icon: <Clock size={22} /> },
  ],
  teacher: [
    { href: "/", label: "myClasses", icon: <Users size={22} /> },
    { href: "/salary", label: "mySalary", icon: <BadgeDollarSign size={22} /> },
  ],
};

/** Highlight the tab for the current route, including student/class detail pages. */
function bottomActive(href: string, location: string): boolean {
  if (href === location) return true;
  if (href === "/students" && location.startsWith("/student")) return true;
  if ((href === "/classes" || href === "/groups") && location.startsWith("/class")) return true;
  return false;
}

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

  // Title from the matching nav item, with sensible fallbacks for detail pages.
  let titleKey = items.find((i) => i.href === location)?.label;
  if (!titleKey) {
    if (location.startsWith("/class")) titleKey = "groups";
    else if (location.startsWith("/student")) titleKey = "students";
    else titleKey = items[0].label;
  }
  const title = t(titleKey);

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

        {/* Extra bottom padding on mobile so the tab bar never covers content. */}
        <main className="mx-auto max-w-[1280px] px-4 pb-28 pt-4 md:px-6 md:pb-16">{children}</main>
      </div>

      {/* Mobile bottom tab bar — quick access alongside the sidebar drawer. */}
      <BottomNav items={BOTTOM_NAV[role]} location={location} />
    </div>
  );
}

function BottomNav({ items, location }: { items: BottomItem[]; location: string }) {
  const { t } = useI18n();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {items.map((item) => {
        const active = bottomActive(item.href, location);
        if (item.center) {
          return (
            <div key={item.href} className="relative flex flex-1 items-center justify-center">
              <Link
                href={item.href}
                onClick={() => haptic("light")}
                aria-label={t(item.label)}
                className="absolute -top-6 grid h-16 w-16 place-items-center rounded-full bg-primary text-white shadow-lg ring-4 ring-bg transition active:scale-95 hover:bg-primary-hover"
              >
                {item.icon}
              </Link>
            </div>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => haptic("light")}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              active ? "text-primary" : "text-tg-hint"
            }`}
          >
            {item.icon}
            <span className="max-w-full truncate px-0.5">{t(item.label)}</span>
          </Link>
        );
      })}
    </nav>
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
    <div className="flex h-full flex-col border-r border-border bg-sidebar-bg text-sidebar-text">
      {/* Brand / role */}
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-bold text-white">
          {initials(userName)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text">{userName}</div>
          <div className="text-xs capitalize text-muted">{role}</div>
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
                  ? "bg-primary-soft font-semibold text-primary-hover"
                  : "text-sidebar-text hover:bg-slate-100 hover:text-text"
              }`}
            >
              {item.icon}
              <span className="truncate">{t(item.label)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs">
        <span className="text-muted">{t("appName")}</span>
        <button className="rounded bg-bg px-2 py-1 font-semibold uppercase text-muted ring-1 ring-border" onClick={onToggleLocale}>
          {locale === "en" ? "UZ" : "EN"}
        </button>
      </div>
    </div>
  );
}
