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
  UserPlus,
  KeyRound,
  Clock,
  Receipt,
  TrendingUp,
  BarChart3,
  MessageSquare,
  Menu,
  Plus,
  HandCoins,
  Building2,
  CalendarDays,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import type { Role, User } from "@shared/schema";
import { useI18n, type StringKey } from "../lib/i18n";
import { useSession } from "../lib/session";
import { BranchSwitcher } from "./BranchSwitcher";
import { accessFor } from "../lib/access";
import { can } from "@shared/permissions";
import { haptic, isTelegram } from "../lib/telegram";
import { clearToken } from "../lib/auth";

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
    { href: "#create", label: "add", icon: <Plus size={28} strokeWidth={2.5} />, center: true },
    { href: "/salary", label: "mySalary", icon: <BadgeDollarSign size={22} /> },
  ],
  assistant: [
    { href: "/students", label: "students", icon: <GraduationCap size={22} /> },
    { href: "/leads", label: "leads", icon: <UserPlus size={22} /> },
    { href: "/", label: "recordPayment", icon: <Plus size={28} strokeWidth={2.5} />, center: true },
    { href: "/payments", label: "payments", icon: <ClipboardList size={22} /> },
    { href: "/awaiting", label: "awaiting", icon: <Clock size={22} /> },
  ],
};

/** Highlight the tab for the current route, including student/class detail pages. */
function bottomActive(href: string, location: string): boolean {
  if (href === location) return true;
  if (href === "/students" && location.startsWith("/student")) return true;
  if ((href === "/classes" || href === "/groups") && location.startsWith("/class")) return true;
  return false;
}

/**
 * Build the sidebar menu from what the user can actually reach (role baseline +
 * CEO-granted permissions), so a granted ability shows up as a menu item. Keeps
 * a stable order across roles.
 */
