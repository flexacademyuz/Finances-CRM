/**
 * Student leaderboard: my group or the whole centre, this week / month / all
 * time. Top three on a podium, then the list; my own standing (with how my
 * points were earned) is always visible, even outside the top 50.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Crown, Medal, BookOpen, CalendarCheck, Award, ChevronDown } from "lucide-react";
import type { LeaderboardPeriod, LeaderboardScope } from "@shared/leaderboard";
import type { ApiError } from "../../lib/api";
import { avatarColor } from "../../lib/format";
import { haptic } from "../../lib/telegram";
import { PCard, PageSkeleton, ErrorState, EmptyState } from "../ui";
import { fetchBoard, type Board, type BoardRow } from "./api";
import { useBT } from "./i18n";

export function LeaderboardPage() {
  const { t } = useBT();
  const [scope, setScope] = useState<LeaderboardScope>("group");
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const q = useQuery({
    queryKey: ["portal", "leaderboard", scope, period],
    queryFn: () => fetchBoard(scope, period),
    staleTime: 30_000,
    retry: false,
  });

  return (
    <div className="space-y-3 animate-slide-up">
      <Segment
        value={scope}
        onChange={setScope}
        options={[
          { value: "group", label: t("myGroup") },
          { value: "center", label: t("wholeCenter") },
        ]}
      />
      <div className="flex gap-2">
        {(["week", "month", "all"] as const).map((p) => (
          <button
            key={p}
            onClick={() => {
              haptic("light");
              setPeriod(p);
            }}
            className={`flex-1 rounded-full py-2 text-xs font-bold transition ${
              period === p ? "bg-dark text-white" : "bg-surface text-muted ring-1 ring-border"
            }`}
          >
            {t(p)}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <PageSkeleton />
      ) : (q.error as ApiError | null)?.code === "disabled" ? (
        <EmptyState icon={<Trophy size={24} />} title={t("disabled")} />
      ) : q.error || !q.data ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <BoardView board={q.data} />
      )}
    </div>
  );
}

function BoardView({ board }: { board: Board }) {
  const { t } = useBT();
  const ranked = board.rows.filter((r) => r.points > 0);
  const podium = ranked.slice(0, 3);
  const rest = board.rows.slice(podium.length);
  const meInList = board.rows.some((r) => r.me);

  return (
    <>
      {board.groupName && <div className="px-1 text-xs font-semibold text-muted">{board.groupName} · {t("others", { n: board.total })}</div>}
      {ranked.length === 0 ? (
        <EmptyState icon={<Trophy size={24} />} title={t("empty")} />
      ) : (
        <Podium rows={podium} />
      )}

      {board.me && <MyCard me={board.me} />}

      {rest.length > 0 && (
        <PCard className="!p-0">
          <ul className="divide-y divide-border">
            {rest.map((r) => (
              <Row key={`${r.rank}-${r.name}`} row={r} />
            ))}
          </ul>
        </PCard>
      )}
      {board.me && !meInList && (
        <PCard className="!p-0 ring-2 ring-primary/40">
          <ul>
            <Row row={{ rank: board.me.rank, name: board.me.name, initials: "", points: board.me.total, me: true }} />
          </ul>
        </PCard>
      )}

      <Rules rules={board.rules} />
    </>
  );
}

const MEDAL = ["#f5b400", "#9aa6b8", "#cd7f32"];

function Podium({ rows }: { rows: BoardRow[] }) {
  const { t } = useBT();
  // Classic podium order: 2nd, 1st, 3rd.
  const order = [rows[1], rows[0], rows[2]];
  const heights = ["h-20", "h-28", "h-16"];
  return (
    <div className="hero !pb-0 !pt-4">
      <div className="grid grid-cols-3 items-end gap-2">
        {order.map((r, i) =>
          r ? (
            <div key={r.rank + r.name} className="flex flex-col items-center text-center">
              {r.rank === 1 && <Crown size={22} className="mb-1 text-[#ffd84d]" fill="currentColor" />}
              <div
                className={`grid place-items-center rounded-full font-extrabold text-white ring-4 ${r.me ? "ring-white" : "ring-white/30"} ${i === 1 ? "h-16 w-16 text-lg" : "h-12 w-12 text-sm"}`}
                style={{ background: avatarColor(r.name) }}
              >
                {r.initials}
              </div>
              <div className="mt-1.5 w-full truncate text-xs font-bold">{r.me ? t("you") : r.name}</div>
              <div className="figure text-sm font-extrabold">
                {r.points} <span className="text-[10px] font-semibold opacity-80">{t("points")}</span>
              </div>
              <div
                className={`mt-2 grid w-full place-items-start justify-center rounded-t-2xl pt-2 text-2xl font-extrabold ${heights[i]}`}
                style={{ background: "rgba(255,255,255,0.18)", color: MEDAL[r.rank - 1] ?? "#fff" }}
              >
                {r.rank}
              </div>
            </div>
          ) : (
            <div key={`empty-${i}`} />
          ),
        )}
      </div>
    </div>
  );
}

function Row({ row }: { row: BoardRow }) {
  const { t } = useBT();
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${row.me ? "bg-primary-soft" : ""}`}>
      <span className="figure w-7 shrink-0 text-center text-sm font-extrabold text-muted">
        {row.rank <= 3 ? <Medal size={18} className="mx-auto" style={{ color: MEDAL[row.rank - 1] }} /> : row.rank}
      </span>
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
        style={{ background: avatarColor(row.name) }}
      >
        {row.initials || row.name.slice(0, 2).toUpperCase()}
      </span>
      <span className={`min-w-0 flex-1 truncate ${row.me ? "font-extrabold text-primary" : "font-semibold"}`}>
        {row.me ? `${row.name} (${t("you")})` : row.name}
      </span>
      <span className="figure shrink-0 font-extrabold">
        {row.points} <span className="text-[11px] font-semibold text-muted">{t("points")}</span>
      </span>
    </li>
  );
}

function MyCard({ me }: { me: NonNullable<Board["me"]> }) {
  const { t } = useBT();
  const part = (icon: ReactNode, label: string, value: number, tone: string) => (
    <div className="flex-1 rounded-2xl bg-bg px-2 py-2.5 text-center">
      <div className={`mx-auto grid h-7 w-7 place-items-center rounded-full ${tone}`}>{icon}</div>
      <div className="figure mt-1 text-lg font-extrabold">{value}</div>
      <div className="text-[10.5px] font-semibold text-muted">{label}</div>
    </div>
  );
  return (
    <PCard>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted">{t("myPoints")}</div>
        <div className="figure text-sm font-extrabold text-primary">
          #{me.rank} · {me.total} {t("pointsLong")}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {part(<BookOpen size={14} />, t("practice"), me.practice, "bg-primary-soft text-primary")}
        {part(<CalendarCheck size={14} />, t("attendance"), me.attendance, "bg-status-paid/15 text-status-paid")}
        {part(<Award size={14} />, t("results"), me.results, "bg-violet/15 text-violet")}
      </div>
    </PCard>
  );
}

function Rules({ rules }: { rules: Board["rules"] }) {
  const { t } = useBT();
  const [open, setOpen] = useState(false);
  return (
    <PCard className="!p-0">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold">
        {t("howItWorks")}
        <ChevronDown size={18} className={`text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="space-y-2 px-4 pb-4 text-sm text-muted">
          <li className="flex gap-2">
            <BookOpen size={16} className="mt-0.5 shrink-0 text-primary" /> {t("ruleXp", { n: rules.xpPerPoint })}
          </li>
          <li className="flex gap-2">
            <CalendarCheck size={16} className="mt-0.5 shrink-0 text-status-paid" /> {t("ruleAttend", { p: rules.present, q: rules.partial })}
          </li>
          <li className="flex gap-2">
            <Award size={16} className="mt-0.5 shrink-0 text-violet" /> {t("ruleScore", { p: +(rules.perPercent * 10).toFixed(1) })}
          </li>
        </ul>
      )}
    </PCard>
  );
}

function Segment<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-full bg-surface p-1 shadow-card ring-1 ring-dark/[0.04]" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => {
            haptic("light");
            onChange(o.value);
          }}
          className={`flex-1 rounded-full py-2.5 text-sm font-bold transition ${value === o.value ? "bg-primary text-white shadow-brand" : "text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
