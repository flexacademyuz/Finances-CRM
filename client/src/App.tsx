import { useState } from "react";
import { Route, Switch, Redirect } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LocaleContext, type Locale, useI18n } from "./lib/i18n";
import { detectLocale } from "./lib/telegram";
import { SessionProvider, type Me } from "./lib/session";
import { accessFor } from "./lib/access";
import { Layout } from "./components/Layout";
import { Button, Card, Field, Input, Spinner } from "./components/ui";
import { api, type ApiError } from "./lib/api";

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
// Everyone
import { AccountPage } from "./pages/Account";

function Gate({ err }: { err: ApiError }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const pending = err?.status === 403 && err?.code === "pending";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [sent, setSent] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const login = useMutation({
    mutationFn: () => api("/api/auth/login", { method: "POST", body: { username, password } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const signup = useMutation({
    mutationFn: () => api("/api/auth/signup", { method: "POST", body: { fullName, username, password } }),
    onSuccess: () => setSent(true),
  });

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-4xl">🔒</div>
      <div className="text-lg font-bold">{t("appName")}</div>
      {children}
    </div>
  );

  if (pending) return shell(<p className="text-sm text-tg-hint">{t("awaitingApproval")}</p>);
  if (sent) return shell(<p className="text-sm text-status-paid">{t("requestSent")}</p>);

  return shell(
    <Card className="w-full space-y-3 text-left">
      <div className="flex gap-1 rounded-full bg-bg p-1 ring-1 ring-border">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              mode === m ? "bg-primary text-white" : "text-muted"
            }`}
          >
            {m === "login" ? t("login") : t("requestAccess")}
          </button>
        ))}
      </div>
      <p className="text-xs text-tg-hint">{mode === "login" ? t("loginToRecover") : t("requestAccessNote")}</p>

      {mode === "signup" && (
        <Field label={t("fullName")}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
      )}
      <Field label={t("username")}>
        <Input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
      </Field>
      <Field label={t("password")}>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>

      {(login.isError || signup.isError) && (
        <div className="text-sm text-status-overdue">
          {((mode === "login" ? login.error : signup.error) as Error).message}
        </div>
      )}

      {mode === "login" ? (
        <Button
          className="w-full"
          disabled={!username || !password || login.isPending}
          onClick={() => login.mutate()}
        >
          {t("login")}
        </Button>
      ) : (
        <Button
          className="w-full"
          disabled={!fullName || !username || !password || signup.isPending}
          onClick={() => signup.mutate()}
        >
          {t("requestAccess")}
        </Button>
      )}
    </Card>,
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
        <Route path="/account" component={AccountPage} />
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
