/**
 * Student portal management (CEO; accountants can view + send announcements):
 * adoption + delivery health, bot setup, notification settings, announcements.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Send, CheckCircle2, AlertTriangle, Megaphone, PlayCircle, Save, BellRing, Bot } from "lucide-react";
import { NOTIFICATION_TYPES, renderNotification } from "@shared/notifications";
import type { StudentPortalSettings } from "@shared/schema";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSession, useBranch } from "../../lib/session";
import { formatDate } from "../../lib/format";
import type { Class } from "../../lib/types";
import { Button, Card, Field, Input, Select, StatTile, Segmented } from "../../components/ui";

type Overview = {
  activeStudents: number;
  linkedStudents: number;
  linkedAccounts: number;
  blockedAccounts: number;
  deliveries7d: Record<string, number>;
  recentProblems: { id: string; status: string; attempts: number; lastError: string | null; updatedAt: string; type: string; studentName: string }[];
  botUsername: string | null;
};

type Announcement = { id: string; title: string; body: string; kind: string; recipients: number; createdAt: string; classId: string | null; branchId: string | null };

export function StudentPortalAdminPage() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const isCeo = user.role === "ceo";
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: ["portal-overview"], queryFn: () => api<Overview>("/api/portal/overview") });
  const run = useMutation({
    mutationFn: () => api<{ reminders: number; daily: Record<string, number>; delivered: number }>("/api/portal/run-jobs", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-overview"] }),
  });

  const o = overview.data;
  const pct = o && o.activeStudents ? Math.round((o.linkedStudents / o.activeStudents) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t("studentPortal")}</h1>
        <p className="text-sm text-muted">{t("studentPortalSubtitle")}</p>
      </div>

      {o && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile tint="blue" label={t("linkedStudents")} value={`${o.linkedStudents}/${o.activeStudents}`} sub={`${pct}%`} icon={<Users size={17} />} />
          <StatTile tint="violet" label={t("linkedAccounts")} value={o.linkedAccounts} sub={o.blockedAccounts ? `${o.blockedAccounts} ${t("botBlocked")}` : undefined} icon={<Send size={17} />} />
          <StatTile tint="green" label={t("delivered7d")} value={o.deliveries7d.sent ?? 0} sub={o.deliveries7d.pending ? `${o.deliveries7d.pending} ${t("pending").toLowerCase()}` : undefined} icon={<CheckCircle2 size={17} />} />
          <StatTile tint="red" label={t("failed7d")} value={(o.deliveries7d.failed ?? 0) + (o.deliveries7d.skipped ?? 0)} icon={<AlertTriangle size={17} />} />
        </div>
      )}

      {/* Setup */}
      <Card className="space-y-2">
        <div className="flex items-center gap-2 text-base font-bold"><Bot size={17} className="text-primary" /> {t("botSetup")}</div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>
            {t("botSetup1")} {o?.botUsername && <a className="font-semibold text-primary" href={`https://t.me/${o.botUsername}`} target="_blank" rel="noreferrer">@{o.botUsername}</a>}
          </li>
          <li>{t("botSetup2")}</li>
          <li>{t("botSetup3")}</li>
        </ol>
        {isCeo && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="ghost" disabled={run.isPending} onClick={() => run.mutate()}>
              <PlayCircle size={15} /> {t("runRemindersNow")}
            </Button>
            {run.data && (
              <span className="text-xs text-muted">
                {t("done")}: {run.data.reminders} {t("reminders").toLowerCase()} · {Object.values(run.data.daily).reduce((a, b) => a + b, 0)} {t("billingNotices")} · {run.data.delivered} {t("sent").toLowerCase()}
              </span>
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <AnnouncementComposer />
        <SettingsCard readOnly={!isCeo} />
      </div>

      {o && o.recentProblems.length > 0 && (
        <div>
          <div className="mb-2 text-base font-bold">{t("deliveryProblems")}</div>
          <Card className="!p-0">
            {o.recentProblems.map((p, i) => (
              <div key={p.id} className={`flex items-start gap-3 px-4 py-2.5 text-sm ${i ? "border-t border-border" : ""}`}>
                <span className={`mt-0.5 rounded-pill px-2 py-0.5 text-[11px] font-bold ${p.status === "failed" ? "bg-status-overdue/15 text-status-overdue" : "bg-bg text-muted"}`}>
                  {p.status}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {p.studentName} · {p.type.replace(/_/g, " ")}
                  </div>
                  <div className="truncate text-xs text-muted">{p.lastError}</div>
                </div>
                <span className="shrink-0 text-xs text-muted">{formatDate(p.updatedAt, locale)}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

function AnnouncementComposer() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const { branches, fullAccess } = useBranch();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"general" | "important" | "holiday">("general");
  const [audience, setAudience] = useState("all");
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes", { query: { activeOnly: "1" } }) });
  const list = useQuery({ queryKey: ["announcements"], queryFn: () => api<Announcement[]>("/api/announcements") });
  const send = useMutation({
    mutationFn: () =>
      api<Announcement & { notified: number }>("/api/announcements", {
        method: "POST",
        body: {
          title,
          body,
          kind,
          classId: audience.startsWith("class:") ? audience.slice(6) : null,
          branchId: audience.startsWith("branch:") ? audience.slice(7) : null,
        },
      }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-base font-bold">
        <Megaphone size={17} className="text-primary" /> {t("announcements")}
      </div>
      <Card className="space-y-3">
        <Field label={t("audience")}>
          <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">{t("everyone")}</option>
            {fullAccess &&
              branches.map((b) => (
                <option key={b.id} value={`branch:${b.id}`}>
                  {t("branch")}: {b.name}
                </option>
              ))}
            {(classes.data ?? []).map((c) => (
              <option key={c.id} value={`class:${c.id}`}>
                {t("groups")}: {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Segmented
          full
          value={kind}
          onChange={setKind}
          options={[
            { value: "general", label: t("kindGeneral") },
            { value: "important", label: t("kindImportant") },
            { value: "holiday", label: t("kindHoliday") },
          ]}
        />
        <Field label={t("scoreTitle")}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </Field>
        <Field label={t("message")}>
          <textarea className="input min-h-[100px]" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
        </Field>
        {kind === "important" && <p className="text-xs text-warning">{t("importantNote")}</p>}
        {send.isError && <div className="text-sm text-status-overdue">{(send.error as Error).message}</div>}
        {send.data && <div className="text-sm font-semibold text-status-paid">{t("sentTo").replace("{n}", String(send.data.notified))}</div>}
        <Button className="w-full" disabled={!title.trim() || !body.trim() || send.isPending} onClick={() => send.mutate()}>
          <Send size={15} /> {t("send")}
        </Button>
        {(list.data ?? []).slice(0, 6).map((a) => (
          <div key={a.id} className="border-t border-border pt-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">
                {a.title}
                {a.kind !== "general" && (
                  <span className="ml-1.5 rounded-pill bg-bg px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
                    {a.kind === "important" ? t("kindImportant") : t("kindHoliday")}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted">{formatDate(a.createdAt, locale)}</span>
            </div>
            <div className="line-clamp-2 text-xs text-muted">{a.body}</div>
            <div className="text-[11px] text-muted">→ {a.recipients}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function SettingsCard({ readOnly }: { readOnly: boolean }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["portal-settings"], queryFn: () => api<StudentPortalSettings>("/api/portal/settings") });
  const [s, setS] = useState<StudentPortalSettings | null>(null);
  const [hours, setHours] = useState("");
  useEffect(() => {
    if (q.data) {
      setS(q.data);
      setHours(q.data.lessonReminderHours.join(", "));
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: () =>
      api<StudentPortalSettings>("/api/portal/settings", {
        method: "PATCH",
        body: {
          ...s,
          lessonReminderHours: hours
            .split(",")
            .map((x) => Number(x.trim()))
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= 72),
        },
      }),
    onSuccess: (r) => qc.setQueryData(["portal-settings"], r),
  });
  if (!s) return null;
  const set = <K extends keyof StudentPortalSettings>(k: K, v: StudentPortalSettings[K]) => setS({ ...s, [k]: v });
  const num = (k: keyof StudentPortalSettings, label: string, min: number, max: number) => (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        disabled={readOnly}
        value={String(s[k])}
        onChange={(e) => set(k, Number(e.target.value) as never)}
      />
    </Field>
  );
  const types = Object.keys(NOTIFICATION_TYPES);
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-base font-bold">
        <BellRing size={17} className="text-primary" /> {t("notificationSettingsTitle")}
      </div>
      <Card className="space-y-3">
        <Toggle label={t("telegramPushes")} checked={s.telegramEnabled} disabled={readOnly} onChange={(v) => set("telegramEnabled", v)} />
        <Toggle label={t("notifyPresent")} checked={s.notifyPresent} disabled={readOnly} onChange={(v) => set("notifyPresent", v)} />
        <div className="grid grid-cols-2 gap-2">
          {num("attendanceWarningThreshold", t("warnThreshold"), 0, 100)}
          {num("attendanceWarningMinLessons", t("warnMinLessons"), 1, 100)}
          {num("paymentDueSoonDays", t("dueSoonDays"), 0, 14)}
          {num("debtReminderEveryDays", t("debtEveryDays"), 1, 60)}
          {num("attendanceEditDays", t("attendanceEditDays"), 0, 365)}
          <Field label={t("reminderHours")}>
            <Input disabled={readOnly} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="24, 2" />
          </Field>
        </div>
        <details className="rounded-btn bg-bg p-3">
          <summary className="cursor-pointer text-sm font-semibold">{t("notificationTypes")}</summary>
          <div className="mt-2 grid gap-1">
            {types.map((ty) => {
              const on = !s.disabledTypes.includes(ty);
              const r = renderNotification(ty, {}, locale);
              return (
                <label key={ty} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={on}
                    onChange={() => set("disabledTypes", on ? [...s.disabledTypes, ty] : s.disabledTypes.filter((x) => x !== ty))}
                  />
                  <span>
                    {r.title || ty.replace(/_/g, " ")}
                  </span>
                </label>
              );
            })}
          </div>
        </details>
        {save.isError && <div className="text-sm text-status-overdue">{(save.error as Error).message}</div>}
        {!readOnly && (
          <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
            <Save size={15} /> {save.isSuccess ? t("saved") : t("save")}
          </Button>
        )}
      </Card>
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-3 text-sm font-semibold ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      {label}
      <input type="checkbox" className="h-5 w-5 accent-[#3457f5]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
