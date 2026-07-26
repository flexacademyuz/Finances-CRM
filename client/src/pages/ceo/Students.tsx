import { useState, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronRight, Search, X, SlidersHorizontal, Archive } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import type { StudentRow, Class, TeacherRow } from "../../lib/types";
import type { StudentStatus } from "@shared/schema";
import { Button, Card, Empty, Field, Input, Modal, Select, Spinner, StatusBadge } from "../../components/ui";

const STATUSES: (StudentStatus | "")[] = ["", "paid", "awaiting_payment", "overdue", "frozen", "not_due"];

/** Round, tap-to-reveal icon button used in the students toolbar. */
function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${
        active
          ? "border-primary bg-primary text-white"
          : "border-border bg-surface text-muted hover:border-primary hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

export function StudentsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  // Deep-linkable status filter (e.g. dashboard "Overdue" → /students?status=overdue).
  const qs = useSearch();
  const [view, setView] = useState<"active" | "archived">("active");
  const [status, setStatus] = useState<StudentStatus | "">(
    () => (new URLSearchParams(qs).get("status") as StudentStatus) || "",
  );
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [resuming, setResuming] = useState<StudentRow | null>(null);

  const hasFilters = !!classId || (view === "active" && !!status);

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });
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

  // Live name/phone search over the already-filtered list.
  const q = search.trim().toLowerCase();
  const filtered = (students.data ?? []).filter(
    (s) =>
      !q ||
      s.fullName.toLowerCase().includes(q) ||
      (s.phone ?? "").toLowerCase().includes(q),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("students")}</h1>
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} /> {t("add")}
        </Button>
      </div>

      {/* Icon toolbar — tap to reveal. Archive toggles the view, the magnifier
          expands into a search field, the sliders open the filters popover. */}
      <div className="flex items-center gap-2">
        <IconButton
          label={view === "archived" ? t("archived") : t("active")}
          active={view === "archived"}
          onClick={() => setView(view === "active" ? "archived" : "active")}
        >
          <Archive size={17} />
        </IconButton>

        <div className="flex flex-1 items-center justify-end gap-2">
          {searchOpen || search ? (
            <div className="relative w-full animate-fade-in sm:max-w-xs">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                autoFocus
                className="rounded-full pl-8 pr-8"
                placeholder={t("search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => { if (!search) setSearchOpen(false); }}
              />
              <button
                type="button"
                onClick={() => { setSearch(""); setSearchOpen(false); }}
                aria-label={t("clear")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-text"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <IconButton label={t("search")} onClick={() => setSearchOpen(true)}>
              <Search size={17} />
            </IconButton>
          )}

          <div className="relative shrink-0">
            <IconButton
              label={t("filters")}
              active={hasFilters || filterOpen}
              onClick={() => setFilterOpen((v) => !v)}
            >
              <SlidersHorizontal size={17} />
              {hasFilters && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-bg" />
              )}
            </IconButton>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-64 origin-top-right animate-scale-in rounded-card border border-border bg-surface p-3 shadow-card-hover">
                  <div className="space-y-2">
                    <div>
                      <span className="label">{t("classes")}</span>
                      <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                        <option value="">{t("classes")}</option>
                        {classes.data?.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </Select>
                    </div>
                    {view === "active" && (
                      <div>
                        <span className="label">{t("status")}</span>
                        <Select value={status} onChange={(e) => setStatus(e.target.value as StudentStatus | "")}>
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{s ? t(s) : t("status")}</option>
                          ))}
                        </Select>
                      </div>
                    )}
                    {hasFilters && (
                      <button
                        type="button"
                        onClick={() => { setClassId(""); setStatus(""); }}
                        className="pt-1 text-xs font-semibold text-primary hover:underline"
                      >
                        {t("clear")}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {students.isLoading ? (
        <Spinner />
      ) : filtered.length ? (
        <div className="space-y-2">
          {filtered.map((s) => (
            <Card key={s.id} className="flex items-center justify-between gap-2 p-0">
              {/* Whole row opens the profile, where the per-student actions live. */}
              <Link href={`/student/${s.id}`} className="flex min-w-0 flex-1 items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-tg-link">{s.fullName}</div>
                  <div className="truncate text-xs text-tg-hint">
                    {s.className} · {money(s.effectiveFee)}
                  </div>
                </div>
                {view !== "archived" && <StatusBadge status={s.status} />}
                <ChevronRight size={18} className="shrink-0 text-tg-hint" />
              </Link>
              {view === "archived" && (
                <div className="shrink-0 pr-3">
                  <Button variant="ghost" onClick={() => setResuming(s)}>{t("resumeStudent")}</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Empty>{view === "archived" ? t("noArchived") : undefined}</Empty>
      )}

      <AddStudentModal
        open={adding}
        onClose={() => setAdding(false)}
        classes={classes.data ?? []}
        onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["students"] }); }}
      />
      {resuming && (
        <ResumeStudentModal
          student={resuming}
          classes={classes.data ?? []}
          onClose={() => setResuming(null)}
          onSaved={() => { setResuming(null); qc.invalidateQueries({ queryKey: ["students"] }); }}
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
