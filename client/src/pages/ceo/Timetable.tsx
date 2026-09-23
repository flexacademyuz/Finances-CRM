import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import type { Class, TeacherRow } from "../../lib/types";
import type { ScheduleSlot } from "@shared/schema";
import { buildEntries, findClashes, layoutDayEntries } from "@shared/timetable";
import { Button, Card, Field, Modal, Select, Spinner } from "../../components/ui";
import { ScheduleSlotsEditor, scheduleSlotsInvalid } from "../../components/ScheduleSlotsEditor";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // 0=Mon … 5=Sat
const HOUR_PX = 58;
const PALETTE = [
  "#6366f1", "#f59e0b", "#10b981", "#06b6d4", "#ec4899",
  "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316",
];

function colorFor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** "540" minutes → "09:00". */
function hourLabel(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:00`;
}

type Tab = "week" | "teacher" | "room";

/**
 * Weekly timetable (web-only). A Mon–Sat grid of every group's sessions, coloured
 * by subject, with teacher/room double-bookings flagged. Filter by teacher or
 * room, and add sessions inline.
 */
export function TimetablePage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });
  const teachers = useQuery({ queryKey: ["teachers"], queryFn: () => api<TeacherRow[]>("/api/teachers") });

  const [tab, setTab] = useState<Tab>("week");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [adding, setAdding] = useState(false);

  const teacherName = (id: string) => teachers.data?.find((x) => x.id === id)?.fullName ?? "—";

  const { entries, clashCount, rangeStart, rangeEnd } = useMemo(() => {
    const all = buildEntries((classes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      subject: c.subject,
      teacherId: c.teacherId,
      room: c.room,
      scheduleSlots: c.scheduleSlots,
    })));
    const clash = findClashes(all);
    const withFlag = all.map((e, i) => ({ ...e, clash: clash.has(i) }));
    // Dynamic vertical range: fit the data, clamped to a sensible window.
    let min = 8 * 60, max = 20 * 60;
    for (const e of all) {
      min = Math.min(min, e.start);
      max = Math.max(max, e.end);
    }
    min = Math.max(0, Math.floor(min / 60) * 60);
    max = Math.min(24 * 60, Math.ceil(max / 60) * 60);
    return { entries: withFlag, clashCount: clash.size, rangeStart: min, rangeEnd: max };
  }, [classes.data]);

  const rooms = useMemo(
    () => Array.from(new Set((classes.data ?? []).map((c) => (c.room ?? "").trim()).filter(Boolean))).sort(),
    [classes.data],
  );

  const shown = entries.filter((e) => {
    if (tab === "teacher" && teacherFilter && e.teacherId !== teacherFilter) return false;
    if (tab === "room" && roomFilter && (e.room ?? "").trim() !== roomFilter) return false;
    return true;
  });

  const hours: number[] = [];
  for (let m = rangeStart; m <= rangeEnd; m += 60) hours.push(m);
  const gridHeight = ((rangeEnd - rangeStart) / 60) * HOUR_PX;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{t("timetable")}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Weekly sessions for every group. Teacher / room clashes are flagged.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={18} /> Add session
        </Button>
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["week", "teacher", "room"] as Tab[]).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              tab === tb ? "bg-primary text-white" : "bg-tg-bg text-muted ring-1 ring-border hover:ring-primary"
            }`}
          >
            {tb === "week" ? "Week" : tb === "teacher" ? "By teacher" : "By room"}
          </button>
        ))}
        {tab === "teacher" && (
          <Select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} className="w-48">
            <option value="">All teachers</option>
            {(teachers.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>{x.fullName}</option>
            ))}
          </Select>
        )}
        {tab === "room" && (
          <Select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className="w-48">
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        )}
        {clashCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-status-overdue/10 px-3 py-1 text-xs font-semibold text-status-overdue">
            <AlertTriangle size={13} /> {clashCount / 2} clash{clashCount / 2 === 1 ? "" : "es"}
          </span>
        )}
      </div>

      {classes.isLoading ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <Card>
          <div className="py-6 text-center text-sm text-muted">
            No sessions yet. Add a group's days &amp; times (in the group editor or “Add session”).
          </div>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <div className="min-w-[720px]">
            {/* Header row */}
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(6, 1fr)` }}>
              <div />
              {DAY_LABELS.map((d) => (
                <div key={d} className="border-b border-border px-2 py-2 text-center text-sm font-semibold">
                  {d}
                </div>
              ))}
            </div>
            {/* Body */}
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(6, 1fr)` }}>
              {/* Time gutter */}
              <div className="relative" style={{ height: gridHeight }}>
                {hours.map((m) => (
                  <div
                    key={m}
                    className="absolute -translate-y-2 pr-2 text-right text-[11px] text-muted"
                    style={{ top: ((m - rangeStart) / 60) * HOUR_PX, right: 0 }}
                  >
                    {hourLabel(m)}
                  </div>
                ))}
              </div>
              {/* Day columns */}
              {DAY_LABELS.map((_, day) => (
                <div key={day} className="relative border-l border-border" style={{ height: gridHeight }}>
                  {hours.map((m) => (
                    <div
                      key={m}
                      className="absolute left-0 right-0 border-t border-border/60"
                      style={{ top: ((m - rangeStart) / 60) * HOUR_PX }}
                    />
                  ))}
                  {layoutDayEntries(shown.filter((e) => e.day === day)).map((e, i) => {
                    const invalid = e.end <= e.start; // end not after start
                    const top = ((e.start - rangeStart) / 60) * HOUR_PX;
                    const height = invalid ? 34 : Math.max(34, ((e.end - e.start) / 60) * HOUR_PX - 3);
                    const widthPct = 100 / e.cols;
                    const leftPct = e.col * widthPct;
                    const bg = colorFor(e.subject || e.name);
                    const flag = e.clash || invalid;
                    return (
                      <div
                        key={`${e.classId}-${i}`}
                        className="absolute overflow-hidden rounded-lg px-2 py-1 text-white shadow-sm"
                        style={{
                          top,
                          height,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          background: bg,
                          outline: flag ? `2px solid ${invalid ? "#f59e0b" : "#ef4444"}` : "none",
                          outlineOffset: flag ? "1px" : undefined,
                        }}
                        title={`${e.name}${e.room ? ` · ${e.room}` : ""} · ${teacherName(e.teacherId)} · ${e.startLabel}–${e.endLabel}${invalid ? " · INVALID (end ≤ start)" : e.clash ? " · CLASH" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="truncate text-xs font-bold leading-tight">{e.name}</span>
                          {flag && <AlertTriangle size={12} className="mt-0.5 shrink-0" />}
                        </div>
                        <div className="text-[10px] font-medium opacity-90">
                          {e.startLabel}–{invalid ? "?" : e.endLabel}
                        </div>
                        {height > 54 && e.room && (
                          <div className="truncate text-[10px] opacity-80">{e.room}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {adding && (
        <AddSessionModal
          classes={classes.data ?? []}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            qc.invalidateQueries({ queryKey: ["classes"] });
          }}
        />
      )}
    </div>
  );
}

/** Add/edit a group's timetable slots straight from the timetable. */
function AddSessionModal({
  classes,
  onClose,
  onSaved,
}: {
  classes: Class[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [classId, setClassId] = useState("");
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);

  const pick = (id: string) => {
    setClassId(id);
    setSlots(classes.find((c) => c.id === id)?.scheduleSlots ?? []);
  };

  const save = useMutation({
    mutationFn: () =>
      api(`/api/classes/${classId}`, {
        method: "PATCH",
        body: { scheduleSlots: slots.filter((s) => s.days.length > 0) },
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title="Add session">
      <div className="max-h-[70vh] space-y-3 overflow-y-auto">
        <Field label="Group">
          <Select value={classId} onChange={(e) => pick(e.target.value)}>
            <option value="">—</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        {classId && (
          <Field label="Days & times">
            <ScheduleSlotsEditor value={slots} onChange={setSlots} />
          </Field>
        )}
        {save.isError && <div className="text-sm text-status-overdue">{(save.error as Error).message}</div>}
        <Button
          className="w-full"
          disabled={!classId || scheduleSlotsInvalid(slots) || save.isPending}
          onClick={() => save.mutate()}
        >
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}
