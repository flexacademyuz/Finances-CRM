/** Home card: my weekly rank in my group (+ the centre), one tap to the board. */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Trophy, ChevronRight } from "lucide-react";
import { PCard } from "../ui";
import { fetchSummary } from "./api";
import { useBT } from "./i18n";

export function RankCard() {
  const { t } = useBT();
  const q = useQuery({ queryKey: ["portal", "leaderboard", "summary"], queryFn: fetchSummary, staleTime: 60_000, retry: false });
  const d = q.data;
  if (!d || !d.enabled) return null;
  const g = d.group;
  const ranked = g && g.points > 0;
  return (
    <Link href="/leaderboard" className="block">
      <PCard className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-warning/15 text-warning">
          <Trophy size={22} />
        </span>
        <div className="min-w-0 flex-1">
          {ranked ? (
            <>
              <div className="figure text-lg font-extrabold leading-tight">{t("rankOf", { r: g!.rank, n: g!.of })}</div>
              <div className="text-xs text-muted">
                {t("inGroup")}
                {d.center && d.center.points > 0 ? ` · ${t("inCenter", { r: d.center.rank })}` : ""}
              </div>
            </>
          ) : (
            <>
              <div className="font-bold">{t("leaderboard")}</div>
              <div className="text-xs text-muted">{t("noRankYet")}</div>
            </>
          )}
        </div>
        {d.podium.length > 0 && (
          <div className="flex -space-x-2">
            {d.podium.map((p) => (
              <span
                key={p.rank + p.name}
                title={p.name}
                className={`grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ${p.me ? "ring-primary" : "ring-surface"}`}
                style={{ background: ["#f5b400", "#9aa6b8", "#cd7f32"][p.rank - 1] ?? "#7a8699" }}
              >
                {p.initials}
              </span>
            ))}
          </div>
        )}
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </PCard>
    </Link>
  );
}
