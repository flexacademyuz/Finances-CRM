import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Wallet, Check, Eye, EyeOff, Clock, CircleCheck } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { isTelegram } from "../lib/telegram";
import { api, type ApiError } from "../lib/api";
import { setToken } from "../lib/auth";

/**
 * Login / request-access screen. Split card on desktop — a brand-gradient
 * welcome panel whose right edge dissolves into clouds, and the form on white.
 * On phones (and inside Telegram) it stacks: gradient header with the cloud
 * edge along its bottom, form underneath.
 */
export function LoginPage({ err }: { err: ApiError }) {
  const { t, locale, setLocale } = useI18n();
  const qc = useQueryClient();
  const pending = err?.status === 403 && err?.code === "pending";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [sent, setSent] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPw, setShowPw] = useState(false);

  const login = useMutation({
    mutationFn: () => api<{ token?: string }>("/api/auth/login", { method: "POST", body: { username, password } }),
    onSuccess: (data) => {
      // Browser session: keep the token so the API is authenticated on reload.
      if (data?.token) setToken(data.token);
      qc.invalidateQueries();
    },
  });
  const signup = useMutation({
    mutationFn: () => api("/api/auth/signup", { method: "POST", body: { fullName, username, password } }),
    onSuccess: () => setSent(true),
  });

  const isLogin = mode === "login";
  const active = isLogin ? login : signup;
  const canSubmit = isLogin
    ? !!username && !!password
    : !!fullName && username.length >= 3 && password.length >= 6;
  const submit = () => {
    if (!canSubmit || active.isPending) return;
    active.mutate();
  };
  const switchMode = () => {
    setMode(isLogin ? "signup" : "login");
    login.reset();
    signup.reset();
  };

  let body: ReactNode;
  if (pending || sent) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
        <div className={`grid h-16 w-16 place-items-center rounded-full ${sent ? "bg-status-paid/10 text-status-paid" : "bg-warning/10 text-warning"}`}>
          {sent ? <CircleCheck size={30} /> : <Clock size={30} />}
        </div>
        <p className="max-w-xs text-sm font-medium text-text">{sent ? t("requestSent") : t("awaitingApproval")}</p>
        {sent && (
          <button className="lg-btn lg-btn-outline" onClick={() => { setSent(false); setMode("login"); }}>
            {t("login")}
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <form
        className="flex flex-1 flex-col"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <h2 className="text-center text-xl font-bold text-text lg:text-2xl">
          {isLogin ? t("loginTitle") : t("signupTitle")}
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-center text-xs text-muted">
          {!isLogin ? t("requestAccessNote") : isTelegram() ? t("loginToRecover") : t("loginNote")}
        </p>

        <div className="mt-6 space-y-5">
          {!isLogin && (
            <LineField
              label={t("fullName")}
              placeholder={t("enterFullName")}
              value={fullName}
              onChange={setFullName}
              valid={fullName.trim().length >= 2}
              autoComplete="name"
            />
          )}
          <LineField
            label={t("username")}
            placeholder={t("enterUsername")}
            value={username}
            onChange={setUsername}
            valid={username.length >= 3}
            autoComplete="username"
            autoCapitalize="none"
          />
          <LineField
            label={t("password")}
            placeholder={t("enterPassword")}
            value={password}
            onChange={setPassword}
            valid={password.length >= 6}
            type={showPw ? "text" : "password"}
            autoComplete={isLogin ? "current-password" : "new-password"}
            trailing={
              <button
                type="button"
                className="text-muted transition hover:text-primary"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
        </div>

        {active.isError && (
          <div className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            {(active.error as Error).message}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="submit" className="lg-btn lg-btn-primary" disabled={!canSubmit || active.isPending}>
            {isLogin ? t("login") : t("requestAccess")}
          </button>
          <button type="button" className="lg-btn lg-btn-outline" onClick={switchMode}>
            {isLogin ? t("requestAccess") : t("login")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-0 sm:p-6">
      <div className="flex min-h-full w-full flex-col overflow-hidden bg-surface shadow-[0_30px_60px_-30px_rgba(26,35,56,0.35)] sm:min-h-0 sm:max-w-[460px] sm:rounded-[22px] lg:min-h-[540px] lg:max-w-[920px] lg:flex-row">
        {/* Welcome panel */}
        <div className="relative flex shrink-0 flex-col items-center bg-brand px-8 pb-20 pt-10 text-center text-white lg:w-[44%] lg:justify-between lg:pb-8 lg:pr-24">
          <div className="hidden text-2xl font-semibold lg:block">{t("welcomeTo")}</div>
          <div className="flex flex-col items-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-primary shadow-lg lg:h-24 lg:w-24">
              <Wallet className="h-9 w-9 lg:h-11 lg:w-11" strokeWidth={2.2} />
            </div>
            <div className="mt-3 whitespace-nowrap text-2xl font-extrabold tracking-tight lg:text-3xl">Flex Academy</div>
            <div className="text-sm font-medium text-white/80">{t("financesCrm")}</div>
            <p className="mt-6 hidden max-w-[280px] text-xs leading-relaxed text-white/80 lg:block">{t("loginBlurb")}</p>
          </div>
          <div className="hidden items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-white/80 lg:flex">
            {!isTelegram() && (
              <>
                <a href="/welcome" className="hover:text-white">{t("backToSite")}</a>
                <span className="h-3 w-px bg-white/50" />
              </>
            )}
            <button className="uppercase hover:text-white" onClick={() => setLocale(locale === "en" ? "uz" : "en")}>
              {locale === "en" ? "O'zbekcha" : "English"}
            </button>
          </div>

          {/* Cloud edge: bottom on phones, right side on desktop. */}
          <CloudEdge orientation="horizontal" className="absolute inset-x-0 -bottom-px h-20 w-full lg:hidden" />
          <CloudEdge orientation="vertical" className="absolute inset-y-0 -right-px hidden h-full w-28 lg:block" />
        </div>

        {/* Form panel */}
        <div className="flex flex-1 flex-col px-6 pb-8 pt-4 sm:px-10 lg:py-12 lg:pl-8 lg:pr-14">
          {body}
          <div className="mt-8 flex items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-muted lg:hidden">
            {!isTelegram() && (
              <>
                <a href="/welcome" className="hover:text-primary">{t("backToSite")}</a>
                <span className="h-3 w-px bg-border" />
              </>
            )}
            <button className="uppercase hover:text-primary" onClick={() => setLocale(locale === "en" ? "uz" : "en")}>
              {locale === "en" ? "O'zbekcha" : "English"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Underlined input with a bold label and a check mark once the value is valid. */
function LineField({
  label,
  value,
  onChange,
  valid,
  trailing,
  ...props
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
  trailing?: ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-text">{label}</span>
      <span className="group mt-1 flex items-center gap-2 border-b-2 border-border pb-1.5 transition-colors focus-within:border-primary">
        <input
          className="min-w-0 flex-1 bg-transparent py-1 text-sm text-text outline-none placeholder:text-muted/70"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...props}
        />
        {trailing}
        <Check
          size={16}
          strokeWidth={3}
          className={`shrink-0 transition ${valid ? "text-primary" : "text-border"}`}
        />
      </span>
    </label>
  );
}

/*
 * Layered clouds: three rows of overlapping circles (two translucent, the front
 * one solid surface-white) so the gradient panel appears to dissolve into the
 * form. Drawn along a vertical edge; the horizontal variant swaps the axes.
 */
const BUMPS: [pos: number, jitter: number, r: number][] = [
  [-10, 6, 58], [80, 0, 72], [175, 18, 54], [250, 4, 68], [345, 14, 56],
  [425, 0, 74], [520, 16, 52], [590, 2, 66], [660, 10, 50],
];

function CloudEdge({ orientation, className }: { orientation: "vertical" | "horizontal"; className?: string }) {
  const layers = [
    { depth: 2, fill: "rgba(255,255,255,0.2)" },
    { depth: 1, fill: "rgba(255,255,255,0.42)" },
    { depth: 0, fill: "var(--surface)" },
  ];
  const v = orientation === "vertical";
  const W = 170;
  const L = 630;
  return (
    <svg
      className={`pointer-events-none ${className ?? ""}`}
      viewBox={v ? `0 0 ${W} ${L}` : `0 0 ${L} ${W}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {layers.map(({ depth, fill }) => {
        const base = 150 - depth * 30;
        return (
          <g key={depth} fill={fill}>
            <rect {...(v ? { x: base, y: 0, width: W - base, height: L } : { x: 0, y: base, width: L, height: W - base })} />
            {BUMPS.map(([pos, jitter, r], i) => {
              // Offset each layer's bumps so the rows don't line up.
              const p = pos + depth * 38;
              const c = base - jitter;
              return <circle key={i} cx={v ? c : p} cy={v ? p : c} r={r * (1 - depth * 0.1)} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}
