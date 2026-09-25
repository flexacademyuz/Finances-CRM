import { useState } from "react";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { LocaleContext, type Locale } from "./lib/i18n";
import { detectLocale, isTelegram } from "./lib/telegram";
import { SessionProvider, BranchProvider, type Me } from "./lib/session";
import { accessFor } from "./lib/access";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import type { ApiError } from "./lib/api";

// CEO pages
import { CeoDashboard } from "./pages/ceo/Dashboard";
import { StudentsPage } from "./pages/ceo/Students";
import { ClassesPage } from "./pages/ceo/Classes";
import { PayrollPage } from "./pages/ceo/Payroll";
import { UsersPage } from "./pages/ceo/Users";
import { BranchesPage } from "./pages/ceo/Branches";
import { TimetablePage } from "./pages/ceo/Timetable";
import { FinancesPage } from "./pages/ceo/Finances";
import { AnalyticsPage } from "./pages/ceo/Analytics";
import { SmsPage } from "./pages/ceo/Sms";
// Shared / accountant
import { PaymentsLog } from "./pages/PaymentsLog";
import { LeadsPage } from "./pages/Leads";
import { ExpensesPage } from "./pages/Expenses";
import { ClassDetail } from "./pages/ClassDetail";
import { StudentDetail } from "./pages/StudentDetail";
import { RecordPayment } from "./pages/accountant/RecordPayment";
import { AwaitingPage } from "./pages/accountant/Awaiting";
// Teacher
import { MyClasses } from "./pages/teacher/MyClasses";
import { MySalary } from "./pages/teacher/MySalary";
// Everyone
import { AccountPage } from "./pages/Account";
// Public
import { Landing } from "./pages/Landing";
import { LoginPage } from "./pages/Login";

/** Logged-out web visitors get the marketing page; its "Log in" leads to /login.
 *  Telegram users and pending/other auth states go straight to the gate. */
function PublicGate({ err }: { err: ApiError }) {
  const [loc] = useLocation();
  if (!isTelegram() && err?.status === 401 && loc !== "/login") return <Landing />;
  return <LoginPage err={err} />;
}

function Routes({ me }: { me: Me }) {
  const role = me.user.role;
  const a = accessFor(me.user);

  const home = role === "ceo" ? CeoDashboard : role === "teacher" ? MyClasses : RecordPayment;

  // Routes gated by capability (role baseline + CEO-granted permissions), so a
  // granted user actually reaches the page — enforcement still lives server-side.
  return (
    <Layout role={role}>
      <Switch>
        <Route path="/" component={home} />
        {a.record && a.recordPath === "/record" && <Route path="/record" component={RecordPayment} />}
        {a.students && <Route path="/students" component={StudentsPage} />}
        <Route path="/leads" component={LeadsPage} />
        {a.groups && <Route path={a.groupsPath} component={ClassesPage} />}
        <Route path="/class/:id" component={ClassDetail} />
        <Route path="/student/:id" component={StudentDetail} />
        {a.payments && <Route path="/payments" component={PaymentsLog} />}
        {a.awaiting && <Route path="/awaiting" component={AwaitingPage} />}
        {a.expenses && <Route path="/expenses" component={ExpensesPage} />}
        {a.payroll && <Route path="/payroll" component={PayrollPage} />}
        {a.finances && <Route path="/finances" component={FinancesPage} />}
        {a.analytics && <Route path="/analytics" component={AnalyticsPage} />}
        {a.users && <Route path="/users" component={UsersPage} />}
        {role === "ceo" && <Route path="/branches" component={BranchesPage} />}
        {role === "ceo" && !isTelegram() && <Route path="/timetable" component={TimetablePage} />}
        {role === "ceo" && <Route path="/sms" component={SmsPage} />}
        {a.salary && <Route path="/salary" component={MySalary} />}
        <Route path="/account" component={AccountPage} />
        <Route><Redirect to="/" /></Route>
      </Switch>
    </Layout>
  );
}

export function App() {
  const [locale, setLocale] = useState<Locale>(detectLocale());
  const [loc] = useLocation();
  // /welcome always shows the public landing page, even when signed in.
  if (loc === "/welcome") {
    return (
      <LocaleContext.Provider value={{ locale, setLocale }}>
        <Landing />
      </LocaleContext.Provider>
    );
  }
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <SessionProvider
        renderLoading={() => <Spinner />}
        renderGate={(err) => <PublicGate err={err} />}
      >
        {(me) => (
          <BranchProvider me={me}>
            <Routes me={me} />
          </BranchProvider>
        )}
      </SessionProvider>
    </LocaleContext.Provider>
  );
}
