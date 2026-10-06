/**
 * Student Mini-App shell: authenticates as a student (Telegram initData, or a
 * staff read-only preview), then renders a mobile-first app with a bottom tab
 * bar. Mounted at /portal (nested routes).
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { Route, Switch, Link, useLocation, Redirect } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Home, Wallet, TrendingUp, Bell, Eye, Link2, X, GraduationCap, ClipboardList } from "lucide-react";
import type { ApiError } from "../lib/api";
import { haptic, tg, isTelegram } from "../lib/telegram";
import { initials, avatarColor } from "../lib/format";
import {
  papi,
  initPreviewFromUrl,
  previewStudentId,
  exitPreview,
  selectedProfile,
  setSelectedProfile,
  type Me,
} from "./api";
import { usePT, type PKey } from "./i18n";
import { PageSkeleton, ErrorState } from "./ui";
import { HomePage } from "./pages/Home";
import { PaymentsPage } from "./pages/Payments";
import { ProgressPage } from "./pages/Progress";
import { AttendancePage } from "./pages/Attendance";
import { NotificationsPage } from "./pages/Notifications";
import { ProfilePage } from "./pages/Profile";
import { LearnHomePage } from "./learn/LearnHome";
import { StagePage } from "./learn/StagePage";
import { WordsPage } from "./learn/WordsPage";
import { FlashcardsPage } from "./learn/Flashcards";
import { PracticePage } from "./learn/Practice";
import { BookmarksPage } from "./learn/Bookmarks";
import { GrammarTopicsPage, GrammarTopicPage } from "./learn/grammar/GrammarPages";
import { GrammarBuildPage } from "./learn/grammar/BuildRound";
import { GrammarTestPage } from "./learn/grammar/TestRound";
import { AnalyticsPage } from "./stats/AnalyticsPage";
import { useAppTime } from "./stats/useAppTime";
import { HomeworkListPage } from "./homework/HomeworkPages";
import { LeaderboardPage } from "./leaderboard/LeaderboardPage";

initPreviewFromUrl();

const MeContext = createContext<Me | null>(null);
export function useMe(): Me {
  const m = useContext(MeContext);
  if (!m) throw new Error("useMe outside portal");
  return m;
}

/** Shared query for the header badge + profile (refreshed by pages). */
export function useMeQuery() {
  return useQuery({ queryKey: ["portal", "me"], queryFn: () => papi<Me>("/me"), retry: false, staleTime: 30_000 });
}

export function PortalApp() {
  const { t, locale, setLocale } = usePT();
  const me = useMeQuery();
  const [loc] = useLocation();
  // Flashcard / exercise players run full-screen: no header, tabs or group switcher.
  const immersive =
    loc.startsWith("/learn/cards") || loc.startsWith("/learn/practice") || /^\/learn\/grammar\/[^/]+\/(build|test)$/.test(loc);
  const langSynced = useRef(false);
  // Count time in the app (not for staff previews, which are read-only).
  useAppTime(!!me.data && !me.data.preview);

  // Adopt the student's saved notification language once (Telegram users).
  useEffect(() => {
    const l = me.data?.account?.languageCode;
    if (!langSynced.current && (l === "uz" || l === "en")) {
      langSynced.current = true;
      if (l !== locale) setLocale(l);
    }
  }, [me.data, locale, setLocale]);

  // A remembered group that's no longer linked: forget it and load the default.
  useEffect(() => {
    if ((me.error as ApiError | null)?.code === "profile_not_linked" && selectedProfile()) {
      setSelectedProfile(null);
      void me.refetch();
    }
  }, [me.error, me]);

  if (me.isLoading) {
    return (
      <Frame>
        <div className="pt-4">
          <PageSkeleton />
        </div>
      </Frame>
    );
  }

  if (me.error || !me.data) {
    const err = me.error as ApiError | null;
    // A remembered group that's no longer linked (recovered in the effect above).
    if (err?.code === "profile_not_linked") {
      return (
        <Frame>
          <div className="pt-4">
            <PageSkeleton />
          </div>
        </Frame>
      );
    }
    if (err?.code === "not_linked") return <NotLinked />;
    if (err?.status === 401 && !isTelegram() && !previewStudentId()) {
      return (
        <Frame>
          <Gate icon={<Link2 size={28} />} title={t("notLinkedTitle")} body={t("openInTelegram")} />
        </Frame>
      );
    }
    return (
      <Frame>
        <div className="pt-6">
          <ErrorState onRetry={() => me.refetch()} message={err?.message} />
        </div>
      </Frame>
    );
  }

  return (
    <MeContext.Provider value={me.data}>
      <Frame>
        {me.data.preview && (
          <div className="sticky top-0 z-30 -mx-4 flex items-center gap-2 bg-warning/15 px-4 py-2 text-xs font-semibold text-warning">
            <Eye size={14} />
            <span className="flex-1 truncate">
              {t("previewBanner")} · {me.data.student.fullName}
            </span>
            <button onClick={exitPreview} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-text">
              <X size={12} /> {t("exitPreview")}
            </button>
          </div>
        )}
        {!immersive && <Header me={me.data} />}
        {!immersive && <GroupSwitcher me={me.data} />}
        <main className={immersive ? "" : "pb-[calc(7rem+env(safe-area-inset-bottom))] pt-2"}>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/payments" component={PaymentsPage} />
            <Route path="/progress" component={ProgressPage} />
            <Route path="/attendance" component={AttendancePage} />
            <Route path="/notifications" component={NotificationsPage} />
            <Route path="/profile" component={ProfilePage} />
            <Route path="/learn" component={LearnHomePage} />
            <Route path="/learn/stage/:id" component={StagePage} />
            <Route path="/learn/stage/:id/words" component={WordsPage} />
            <Route path="/learn/cards" component={FlashcardsPage} />
            <Route path="/learn/practice" component={PracticePage} />
            <Route path="/learn/bookmarks" component={BookmarksPage} />
            <Route path="/learn/grammar" component={GrammarTopicsPage} />
            <Route path="/learn/grammar/:slug" component={GrammarTopicPage} />
            <Route path="/learn/grammar/:slug/build" component={GrammarBuildPage} />
            <Route path="/learn/grammar/:slug/test" component={GrammarTestPage} />
            <Route path="/learn/stats">
              <Redirect to="/stats" />
            </Route>
            <Route path="/stats" component={AnalyticsPage} />
            <Route path="/homework" component={HomeworkListPage} />
            <Route path="/leaderboard" component={LeaderboardPage} />
            <Route>
              <Redirect to="/" />
            </Route>
          </Switch>
        </main>
        {!immersive && <BottomNav unread={me.data.unread} />}
      </Frame>
    </MeContext.Provider>
  );
}

