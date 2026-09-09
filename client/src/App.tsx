import { useState } from "react";
import { Route, Switch, Redirect } from "wouter";
import { LocaleContext, type Locale, useI18n } from "./lib/i18n";
import { detectLocale } from "./lib/telegram";
import { SessionProvider, type Me } from "./lib/session";
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
import { FinancesPage } from "./pages/ceo/Finances";
import { AnalyticsPage } from "./pages/ceo/Analytics";
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

function Gate({ err }: { err: ApiError }) {
  const { t } = useI18n();
  const notRegistered = err?.status === 403;
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-4xl">🔒</div>
      <div className="text-lg font-bold">{t("appName")}</div>
      <p className="text-sm text-tg-hint">
        {notRegistered ? t("notRegistered") : err?.message ?? "Authentication failed."}
      </p>
    </div>
  );
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
        {a.salary && <Route path="/salary" component={MySalary} />}
        <Route><Redirect to="/" /></Route>
      </Switch>
    </Layout>
  );
}

export function App() {
  const [locale, setLocale] = useState<Locale>(detectLocale());
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <SessionProvider
        renderLoading={() => <Spinner />}
        renderGate={(err) => <Gate err={err} />}
      >
        {(me) => <Routes me={me} />}
      </SessionProvider>
    </LocaleContext.Provider>
  );
}
