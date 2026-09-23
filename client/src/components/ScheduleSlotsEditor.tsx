import type { ScheduleSlot } from "@shared/schema";
import { Trash2, Plus } from "lucide-react";
import { Input } from "./ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Edit a group's weekly timetable slots: for each slot, pick the weekday(s) and a
 * start/end time. Used in the group create/edit modal and the timetable quick-add.
 */
export function ScheduleSlotsEditor({
  value,
  onChange,
}: {
  value: ScheduleSlot[];
  onChange: (v: ScheduleSlot[]) => void;
}) {
  const patch = (i: number, p: Partial<ScheduleSlot>) =>
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...p } : s)));
  const toggleDay = (i: number, day: number) => {
    const days = value[i].days.includes(day)
      ? value[i].days.filter((d) => d !== day)
      : [...value[i].days, day].sort((a, b) => a - b);
    patch(i, { days });
  };
  const add = () => onChange([...value, { days: [], start: "09:00", end: "10:00" }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {value.map((s, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-2">
          <div className="flex flex-wrap gap-1">
            {DAYS.map((label, d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(i, d)}
                className={`h-8 w-10 rounded-md text-xs font-semibold transition ${
                  s.days.includes(d)
                    ? "bg-primary text-white"
                    : "bg-bg text-muted ring-1 ring-border hover:ring-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input type="time" value={s.start} onChange={(e) => patch(i, { start: e.target.value })} />
            <span className="text-muted">–</span>
            <Input type="time" value={s.end} onChange={(e) => patch(i, { end: e.target.value })} />
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 rounded-md p-2 text-status-overdue hover:bg-status-overdue/10"
              title="Remove"
            >
              <Trash2 size={16} />
            </button>
          </div>
          {s.days.length === 0 && (
            <div className="text-xs text-status-awaiting">Pick at least one day.</div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-sm font-medium text-tg-link"
      >
        <Plus size={16} /> Add time slot
      </button>
    </div>
  );
}
