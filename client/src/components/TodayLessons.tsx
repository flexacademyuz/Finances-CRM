/** "Today's lessons": the caller's groups meeting today + whether attendance is taken. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CalendarCheck, CheckCircle2, ChevronRight, Ban } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Card } from "./ui";

type Today = {
  date: string;
  groups: {
    id: string;
    name: string;
    room: string | null;
    slot: { start: string; end: string } | null;
    students: number;
    lessonStatus: "held" | "cancelled" | null;
    marked: number;
  }[];
};

export function TodayLessons() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["attendance-today"], queryFn: () => api<Today>("/api/attendance/today") });
  const meeting = (q.data?.groups ?? []).filter((g) => g.slot || g.lessonStatus);
  if (!q.data || meeting.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-base font-bold">
        <CalendarCheck size={18} className="text-primary" /> {t("todaysLessons")}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {meeting.map((g) => {
          const done = g.lessonStatus === "held" && g.marked > 0;
          const cancelled = g.lessonStatus === "cancelled";
          return (
            <Link key={g.id} href={`/class/${g.id}?tab=attendance`} className="block">
              <Card className="flex items-center gap-3 !p-3.5 transition hover:shadow-card-hover">
                <div className="grid h-11 w-14 shrink-0 place-items-center rounded-2xl bg-primary-soft text-sm font-extrabold text-primary">
                  {g.slot?.start ?? "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold leading-tight line-clamp-2">{g.name}</div>
                  <div className="truncate text-xs text-muted">
                    {g.room ? `${g.room} · ` : ""}
                    {cancelled ? (
                      <span className="font-semibold text-status-overdue">
                        <Ban size={11} className="inline" /> {t("lessonCancelled")}
                      </span>
                    ) : done ? (
                      <span className="font-semibold text-status-paid">
                        <CheckCircle2 size={11} className="inline" /> {t("taken")} {g.marked}/{g.students}
                      </span>
                    ) : (
                      <span className="font-semibold text-warning">{t("notTakenYet")}</span>
                    )}
                  </div>
                </div>
                {!done && !cancelled ? (
                  <span className="shrink-0 rounded-pill bg-primary px-3 py-1.5 text-xs font-bold text-white">{t("takeAttendance")}</span>
                ) : (
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
