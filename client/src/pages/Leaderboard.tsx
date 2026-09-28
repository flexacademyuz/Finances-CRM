/**
 * Centre leaderboard for staff (branch-scoped by the server), with the CEO's
 * point settings. Group boards live on each group's page (Rating tab).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Trophy } from "lucide-react";
import { DEFAULT_LEADERBOARD_SETTINGS, type LeaderboardSettings } from "@shared/leaderboard";
import { api, type ApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { Button, Card, Field, Input } from "../components/ui";
import { LeaderboardTable } from "../components/LeaderboardTable";

const T = {
  title: { en: "Leaderboard", uz: "Reyting" },
  subtitle: {
    en: "Students ranked across the whole centre. Each group has its own board on the group page (Rating tab).",
    uz: "Butun markaz bo'yicha o'quvchilar reytingi. Har bir guruhning o'z reytingi guruh sahifasida (Reyting bo'limi).",
  },
  rules: { en: "How points are earned", uz: "Ball qanday to'planadi" },
  enabled: { en: "Show leaderboards to students", uz: "Reytingni o'quvchilarga ko'rsatish" },
  xpPerPoint: { en: "XP per 1 point (practice)", uz: "1 ball uchun XP (mashq)" },
  present: { en: "Points per lesson attended", uz: "Qatnashgan dars uchun ball" },
  partial: { en: "…if late / left early", uz: "…kechiksa / erta ketsa" },
  perPercent: { en: "Points per 1% on a test", uz: "Testdagi 1% uchun ball" },
  save: { en: "Save", uz: "Saqlash" },
  saved: { en: "Saved", uz: "Saqlandi" },
  example: {
    en: "Example: a week with 250 XP of practice, 3 lessons and one 90% test = {p} points.",
    uz: "Misol: 250 XP mashq, 3 ta dars va bitta 90% test bilan hafta = {p} ball.",
  },
} as const;

export function LeaderboardPage() {
  const { locale } = useI18n();
  const { user } = useSession();
  const l = (k: keyof typeof T) => T[k][locale];
  const canTune = user.role === "ceo" || user.role === "accountant";

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-warning/15 text-warning">
          <Trophy size={22} />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">{l("title")}</h1>
          <p className="text-sm text-muted">{l("subtitle")}</p>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <LeaderboardTable showGroup />
        {canTune && <RulesCard editable={user.role === "ceo"} />}
      </div>
    </div>
  );
}

function RulesCard({ editable }: { editable: boolean }) {
  const { locale } = useI18n();
  const l = (k: keyof typeof T) => T[k][locale];
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["portal-settings"], queryFn: () => api<LeaderboardSettings>("/api/portal/settings") });
  const [f, setF] = useState<LeaderboardSettings>(DEFAULT_LEADERBOARD_SETTINGS);
  useEffect(() => {
    if (q.data) {
      setF({
        leaderboardEnabled: q.data.leaderboardEnabled,
        lbXpPerPoint: q.data.lbXpPerPoint,
        lbPresentPoints: q.data.lbPresentPoints,
        lbPartialPoints: q.data.lbPartialPoints,
        lbScorePointsPerPercent: q.data.lbScorePointsPerPercent,
      });
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api("/api/portal/settings", { method: "PATCH", body: f }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["portal-settings"] });
      void qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
  const num = (k: keyof LeaderboardSettings, v: string) => setF((s) => ({ ...s, [k]: Number(v) }));
  const example = Math.floor(250 / Math.max(1, f.lbXpPerPoint)) + 3 * f.lbPresentPoints + Math.round(90 * f.lbScorePointsPerPercent);

  return (
    <Card className="h-fit space-y-3">
      <div className="font-bold">{l("rules")}</div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          disabled={!editable}
          checked={f.leaderboardEnabled}
          onChange={(e) => setF((s) => ({ ...s, leaderboardEnabled: e.target.checked }))}
        />
        {l("enabled")}
      </label>
      <Field label={l("xpPerPoint")}>
        <Input type="number" min={1} disabled={!editable} value={f.lbXpPerPoint} onChange={(e) => num("lbXpPerPoint", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={l("present")}>
          <Input type="number" min={0} disabled={!editable} value={f.lbPresentPoints} onChange={(e) => num("lbPresentPoints", e.target.value)} />
        </Field>
        <Field label={l("partial")}>
          <Input type="number" min={0} disabled={!editable} value={f.lbPartialPoints} onChange={(e) => num("lbPartialPoints", e.target.value)} />
        </Field>
      </div>
      <Field label={l("perPercent")}>
        <Input
          type="number"
          min={0}
          step={0.1}
          disabled={!editable}
          value={f.lbScorePointsPerPercent}
          onChange={(e) => num("lbScorePointsPerPercent", e.target.value)}
        />
      </Field>
      <div className="rounded-xl bg-bg px-3 py-2 text-xs text-muted">{l("example").replace("{p}", String(example))}</div>
      {editable && (
        <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save size={15} /> {save.isSuccess ? l("saved") : l("save")}
        </Button>
      )}
      {save.error && <div className="text-sm text-danger">{(save.error as ApiError).message}</div>}
    </Card>
  );
}
