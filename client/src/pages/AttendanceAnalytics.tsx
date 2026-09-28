/**
 * Management attendance analytics: totals, daily rate trend, per-group table,
 * and students under the warning threshold — filterable by date range, group,
 * teacher and status. (Teachers see only their own groups; server-enforced.)
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { CalendarCheck, UserCheck, UserX, Clock, Percent, AlertTriangle, Download } from "lucide-react";
import type { AttendanceSummary } from "@shared/attendance";
import { addDaysIso, tashkentDate } from "@shared/lesson-schedule";
import { api, downloadCsv } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import type { Class } from "../lib/types";
import { Button, Card, Empty, Select, Spinner, StatTile, Segmented, Input } from "../components/ui";

type Row = AttendanceSummary;
type Analytics = {
  totals: Row & { lessons: number };
  byGroup: { classId: string; className: string; lessons: number; students: number; summary: Row }[];
  byTeacher: { teacherId: string | null; teacherName: string | null; lessons: number; summary: Row }[];
  daily: (Row & { date: string })[];
  students: { studentId: string; fullName: string; className: string; summary: Row }[];
  warnings: { studentId: string; fullName: string; className: string; summary: Row }[];
  warning: { threshold: number; minLessons: number };
};

type TeacherOpt = { id: string; fullName: string };

export function AttendanceAnalyticsPage() {
  const { t } = useI18n();
  const { user } = useSession();
  const today = tashkentDate();
  const [preset, setPreset] = useState<"7" | "30" | "90" | "custom">("30");
  const [from, setFrom] = useState(addDaysIso(today, -29));
  const [to, setTo] = useState(today);
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [status, setStatus] = useState("");

  const range = preset === "custom" ? { from, to } : { from: addDaysIso(today, -(Number(preset) - 1)), to: today };
  const query = { ...range, classId: classId || undefined, teacherId: teacherId || undefined, status: status || undefined };

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });
  const teachers = useQuery({
    queryKey: ["teachers-list"],
    queryFn: () => api<TeacherOpt[]>("/api/teachers"),
    enabled: user.role !== "teacher",
  });
  const q = useQuery({
    queryKey: ["attendance-analytics", query],
    queryFn: () => api<Analytics>("/api/attendance/analytics", { query }),
  });

  const trend = useMemo(
    () => (q.data?.daily ?? []).map((d) => ({ date: d.date.slice(5).split("-").reverse().join("."), rate: d.rate })),
    [q.data],
  );

  const d = q.data;
  const pct = (r: number | null) => (r == null ? "—" : `${r}%`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{t("attendance")}</h1>
          <p className="text-sm text-muted">{t("attendanceSubtitle")}</p>
        </div>
        {user.role !== "teacher" && (
          <Button variant="ghost" onClick={() => downloadCsv("/api/attendance/export", `attendance_${range.from}_${range.to}.csv`, { ...range, classId: classId || undefined })}>
            <Download size={15} /> {t("exportCsv")}
          </Button>
        )}
      </div>

      {/* Filters — one row above the charts */}
      <Card className="flex flex-wrap items-center gap-2 !p-3">
        <Segmented
          value={preset}
          onChange={setPreset}
          options={[
            { value: "7", label: "7d" },
            { value: "30", label: "30d" },
            { value: "90", label: "90d" },
            { value: "custom", label: t("custom") },
          ]}
        />
        {preset === "custom" && (
          <>
            <Input type="date" className="!w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" className="!w-auto" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        <Select className="!w-auto min-w-[9rem]" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t("allGroups")}</option>
          {(classes.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {user.role !== "teacher" && (
          <Select className="!w-auto min-w-[9rem]" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">{t("allTeachers")}</option>
            {(teachers.data ?? []).map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.fullName}
              </option>
            ))}
          </Select>
        )}
        <Select className="!w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("allStatuses")}</option>
          {(["present", "late", "absent", "excused", "left_early"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`att_${s}`)}
            </option>
          ))}
        </Select>
      </Card>

      {q.isLoading || !d ? (
        <Spinner />
      ) : d.totals.total === 0 ? (
        <Empty>{t("noAttendanceData")}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatTile tint="blue" label={t("lessons")} value={d.totals.lessons} icon={<CalendarCheck size={17} />} />
            <StatTile tint="green" label={t("att_present")} value={d.totals.present + d.totals.leftEarly} icon={<UserCheck size={17} />} />
            <StatTile tint="red" label={t("att_absent")} value={d.totals.absent} icon={<UserX size={17} />} />
            <StatTile tint="amber" label={t("att_late")} value={d.totals.late} icon={<Clock size={17} />} />
            <StatTile tint="violet" label={t("attendanceRate")} value={pct(d.totals.rate)} icon={<Percent size={17} />} sub={`${t("att_excused")}: ${d.totals.excused}`} />
          </div>

          {trend.length > 1 && (
            <Card>
              <div className="mb-2 text-sm font-bold">{t("dailyAttendanceRate")}</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                    <CartesianGrid vertical={false} stroke="rgba(26,35,56,0.07)" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7a8699" }} minTickGap={16} />
                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7a8699" }} />
                    <Tooltip
                      cursor={{ stroke: "rgba(26,35,56,0.2)" }}
                      contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 8px 24px -8px rgba(24,32,56,.25)", fontSize: 12 }}
                      formatter={(v: number) => [`${v}%`, t("attendanceRate")]}
                    />
                    <Line type="monotone" dataKey="rate" stroke="#3457f5" strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Per group */}
          <div>
            <div className="mb-2 text-base font-bold">{t("byGroup")}</div>
            <Card className="overflow-x-auto !p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">{t("groups")}</th>
                    <th className="px-2 py-2.5 text-right font-semibold">{t("lessons")}</th>
                    <th className="px-2 py-2.5 text-right font-semibold">{t("students")}</th>
                    <th className="px-2 py-2.5 text-right font-semibold">{t("att_present")}</th>
                    <th className="px-2 py-2.5 text-right font-semibold">{t("att_absent")}</th>
                    <th className="px-2 py-2.5 text-right font-semibold">{t("att_late")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byGroup.map((g) => (
                    <tr key={g.classId} className="border-t border-border">
                      <td className="px-4 py-2.5 font-semibold">
                        <Link href={`/class/${g.classId}?tab=attendance`} className="text-primary hover:underline">
                          {g.className}
                        </Link>
                      </td>
                      <td className="px-2 text-right">{g.lessons}</td>
                      <td className="px-2 text-right">{g.students}</td>
                      <td className="px-2 text-right">{g.summary.present + g.summary.leftEarly}</td>
                      <td className="px-2 text-right">{g.summary.absent}</td>
                      <td className="px-2 text-right">{g.summary.late}</td>
                      <td className="px-4 text-right font-bold">
                        <RateBar rate={g.summary.rate} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          {/* Warnings */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-base font-bold">
              <AlertTriangle size={17} className="text-warning" /> {t("warningStudents")}
              <span className="text-xs font-medium text-muted">
                &lt; {d.warning.threshold}% · ≥ {d.warning.minLessons} {t("lessons").toLowerCase()}
              </span>
            </div>
            {d.warnings.length === 0 ? (
              <Card className="text-sm text-muted">{t("noWarnings")}</Card>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {d.warnings.map((s) => (
                  <Link key={s.studentId} href={`/student/${s.studentId}`} className="block">
                    <Card className="flex items-center gap-3 !p-3.5 hover:shadow-card-hover">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{s.fullName}</div>
                        <div className="truncate text-xs text-muted">
                          {s.className} · {t("att_absent")} {s.summary.absent} · {t("att_late")} {s.summary.late}
                        </div>
                      </div>
                      <span className="rounded-pill bg-status-overdue/15 px-2.5 py-1 text-sm font-extrabold text-status-overdue">{pct(s.summary.rate)}</span>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Teachers (management only) */}
          {user.role !== "teacher" && d.byTeacher.length > 1 && (
            <div>
              <div className="mb-2 text-base font-bold">{t("byTeacher")}</div>
              <div className="grid gap-2 md:grid-cols-3">
                {d.byTeacher.map((tt) => (
                  <Card key={tt.teacherId ?? "none"} className="!p-3.5">
                    <div className="truncate font-semibold">{tt.teacherName ?? "—"}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted">
                      <span>
                        {tt.lessons} {t("lessons").toLowerCase()}
                      </span>
                      <RateBar rate={tt.summary.rate} />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RateBar({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-muted">—</span>;
  const color = rate >= 80 ? "#12b76a" : rate >= 60 ? "#d18700" : "#e23744";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-dark/[0.07] sm:inline-block">
        <span className="block h-full rounded-full" style={{ width: `${rate}%`, background: color }} />
      </span>
      <span className="figure font-bold text-text">{rate}%</span>
    </span>
  );
}
