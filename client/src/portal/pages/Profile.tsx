import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LogOut, Send } from "lucide-react";
import { PREF_GROUP_LABELS, fmtDay, type PrefGroup } from "@shared/notifications";
import { Modal, Segmented } from "../../components/ui";
import { initials, avatarColor } from "../../lib/format";
import { haptic, tg } from "../../lib/telegram";
import { papi, type PortalSettings } from "../api";
import { usePT } from "../i18n";
import { useMe } from "../PortalApp";
import { PCard, SectionTitle, weekdayShort } from "../ui";

export function ProfilePage() {
  const { t, locale, setLocale } = usePT();
  const me = useMe();
  const qc = useQueryClient();
  const readOnly = !!me.preview;
  const [confirm, setConfirm] = useState(false);
  const s = me.student;
  const g = me.group;

  const settings = useQuery({ queryKey: ["portal", "settings"], queryFn: () => papi<PortalSettings>("/settings") });
  const save = useMutation({
    mutationFn: (body: { disabled: string[]; language?: "uz" | "en" }) => papi("/settings", { method: "PUT", body }),
    onSuccess: () => {
      haptic("success");
      qc.invalidateQueries({ queryKey: ["portal", "settings"] });
      qc.invalidateQueries({ queryKey: ["portal", "me"] });
    },
  });
  const unlink = useMutation({
    mutationFn: () => papi("/unlink", { method: "POST" }),
    onSuccess: () => {
      tg()?.close?.();
      window.location.reload();
    },
  });

  const disabled = settings.data?.disabled ?? [];
  const toggle = (grp: string) => {
    if (readOnly || !settings.data) return;
    const next = disabled.includes(grp) ? disabled.filter((x) => x !== grp) : [...disabled, grp];
    qc.setQueryData(["portal", "settings"], { ...settings.data, disabled: next });
    save.mutate({ disabled: next });
  };

  return (
    <div className="space-y-3 animate-slide-up">
      <PCard className="flex flex-col items-center !p-6 text-center">
        <div
          className="grid h-20 w-20 place-items-center rounded-full text-2xl font-extrabold text-white shadow-card"
          style={{ background: avatarColor(s.fullName) }}
        >
          {initials(s.fullName)}
        </div>
        <div className="mt-3 text-xl font-extrabold tracking-tight">{s.fullName}</div>
        {g && <div className="text-sm text-muted">{g.name}</div>}
        <span
          className={`mt-2 rounded-full px-3 py-1 text-xs font-bold ${
            s.active ? "bg-status-paid/15 text-status-paid" : "bg-freeze/15 text-freeze"
          }`}
        >
          {s.active ? t("active") : t("stopped")}
        </span>
      </PCard>

      <PCard className="!p-0">
        <dl className="divide-y divide-border px-4 text-sm">
          {g?.teacherName && <Row label={t("teacher")} value={g.teacherName} />}
          {g?.room && <Row label={t("room")} value={g.room} />}
          {g?.branchName && <Row label={t("branch")} value={g.branchName} />}
          <Row label={t("enrolled")} value={fmtDay(s.enrolledAt, locale) + ` ${s.enrolledAt.slice(0, 4)}`} />
          {s.phone && <Row label={t("phone")} value={s.phone} />}
          {me.account && (
            <Row label={t("telegram")} value={me.account.username ? `@${me.account.username}` : t("connected")} />
          )}
        </dl>
      </PCard>

      {g && g.scheduleSlots.length > 0 && (
        <>
          <SectionTitle>{t("schedule")}</SectionTitle>
          <PCard className="space-y-2">
            {g.scheduleSlots.map((slot, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1">
                  {[...slot.days].sort().map((d) => (
                    <span key={d} className="rounded-lg bg-primary-soft px-2 py-1 text-xs font-bold text-primary">
                      {weekdayShort(d, locale)}
                    </span>
                  ))}
                </div>
                <span className="figure text-sm font-bold">
                  {slot.start}–{slot.end}
                </span>
              </div>
            ))}
          </PCard>
        </>
      )}

      <SectionTitle>{t("language")}</SectionTitle>
      <Segmented
        full
        value={locale}
        onChange={(l) => {
          setLocale(l);
          if (!readOnly) save.mutate({ disabled, language: l });
        }}
        options={[
          { value: "uz", label: "O'zbekcha" },
          { value: "en", label: "English" },
        ]}
      />

      <SectionTitle>{t("notificationSettings")}</SectionTitle>
      <PCard className="!p-0">
        {(settings.data?.groups ?? []).map((grp, i) => {
          const on = !disabled.includes(grp);
          const partlyLocked = settings.data?.partlyMandatory.includes(grp);
          return (
            <label
              key={grp}
              className={`flex cursor-pointer items-center gap-3 px-4 py-3.5 ${i ? "border-t border-border" : ""} ${readOnly ? "opacity-60" : ""}`}
            >
              <span className="flex-1 text-sm font-semibold">
                {PREF_GROUP_LABELS[grp as PrefGroup]?.[locale] ?? grp}
                {partlyLocked && <Lock size={12} className="ml-1 inline text-muted" />}
              </span>
              <Switch checked={on} onChange={() => toggle(grp)} disabled={readOnly} />
            </label>
          );
        })}
      </PCard>
      <p className="px-1 text-xs text-muted">
        <Lock size={11} className="mr-1 inline" />
        {t("alwaysOnNote")}
      </p>

      {me.account && !readOnly && (
        <button onClick={() => setConfirm(true)} className="btn btn-danger mt-2 w-full">
          <LogOut size={16} /> {t("disconnect")}
        </button>
      )}
      <div className="flex items-center justify-center gap-1 pt-2 text-[11px] text-muted">
        <Send size={11} /> Flex Academy
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={t("disconnect")}>
        <p className="text-sm text-muted">{t("disconnectConfirm")}</p>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setConfirm(false)}>
            {t("cancel")}
          </button>
          <button className="btn btn-danger flex-1" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
            {t("confirm")}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

/** Accessible toggle switch (large touch target). */
function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        onChange();
      }}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-dark/15"}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}