function buildNav(user: User): NavItem[] {
  const a = accessFor(user);
  const items: NavItem[] = [];

  if (a.role === "ceo") items.push({ href: "/", label: "dashboard", icon: <LayoutDashboard size={18} /> });
  else if (a.role === "teacher") items.push({ href: "/", label: "myClasses", icon: <Users size={18} /> });
  else items.push({ href: "/", label: "recordPayment", icon: <Wallet size={18} /> }); // accountant / assistant

  // A dedicated Record item for anyone granted it whose home isn't already the
  // record screen.
  if (a.record && a.recordPath === "/record")
    items.push({ href: "/record", label: "recordPayment", icon: <Wallet size={18} /> });
  if (a.students) items.push({ href: "/students", label: "students", icon: <GraduationCap size={18} /> });
  items.push({ href: "/leads", label: "leads", icon: <UserPlus size={18} /> });
  if (a.groups) items.push({ href: a.groupsPath, label: "groups", icon: <BookOpen size={18} /> });
  // Timetable is a web-only planning view (CEO), not shown in the Telegram app.
  if (a.role === "ceo" && !isTelegram()) items.push({ href: "/timetable", label: "timetable", icon: <CalendarDays size={18} /> });
  if (a.payroll) items.push({ href: "/payroll", label: "payroll", icon: <BadgeDollarSign size={18} /> });
  if (a.payments) items.push({ href: "/payments", label: "payments", icon: <ClipboardList size={18} /> });
  if (a.awaiting) items.push({ href: "/awaiting", label: "awaiting", icon: <Clock size={18} /> });
  if (a.expenses) items.push({ href: "/expenses", label: "expenses", icon: <Receipt size={18} /> });
  if (a.finances) items.push({ href: "/finances", label: "finances", icon: <TrendingUp size={18} /> });
  if (a.analytics) items.push({ href: "/analytics", label: "analytics", icon: <BarChart3 size={18} /> });
  if (a.users) items.push({ href: "/users", label: "users", icon: <UserCog size={18} /> });
  if (a.role === "ceo") items.push({ href: "/branches", label: "branches", icon: <Building2 size={18} /> });
  if (a.role === "ceo") items.push({ href: "/sms", label: "sms", icon: <MessageSquare size={18} /> });
  if (a.salary) items.push({ href: "/salary", label: "mySalary", icon: <BadgeDollarSign size={18} /> });
  // Everyone can manage their own recovery credentials.
  items.push({ href: "/account", label: "myAccount", icon: <KeyRound size={18} /> });

  return items;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

/* ───────────────────────── Nav grouping & active state ──────────────── */

type NavSection = "overview" | "people" | "money" | "admin" | "account";

/** Which section each nav item belongs to (groups the sidebar/drawer). */
const SECTION_OF: Partial<Record<StringKey, NavSection>> = {
  dashboard: "overview", myClasses: "overview", recordPayment: "overview",
  students: "people", leads: "people", groups: "people", timetable: "people",
  payments: "money", awaiting: "money", payroll: "money",
  expenses: "money", finances: "money", analytics: "money", mySalary: "money",
  users: "admin", branches: "admin", sms: "admin",
  myAccount: "account",
};
const SECTION_ORDER: NavSection[] = ["overview", "people", "money", "admin", "account"];
const SECTION_LABEL: Record<NavSection, StringKey> = {
  overview: "navOverview", people: "navPeople", money: "navMoney", admin: "navAdmin", account: "navAccount",
};

/** Split the flat nav into ordered, labelled sections (drops empty ones). */
function groupNav(items: NavItem[]): { section: NavSection; items: NavItem[] }[] {
  const bySection = new Map<NavSection, NavItem[]>();
  for (const it of items) {
    const s = SECTION_OF[it.label] ?? "money";
    (bySection.get(s) ?? bySection.set(s, []).get(s)!).push(it);
  }
  return SECTION_ORDER.filter((s) => bySection.has(s)).map((s) => ({ section: s, items: bySection.get(s)! }));
}

/** Highlight the nav item for the current route, incl. detail pages. */
function navActive(href: string, location: string): boolean {
  if (href === "/") return location === "/";
  if (location === href) return true;
  if (href === "/students" && location.startsWith("/student")) return true;
  if ((href === "/classes" || href === "/groups") && location.startsWith("/class")) return true;
  return false;
}

/**
 * Desktop sidebar — a floating white panel over the grey ground with two states:
 *  - expanded: logo + name, section headers, labelled nav items, user at foot;
 *  - collapsed ("half-closed"): icon-only, with a label tooltip on hover.
 * A chevron button toggles between them (persisted in localStorage by the parent).
 */
function DesktopSidebar({
  items,
  location,
  user,
  collapsed,
  onToggle,
}: {
  items: NavItem[];
  location: string;
  user: User;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const web = !isTelegram();
  const groups = groupNav(items);

  const Item = ({ href, label, icon }: NavItem) => {
    const active = navActive(href, location);
    return (
      <div className="group relative">
        <Link
          href={href}
          aria-label={t(label)}
          title={collapsed ? t(label) : undefined}
          onClick={() => haptic("light")}
          className={
            collapsed
              ? `mx-auto grid h-11 w-11 place-items-center rounded-2xl transition ${
                  active ? "bg-primary text-white shadow-brand" : "text-muted hover:bg-primary-soft hover:text-primary"
                }`
              : `flex items-center gap-3 rounded-btn px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-primary-soft font-semibold text-primary-hover"
                    : "text-sidebar-text hover:bg-slate-100 hover:text-text"
                }`
          }
        >
          {icon}
          {!collapsed && <span className="truncate">{t(label)}</span>}
        </Link>
        {/* Hover tooltip in the collapsed state (like the reference). */}
        {collapsed && (
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-dark px-2.5 py-1 text-xs font-semibold text-white opacity-0 shadow-card-hover transition group-hover:opacity-100">
            {t(label)}
          </span>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`fixed bottom-3 left-3 top-3 z-30 hidden flex-col rounded-card bg-surface py-4 shadow-card ring-1 ring-dark/[0.04] transition-[width] duration-200 md:flex ${
        collapsed ? "w-[68px] px-2" : "w-56 px-3"
      }`}
    >
      {/* Header: brand mark + name + collapse toggle */}
      <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "gap-2 px-1"}`}>
        <Link href="/" aria-label="Home" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-brand">
          <Wallet size={18} />
        </Link>
        {!collapsed && <span className="min-w-0 flex-1 truncate text-sm font-extrabold">Flex Academy</span>}
        <button
          onClick={onToggle}
          aria-label="Toggle sidebar"
          title="Collapse / expand"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg text-muted ring-1 ring-border transition hover:text-primary"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* Nav — grouped sections; headers hidden when collapsed. */}
      <nav className="no-scrollbar mt-4 flex-1 space-y-3 overflow-y-auto">
        {groups.map(({ section, items: group }, i) => (
          <div key={section} className={collapsed ? "space-y-1" : "space-y-0.5"}>
            {!collapsed ? (
              <div className="px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted/70">
                {t(SECTION_LABEL[section])}
              </div>
            ) : (
              i > 0 && <div className="mx-auto my-1 h-px w-6 bg-border" />
            )}
            {group.map((it) => (
              <Item key={it.href} {...it} />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer: user profile + logout (web) */}
      <div className={`mt-2 flex items-center gap-2 border-t border-border pt-3 ${collapsed ? "justify-center" : ""}`}>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white shadow-brand">
          {initials(user.fullName)}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text">{user.fullName}</div>
            <div className="text-xs capitalize text-muted">{user.role}</div>
          </div>
        )}
        {!collapsed && web && (
          <button
            title={t("logOut")}
            aria-label={t("logOut")}
            onClick={() => { clearToken(); window.location.reload(); }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}

export function Layout({ role, children }: { role: Role; children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const { user } = useSession();
  const [location] = useLocation();
  const [drawer, setDrawer] = useState(false);
  // Desktop sidebar collapse state ("half-closed"), remembered across sessions.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebarCollapsed") === "1"; } catch { return false; }
  });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const n = !c;
      try { localStorage.setItem("sidebarCollapsed", n ? "1" : "0"); } catch { /* storage off */ }
      return n;
    });
  const items = buildNav(user);

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
      {/* Desktop collapsible sidebar */}
      <DesktopSidebar
        items={items}
        location={location}
        user={user}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
      />

      {/* Mobile drawer — full labelled menu, grouped into sections */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40 animate-fade-in" />
          <div className="absolute inset-y-0 left-0 w-72 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {nav}
          </div>
        </div>
      )}

      <div className={`transition-[padding] duration-200 ${collapsed ? "md:pl-[92px]" : "md:pl-[248px]"}`}>
        {/* Top bar — 64px, shows the section name only (no branding). */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur">
          <button className="md:hidden" onClick={() => setDrawer(true)} aria-label="Menu">
            <Menu size={22} />
          </button>
          <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
          <BranchSwitcher />
          <button
            className="rounded-btn bg-bg px-2.5 py-1 text-xs font-semibold uppercase ring-1 ring-border"
            onClick={() => setLocale(locale === "en" ? "uz" : "en")}
          >
            {locale === "en" ? "UZ" : "EN"}
          </button>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold text-white shadow-brand">
            {initials(user.fullName)}
          </div>
        </header>

        {/* Extra bottom padding on mobile so the tab bar never covers content.
            A tighter max width keeps the content column contained and glamorous
            on large monitors instead of stretching cards edge-to-edge. */}
        <main className="mx-auto max-w-[1080px] px-4 pb-28 pt-4 md:px-6 md:pb-16">{children}</main>
      </div>

      {/* Mobile bottom tab bar — quick access alongside the sidebar drawer. */}
      <BottomNav items={BOTTOM_NAV[role]} location={location} user={user} />
    </div>
  );
}

/** Quick-create options behind the center "+", gated by the user's permissions. */
type QuickAction = { label: StringKey; icon: ReactNode; href: string };
function quickActions(user: User): QuickAction[] {
  const actions: QuickAction[] = [];
  // Register a new student (lead) — opens the Leads register form.
  if (can(user, "add_student")) {
    actions.push({ label: "registerStudent", icon: <UserPlus size={20} />, href: "/leads?register=1" });
  }
  if (user.role === "ceo" || can(user, "record_payment")) {
    const recordHref = user.role === "accountant" || user.role === "assistant" ? "/" : "/record";
    actions.push({ label: "recordPayment", icon: <Wallet size={20} />, href: recordHref });
  }
  if (user.role === "ceo" || user.role === "accountant" || can(user, "add_expense")) {
    actions.push({ label: "addExpense", icon: <Receipt size={20} />, href: "/expenses" });
  }
  // Advances are a CEO-only payroll action (handled on the Payroll screen).
  if (user.role === "ceo") {
    actions.push({ label: "advanceToTeacher", icon: <HandCoins size={20} />, href: "/payroll" });
  }
  return actions;
}

function BottomNav({ items, location, user }: { items: BottomItem[]; location: string; user: User }) {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [sheet, setSheet] = useState(false);
  const actions = quickActions(user);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {items.map((item) => {
          const active = bottomActive(item.href, location);
          if (item.center) {
            return (
              <div key={item.href} className="relative flex flex-1 items-center justify-center">
                <button
                  onClick={() => { haptic("light"); setSheet(true); }}
                  aria-label={t(item.label)}
                  className="absolute -top-6 grid h-16 w-16 place-items-center rounded-full bg-brand text-white shadow-brand ring-4 ring-bg transition active:scale-95 hover:brightness-105"
                >
                  {item.icon}
                </button>
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

      {/* Create action sheet (mobile) */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 animate-fade-in md:hidden" onClick={() => setSheet(false)}>
          <div
            className="w-full rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-card-hover animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-muted">{t("whatToRecord")}</div>
              <button aria-label={t("cancel")} className="rounded-full p-1 text-muted hover:bg-bg" onClick={() => setSheet(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2">
              {actions.map((a) => (
                <button
                  key={a.href + String(a.label)}
                  onClick={() => { haptic("light"); setSheet(false); navigate(a.href); }}
                  className="flex w-full items-center gap-3 rounded-btn border border-border bg-surface px-4 py-3 text-left font-medium transition hover:border-primary hover:bg-primary-soft"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">{a.icon}</span>
                  {t(a.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
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
    <div className="flex h-full flex-col bg-sidebar-bg text-sidebar-text shadow-[1px_0_0_var(--border)]">
      {/* Brand / role */}
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-sm font-bold text-white shadow-brand">
          {initials(userName)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text">{userName}</div>
          <div className="text-xs capitalize text-muted">{role}</div>
        </div>
      </div>

      {/* Nav — grouped into labelled sections so a long menu stays scannable. */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {groupNav(items).map(({ section, items: group }) => (
          <div key={section} className="space-y-1">
            <div className="px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted/70">
              {t(SECTION_LABEL[section])}
            </div>
            {group.map((item) => {
              const active = navActive(item.href, location);
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
          </div>
        ))}
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