/** Centered phone-width column on the app's soft grey ground. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-bg">
      <div className="mx-auto min-h-full w-full max-w-[480px] px-4">{children}</div>
    </div>
  );
}

function Header({ me }: { me: Me }) {
  const [loc] = useLocation();
  const { t } = usePT();
  const titles: Record<string, PKey> = {
    "/payments": "payments",
    "/progress": "progress",
    "/attendance": "attendance",
    "/notifications": "notificationsTitle",
    "/profile": "profile",
    "/learn": "learn",
    "/leaderboard": "leaderboard",
    "/homework": "homework",
    "/stats": "myStats",
  };
  const title = titles[loc];
  return (
    <header className="flex items-center gap-3 pb-1 pt-4">
      <div className="min-w-0 flex-1">
        {title ? (
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{t(title)}</h1>
        ) : (
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Flex Academy</div>
        )}
      </div>
      <Link
        href="/notifications"
        aria-label={t("notificationsTitle")}
        className="relative grid h-10 w-10 place-items-center rounded-full bg-surface shadow-card ring-1 ring-dark/[0.04]"
        onClick={() => haptic("light")}
      >
        <Bell size={19} />
        {me.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-bg">
            {me.unread > 99 ? "99+" : me.unread}
          </span>
        )}
      </Link>
      <Link
        href="/profile"
        aria-label={t("profile")}
        onClick={() => haptic("light")}
        className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-white shadow-card"
        style={{ background: avatarColor(me.student.fullName) }}
      >
        {initials(me.student.fullName)}
      </Link>
    </header>
  );
}

/**
 * For a student in several groups (one record per group): switch which group
 * the whole app shows. A dot marks groups with unread notifications.
 */
function GroupSwitcher({ me }: { me: Me }) {
  const qc = useQueryClient();
  const { t } = usePT();
  if (me.profiles.length < 2) return null;
  const choose = (id: string) => {
    if (id === me.student.id) return;
    haptic("light");
    setSelectedProfile(id);
    // Everything on screen belongs to the previous group — reload it all.
    void qc.resetQueries({ queryKey: ["portal"] });
  };
  return (
    <div className="mt-2" role="tablist" aria-label={t("myGroups")}>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {me.profiles.map((p) => {
          const active = p.studentId === me.student.id;
          return (
            <button
              key={p.studentId}
              role="tab"
              aria-selected={active}
              onClick={() => choose(p.studentId)}
              className={`relative shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
                active ? "bg-primary text-white shadow-brand" : "bg-surface text-muted ring-1 ring-border"
              }`}
            >
              {p.subject || p.groupName}
              {!active && p.unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-bg" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TABS: { href: string; key: PKey; icon: ReactNode }[] = [
  { href: "/", key: "home", icon: <Home size={22} /> },
  // Learning sits next to Home: it's the daily habit. Notifications stay one tap
  // away via the header bell.
  { href: "/learn", key: "learn", icon: <GraduationCap size={22} /> },
  // Homework is a weekly must; attendance stays one tap away from Home.
  { href: "/homework", key: "homework", icon: <ClipboardList size={22} /> },
  { href: "/progress", key: "progress", icon: <TrendingUp size={22} /> },
  { href: "/payments", key: "payments", icon: <Wallet size={22} /> },
];

function BottomNav({ unread }: { unread: number }) {
  const [loc] = useLocation();
  const { t } = usePT();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[480px] items-stretch">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? loc === "/" : loc.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => haptic("light")}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold transition-colors ${
                active ? "text-primary" : "text-muted"
              }`}
            >
              {active && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-primary" />}
              <span className="relative">
                {tab.icon}
                {tab.key === "notifications" && unread > 0 && (
                  <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" />
                )}
              </span>
              {t(tab.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Gate({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center">
      <div className="hero mb-5 grid h-20 w-20 place-items-center rounded-[28px] !p-0">{icon}</div>
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-xs text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}

function NotLinked() {
  const { t } = usePT();
  return (
    <Frame>
      <Gate
        icon={<Link2 size={30} />}
        title={t("notLinkedTitle")}
        body={t("notLinkedBody")}
        action={
          isTelegram() ? (
            <button className="btn btn-primary mt-6" onClick={() => tg()?.close?.()}>
              {t("backToChat")}
            </button>
          ) : null
        }
      />
    </Frame>
  );
}
