import { useState } from "react";
import { Route, Switch, Redirect } from "wouter";
import { LocaleContext, type Locale, useI18n } from "./lib/i18n";
import { detectLocale } from "./lib/telegram";
import { SessionProvider, type Me } from "./lib/session";
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
// Shared / accountant
import { PaymentsLog } from "./pages/PaymentsLog";
import { ExpensesPage } from "./pages/Expenses";
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

  if (role === "ceo") {
    return (
      <Layout role="ceo">
        <Switch>
          <Route path="/" component={CeoDashboard} />
          <Route path="/record" component={RecordPayment} />
          <Route path="/students" component={StudentsPage} />
          <Route path="/classes" component={ClassesPage} />
          <Route path="/payroll" component={PayrollPage} />
          <Route path="/payments" component={PaymentsLog} />
          <Route path="/expenses" component={ExpensesPage} />
          <Route path="/finances" component={FinancesPage} />
          <Route path="/users" component={UsersPage} />
          <Route><Redirect to="/" /></Route>
        </Switch>
      </Layout>
    );
  }

  if (role === "accountant") {
    return (
      <Layout role="accountant">
        <Switch>
          <Route path="/" component={RecordPayment} />
          <Route path="/students" component={StudentsPage} />
          <Route path="/groups" component={ClassesPage} />
          <Route path="/payments" component={PaymentsLog} />
          <Route path="/awaiting" component={AwaitingPage} />
          <Route path="/expenses" component={ExpensesPage} />
          <Route><Redirect to="/" /></Route>
        </Switch>
      </Layout>
    );
  }

  return (
    <Layout role="teacher">
      <Switch>
        <Route path="/" component={MyClasses} />
        <Route path="/salary" component={MySalary} />
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
