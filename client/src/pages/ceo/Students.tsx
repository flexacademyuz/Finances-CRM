import { useState } from "react";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ChevronRight,
  Search,
  Archive,
  Phone,
  Users2,
  Coins,
  GraduationCap,
  UserCheck,
  UserX,
  CalendarClock,
} from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { can } from "@shared/permissions";
import { money, formatDate } from "../../lib/format";
import type { StudentRow, Class, TeacherRow } from "../../lib/types";
import type { StudentStatus } from "@shared/schema";
import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  StatTile,
  StatusPill,
  STATUS_ACCENT,
} from "../../components/ui";

/** Deterministic avatar colour from a name (varied, like the reference). */
const AVATARS = ["#3457f5", "#7b5cf5", "#12b76a", "#e23744", "#d18700", "#0ea5e9", "#ec4899"];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

const STATUSES: (StudentStatus | "")[] = ["", "paid", "awaiting_payment", "overdue", "frozen", "not_due"];

/** Round, tap-to-reveal icon button used in the students toolbar. */
export function StudentsPage() {
  const { t } = useI18n();
  const { user } = useSession();
  const qc = useQueryClient();
  const canAdd = can(user, "add_student");
  // Deep-linkable status filter (e.g. dashboard "Overdue" → /students?status=overdue).
  const qs = useSearch();
  const [view, setView] = useState<"active" | "archived">("active");
  const [status, setStatus] = useState<StudentStatus | "">(
    () => (new URLSearchParams(qs).get("status") as StudentStatus) || "",
  );
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [resuming, setResuming] = useState<StudentRow | null>(null);

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });
  // All students (active + archived) power the stat tiles.
  const allStudents = useQuery({ queryKey: ["students-all"], queryFn: () => api<StudentRow[]>("/api/students", {}) });
  const students = useQuery({
    queryKey: ["students", view, status, classId],
    queryFn: () =>
      api<StudentRow[]>("/api/students", {
        query:
          view === "archived"
            ? { archived: "1", classId: classId || undefined }
            : { activeOnly: "1", status: status || undefined, classId: classId || undefined },
      }),
  });

  const all = allStudents.data ?? [];
  const total = all.length;
  const active = all.filter((s) => s.active).length;
  const inactive = total - active;
  const ym = new Date().toISOString().slice(0, 7);
  const newThisMonth = all.filter((s) => (s.enrolledAt ?? "").startsWith(ym)).length;

  // Live name/phone search over the already-filtered list.
  const q = search.trim().toLowerCase();
  const filtered = (students.data ?? []).filter(
    (s) => !q || s.fullName.toLowerCase().includes(q) || (s.phone ?? "").toLowerCase().includes(q),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t("students")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("studentsSubtitle")}</p>
        </div>
        {canAdd && (
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} /> {t("addStudentAction")}
          </Button>
        )}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile tint="blue" label={t("totalStudents")} value={total} icon={<Users2 size={18} />} sub={t("enrolled")} />
        <StatTile tint="green" label={t("activeStudents")} value={active} icon={<UserCheck size={18} />} sub={total ? `${Math.round((active / total) * 100)}% ${t("ofTotal")}` : undefined} />
        <StatTile tint="violet" label={t("newThisMonth")} value={newThisMonth} icon={<CalendarClock size={18} />} sub={new Date().toLocaleDateString("en-US", { month: "long" })} />
        <StatTile tint="red" label={t("inactiveStudents")} value={inactive} icon={<UserX size={18} />} sub={t("archived")} />
      </div>

      {/* Search + filters */}
      <Card className="!p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder={t("searchStudentHint")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select className="w-auto min-w-[150px]" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t("allGroups")}</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          {view === "active" && (
            <Select className="w-auto min-w-[140px]" value={status} onChange={(e) => setStatus(e.target.value as StudentStatus | "")}>
              <option value="">{t("allStatus")}</option>
              {STATUSES.filter(Boolean).map((s) => (
                <option key={s} value={s}>{t(s as StudentStatus)}</option>
              ))}
            </Select>
          )}
          <button
            type="button"
            onClick={() => setView(view === "active" ? "archived" : "active")}
            title={t("archived")}
            className={`inline-flex items-center gap-1.5 rounded-btn px-3 py-2 text-sm font-semibold transition ${
              view === "archived" ? "bg-primary text-white" : "bg-bg text-muted ring-1 ring-border hover:text-primary"
            }`}
          >
            <Archive size={16} /> {view === "archived" ? t("archived") : t("active")}
          </button>
        </div>
      </Card>

      {/* List — rich rows with a status accent bar, avatar, group/fee, join date, status */}
      {students.isLoading ? (
        <Spinner />
      ) : filtered.length ? (
        <div className="space-y-2">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="group relative flex items-center gap-2 overflow-hidden rounded-card bg-surface p-3 pl-4 shadow-card ring-1 ring-dark/[0.04] transition hover:shadow-card-hover"
            >
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: STATUS_ACCENT[s.status] ?? "#7a8699" }} />
              <Link href={`/student/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: avatarColor(s.fullName) }}>
                  {initials(s.fullName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{s.fullName}</div>
                  {s.phone && (
                    <div className="flex items-center gap-1 truncate text-xs text-muted">
                      <Phone size={12} /> {s.phone}
                    </div>
                  )}
                </div>
                {/* Fixed-width columns so every row lines up. */}
                <div className="hidden w-40 shrink-0 sm:block">
                  <div className="flex items-center gap-1 truncate text-sm font-medium">
                    <Users2 size={13} className="shrink-0 text-muted" /> {s.className}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <Coins size={12} /> {money(s.effectiveFee)}
                  </div>
                </div>
                <div className="hidden w-28 shrink-0 md:block">
                  <div className="text-[11px] text-muted">{t("startDate")}</div>
                  <div className="text-sm">{formatDate(s.enrolledAt)}</div>
                </div>
                <div className="flex w-[124px] shrink-0 justify-start">
                  <StatusPill status={s.status} balance={view === "active" ? s.balance : undefined} />
                </div>
                <ChevronRight size={18} className="hidden shrink-0 text-muted sm:block" />
              </Link>
              {view === "archived" && (
                <Button variant="ghost" className="shrink-0" onClick={() => setResuming(s)}>{t("resumeStudent")}</Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty>{view === "archived" ? t("noArchived") : undefined}</Empty>
      )}

      <AddStudentModal
        open={adding}
        onClose={() => setAdding(false)}
        classes={classes.data ?? []}
        onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["students"] }); qc.invalidateQueries({ queryKey: ["students-all"] }); }}
      />
      {resuming && (
        <ResumeStudentModal
          student={resuming}
          classes={classes.data ?? []}
          onClose={() => setResuming(null)}
          onSaved={() => { setResuming(null); qc.invalidateQueries({ queryKey: ["students"] }); qc.invalidateQueries({ queryKey: ["students-all"] }); }}
        />
      )}
    </div>
  );
}

/** Bring a stopped student back, optionally into a different group. */
function ResumeStudentModal({
  student,
  classes,
  onClose,
  onSaved,
}: {
  student: StudentRow;
  classes: Class[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [classId, setClassId] = useState(student.classId);
  const [resumeDate, setResumeDate] = useState(new Date().toISOString().slice(0, 10));

  const resume = useMutation({
    mutationFn: () =>
      api(`/api/students/${student.id}/resume`, {
        method: "POST",
        body: { classId, resumeDate },
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={`${t("resumeStudent")} — ${student.fullName}`}>
      <div className="space-y-3">
        <Field label={t("resumeInto")}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("resumeDate")}>
          <Input type="date" value={resumeDate} onChange={(e) => setResumeDate(e.target.value)} />
        </Field>
        {resume.isError && (
          <div className="text-sm text-status-overdue">{(resume.error as Error).message}</div>
        )}
        <Button className="w-full" disabled={resume.isPending} onClick={() => resume.mutate()}>
          {t("resumeStudent")}
        </Button>
      </div>
    </Modal>
  );
}

function AddStudentModal({
  open,
  onClose,
  classes,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  classes: Class[];
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [classId, setClassId] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [markPaid, setMarkPaid] = useState(false);
  const [payMethod, setPayMethod] = useState<"cash" | "online">("cash");

  const classFee = classes.find((c) => c.id === classId)?.defaultFee;
  const payAmount = Number(monthlyFee) || Number(classFee) || 0;

  const create = useMutation({
    mutationFn: async () => {
      const student = await api<{ id: string }>("/api/students", {
        method: "POST",
        body: {
          fullName,
          phone: phone || undefined,
          classId,
          monthlyFee: monthlyFee ? Number(monthlyFee) : undefined,
          enrolledAt: startDate || undefined,
        },
      });
      // Optionally record the first month's payment in the same step.
      if (markPaid && payAmount > 0) {
        await api("/api/payments", {
          method: "POST",
          body: { studentId: student.id, amount: payAmount, method: payMethod },
        });
      }
      return student;
    },
    onSuccess: () => {
      setFullName(""); setPhone(""); setClassId(""); setMonthlyFee("");
      setStartDate(new Date().toISOString().slice(0, 10));
      setMarkPaid(false); setPayMethod("cash");
      onSaved();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={`${t("add")} — ${t("student")}`}>
      <div className="space-y-3">
        <Field label={t("fullName")}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label={t("phone")}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t("class")}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">—</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("startDate")}>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label={`${t("fee")} (${t("value")})`}>
          <Input
            type="number"
            placeholder="class default"
            value={monthlyFee}
            onChange={(e) => setMonthlyFee(e.target.value)}
          />
        </Field>

        {/* Optional: record the first month's payment right away */}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
          {t("markFirstPaid")}
        </label>
        {markPaid && (
          <div className="rounded-btn border border-border p-3">
            <div className="mb-2 text-sm text-tg-hint">
              {t("amount")}: <span className="figure font-semibold text-tg-text">{payAmount.toLocaleString()} UZS</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["cash", "online"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`btn ${payMethod === m ? "btn-primary" : "btn-ghost"}`}
                >
                  {t(m)}
                </button>
              ))}
            </div>
          </div>
        )}

        {create.isError && (
          <div className="text-sm text-status-overdue">{(create.error as Error).message}</div>
        )}
        <Button
          className="w-full"
          disabled={!fullName || !classId || create.isPending}
          onClick={() => create.mutate()}
        >
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}
