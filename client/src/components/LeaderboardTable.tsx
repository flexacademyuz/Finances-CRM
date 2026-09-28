/**
 * Staff view of a leaderboard (full names + how the points were earned).
 * Used for one group (ClassDetail → Rating tab) and the whole centre
 * (Leaderboard page, branch-scoped by the server).
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Medal } from "lucide-react";
import type { LeaderboardPeriod } from "@shared/leaderboard";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Card, Empty, Segmented, Spinner } from "./ui";

export const LB_TEXT = {
  week: { en: "This week", uz: "Shu hafta" },
  month: { en: "This month", uz: "Shu oy" },
  all: { en: "All time", uz: "Umumiy" },
  student: { en: "Student", uz: "O'quvchi" },
  group: { en: "Group", uz: "Guruh" },
  practice: { en: "Practice", uz: "Mashq" },
  attendance: { en: "Attendance", uz: "Davomat" },
  results: { en: "Results", uz: "Natijalar" },
  total: { en: "Points", uz: "Ball" },
  off: { en: "Leaderboards are switched off for students.", uz: "Reyting o'quvchilar uchun o'chirilgan." },
} as const;

type Row = {
  rank: number;
  id: string;
  studentId: string;
  name: string;
  groupName: string | null;
  practice: number;
  attendance: number;
  results: number;
  total: number;
  xp: number;
  lessons: number;
  scores: number;
};

const MEDAL = ["#f5b400", "#9aa6b8", "#cd7f32"];

export function LeaderboardTable({ classId, showGroup = false }: { classId?: string; showGroup?: boolean }) {
  const { locale } = useI18n();
  const l = (k: keyof typeof LB_TEXT) => LB_TEXT[k][locale];
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const url = classId ? `/api/leaderboard/group/${classId}` : "/api/leaderboard/center";
  const q = useQuery({
    queryKey: ["leaderboard", classId ?? "center", period],
    queryFn: () => api<{ enabled: boolean; rows: Row[] }>(url, { query: { period } }),
    retry: false,
  });

  return (
    <div className="space-y-3">
      <Segmented
        value={period}
        onChange={(v) => setPeriod(v as LeaderboardPeriod)}
        options={[
          { value: "week", label: l("week") },
          { value: "month", label: l("month") },
          { value: "all", label: l("all") },
        ]}
      />
      {q.data && !q.data.enabled && <div className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">{l("off")}</div>}
      {q.isLoading ? (
        <Spinner />
      ) : !q.data || q.data.rows.length === 0 ? (
        <Empty />
      ) : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2.5">#</th>
                <th className="px-2 py-2.5">{l("student")}</th>
                {showGroup && <th className="hidden px-2 py-2.5 md:table-cell">{l("group")}</th>}
                <th className="hidden px-2 py-2.5 text-right sm:table-cell">{l("practice")}</th>
                <th className="hidden px-2 py-2.5 text-right sm:table-cell">{l("attendance")}</th>
                <th className="hidden px-2 py-2.5 text-right sm:table-cell">{l("results")}</th>
                <th className="px-3 py-2.5 text-right">{l("total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2.5 font-bold text-muted">
                    {r.rank <= 3 && r.total > 0 ? <Medal size={17} style={{ color: MEDAL[r.rank - 1] }} /> : r.rank}
                  </td>
                  <td className="px-2 py-2.5">
                    <Link href={`/student/${r.studentId}`} className="font-semibold hover:text-primary">
                      {r.name}
                    </Link>
                  </td>
                  {showGroup && <td className="hidden px-2 py-2.5 text-muted md:table-cell">{r.groupName}</td>}
                  <td className="hidden px-2 py-2.5 text-right sm:table-cell" title={`${r.xp} XP`}>
                    {r.practice}
                  </td>
                  <td className="hidden px-2 py-2.5 text-right sm:table-cell" title={`${r.lessons}`}>
                    {r.attendance}
                  </td>
                  <td className="hidden px-2 py-2.5 text-right sm:table-cell" title={`${r.scores}`}>
                    {r.results}
                  </td>
                  <td className="px-3 py-2.5 text-right font-extrabold">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
