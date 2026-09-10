import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Check,
  X,
  ArrowLeftRight,
  Phone,
  Pencil,
  GraduationCap,
  Clock,
  BookOpen,
  UserPlus,
  Trash2,
  FolderPlus,
} from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { can } from "@shared/permissions";
import { money } from "../lib/format";
import type { LeadRow, Class, DraftClassRow, TeacherRow } from "../lib/types";

import { Button, Card, Empty, Field, Input, Modal, Select, Spinner } from "../components/ui";

type LeadStatus = "pending" | "approved" | "rejected";
const TABS: LeadStatus[] = ["pending", "approved", "rejected"];
type View = "students" | "drafts";

/**
 * New-student intake pipeline (feature #4). Two views:
 *  - Students: the lead list (pending / approved / rejected) with approve /
 *    sort / reject actions.
 *  - Draft classes: create teacherless "pre-classes", sort students into them,
 *    then assign a teacher (optionally under a new name) to make them real.
 */
export function LeadsPage() {
  const { t } = useI18n();
  const { user } = useSession();
  const qc = useQueryClient();
  const search = useSearch();
  const [view, setView] = useState<View>("students");
  const [tab, setTab] = useState<LeadStatus>("pending");
  const [registering, setRegistering] = useState(false);
  const [newDraft, setNewDraft] = useState(false);
  const [approving, setApproving] = useState<LeadRow | null>(null);
  const [sorting, setSorting] = useState<LeadRow | null>(null);
  const [rejecting, setRejecting] = useState<LeadRow | null>(null);
  const [editing, setEditing] = useState<LeadRow | null>(null);
  const [deleting, setDeleting] = useState<LeadRow | null>(null);
  const [assigning, setAssigning] = useState<DraftClassRow | null>(null);

  const canRegister = can(user, "add_student");
  const canDecide = can(user, "approve_leads");
  const canAssign = can(user, "add_group");

  // Opened from the bottom "+" quick action (/leads?register=1).
  useEffect(() => {
    if (new URLSearchParams(search).get("register") === "1") setRegistering(true);
  }, [search]);

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });
  const drafts = useQuery({
    queryKey: ["draft-classes"],
    queryFn: () => api<DraftClassRow[]>("/api/draft-classes"),
    enabled: canRegister,
  });
  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => api<TeacherRow[]>("/api/teachers"),
    enabled: canAssign,
  });
  const leads = useQuery({
    queryKey: ["leads", tab],
    queryFn: () => api<LeadRow[]>("/api/leads", { query: { status: tab } }),
    enabled: view === "students",
  });
  const pending = useQuery({
    queryKey: ["leads", "pending"],
    queryFn: () => api<LeadRow[]>("/api/leads", { query: { status: "pending" } }),
    enabled: view === "drafts",
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["draft-classes"] });
    qc.invalidateQueries({ queryKey: ["classes"] });
  };

  const del = useMutation({
    mutationFn: (id: string) => api(`/api/draft-classes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["draft-classes"] }),
  });

  const delLead = useMutation({
    mutationFn: (id: string) => api(`/api/leads/${id}`, { method: "DELETE" }),
    onSuccess: () => { setDeleting(null); refresh(); },
  });

  const unsorted = (pending.data ?? []).filter((l) => !l.classId && !l.draftClassId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("leads")}</h1>
        {canRegister && (
          <Button onClick={() => setRegistering(true)}>
            <Plus size={16} /> {t("registerLead")}
          </Button>
        )}
      </div>

      {/* View switch: the lead list vs. draft-class sorting. */}
      <div className="flex gap-1 rounded-full bg-bg p-1 ring-1 ring-border">
        {(["students", "drafts"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              view === v ? "bg-primary text-white" : "text-muted hover:text-text"
            }`}
          >
            {v === "students" ? t("studentsTab") : t("draftClasses")}
          </button>
        ))}
      </div>

      {view === "students" ? (
        <>
          {/* Status tabs */}
          <div className="flex gap-1 rounded-full bg-bg p-1 ring-1 ring-border">
            {TABS.map((s) => (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  tab === s ? "bg-primary text-white" : "text-muted hover:text-text"
                }`}
              >
                {t(s)}
              </button>
            ))}
          </div>

          {leads.isLoading ? (
            <Spinner />
          ) : leads.data && leads.data.length > 0 ? (
            // Two/three-up grid so the cards stay compact instead of stretching
            // into long full-width bars.
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {leads.data.map((l) => (
                <LeadCard
                  key={l.id}
                  lead={l}
                  onEdit={l.status === "pending" && canRegister ? () => setEditing(l) : undefined}
                  onDelete={canRegister ? () => setDeleting(l) : undefined}
                >
                  {l.status === "pending" && (canDecide || canRegister) && (
                    <div className="flex flex-wrap gap-2 border-t border-border pt-2">
                      {canDecide && (
                        <Button variant="ghost" onClick={() => setApproving(l)}>
                          <Check size={15} /> {t("approveLead")}
                        </Button>
                      )}
                      {canRegister && (
                        <Button variant="ghost" onClick={() => setSorting(l)}>
                          <ArrowLeftRight size={15} /> {t("sort")}
                        </Button>
                      )}
                      {canDecide && (
                        <Button variant="ghost" onClick={() => setRejecting(l)}>
                          <X size={15} /> {t("rejectLead")}
                        </Button>
                      )}
                    </div>
                  )}
                </LeadCard>
              ))}
            </div>
          ) : (
            <Empty>{t("noLeads")}</Empty>
          )}
        </>
      ) : (
        /* ── Draft classes view ── */
        <div className="space-y-3">
          {canRegister && (
            <Button variant="ghost" className="w-full" onClick={() => setNewDraft(true)}>
              <FolderPlus size={16} /> {t("addDraftClass")}
            </Button>
          )}

          {pending.isLoading || drafts.isLoading ? (
            <Spinner />
          ) : (
            <>
              {(drafts.data ?? []).map((d) => {
                const roster = (pending.data ?? []).filter((l) => l.draftClassId === d.id);
                return (
                  <Card key={d.id} className="space-y-3 border-dashed bg-bg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{d.name}</div>
                        <div className="text-xs text-tg-hint">
                          {d.subject ? `${d.subject} · ` : ""}
                          {roster.length} {t("studentsCount")}
                          {Number(d.defaultFee) > 0 ? ` · ${money(d.defaultFee)}` : ""}
                        </div>
                      </div>
                      <button
                        className="shrink-0 p-1 text-status-overdue"
                        aria-label={t("deleteDraft")}
                        onClick={() => del.mutate(d.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {roster.length > 0 ? (
                      /* Full interactive student cards: clickable to edit, a tel:
                         Call button, delete, plus the Sort action. */
                      <div className="grid gap-2 sm:grid-cols-2">
                        {roster.map((l) => (
                          <LeadCard
                            key={l.id}
                            lead={l}
                            onEdit={canRegister ? () => setEditing(l) : undefined}
                            onDelete={canRegister ? () => setDeleting(l) : undefined}
                          >
                            {canRegister && (
                              <div className="flex border-t border-border pt-2">
                                <Button variant="ghost" onClick={() => setSorting(l)}>
                                  <ArrowLeftRight size={15} /> {t("sort")}
                                </Button>
                              </div>
                            )}
                          </LeadCard>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg bg-surface px-3 py-2 text-xs text-tg-hint">{t("emptyDraft")}</div>
                    )}

                    {canAssign && (
                      <Button className="w-full" disabled={roster.length === 0} onClick={() => setAssigning(d)}>
                        <UserPlus size={15} /> {t("assignTeacher")}
                      </Button>
                    )}
                  </Card>
                );
              })}

              {(drafts.data ?? []).length === 0 && <Empty>{t("noDrafts")}</Empty>}

              {/* Students registered but not yet sorted into any class. */}
              {unsorted.length > 0 && (
                <Card className="space-y-2">
                  <div className="text-sm font-semibold text-muted">{t("notSorted")}</div>
                  <div className="divide-y divide-border rounded-lg bg-bg">
                    {unsorted.map((l) => (
                      <div key={l.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          {l.fullName}
                          {l.subject ? <span className="text-tg-hint"> · {l.subject}</span> : ""}
                        </span>
                        {canRegister && (
                          <button className="shrink-0 text-xs text-tg-link" onClick={() => setSorting(l)}>
                            {t("sortInto")}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {registering && (
        <RegisterLeadModal
          classes={classes.data ?? []}
          drafts={drafts.data ?? []}
          onClose={() => setRegistering(false)}
          onSaved={() => { setRegistering(false); refresh(); }}
        />
      )}
      {editing && (
        <RegisterLeadModal
          editing={editing}
          classes={classes.data ?? []}
          drafts={drafts.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title={t("deleteLead")}>
          <div className="space-y-4">
            <div className="rounded-lg bg-status-overdue/10 px-3 py-2 text-sm text-tg-text">
              {t("deleteLeadConfirm")}
            </div>
            <div className="text-sm font-medium">{deleting.fullName}</div>
            {delLead.isError && (
              <div className="text-sm text-status-overdue">{(delLead.error as Error).message}</div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setDeleting(null)}>
                {t("cancel")}
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={delLead.isPending}
                onClick={() => delLead.mutate(deleting.id)}
              >
                <Trash2 size={15} /> {t("deleteLead")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {newDraft && (
        <NewDraftModal onClose={() => setNewDraft(false)} onSaved={() => { setNewDraft(false); refresh(); }} />
      )}
      {approving && (
        <ApproveLeadModal
          lead={approving}
          classes={classes.data ?? []}
          onClose={() => setApproving(null)}
          onSaved={() => { setApproving(null); refresh(); }}
        />
      )}
      {sorting && (
        <SortModal
          lead={sorting}
          classes={classes.data ?? []}
          drafts={drafts.data ?? []}
          onClose={() => setSorting(null)}
          onSaved={() => { setSorting(null); refresh(); }}
        />
      )}
      {rejecting && (
        <RejectLeadModal
          lead={rejecting}
          onClose={() => setRejecting(null)}
          onSaved={() => { setRejecting(null); refresh(); }}
        />
      )}
      {assigning && (
        <AssignDraftModal
          draft={assigning}
          teachers={teachers.data ?? []}
          onClose={() => setAssigning(null)}
          onSaved={() => { setAssigning(null); refresh(); }}
        />
      )}
    </div>
  );
}

/** Name + details block shared by the editable and read-only card variants. */
function LeadSummary({ l, editable }: { l: LeadRow; editable?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <div className={`truncate font-semibold ${editable ? "text-tg-link" : ""}`}>{l.fullName}</div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-tg-hint">
        {l.subject && <span className="inline-flex items-center gap-1"><BookOpen size={12} /> {l.subject}</span>}
        {l.gradeAtSchool && (
          <span className="inline-flex items-center gap-1"><GraduationCap size={12} /> {l.gradeAtSchool}</span>
        )}
        {l.level && <span>{l.level}</span>}
        <span className="inline-flex items-center gap-1"><Clock size={12} /> {t(l.shift)}</span>
      </div>
      <div className="mt-1 text-xs">
        <span className="text-tg-hint">{t("targetGroup")}: </span>
        {l.className ? (
          <span className="font-medium">{l.className}</span>
        ) : l.draftClassName ? (
          <span className="font-medium">{l.draftClassName} · {t("draftClass")}</span>
        ) : (
          <span className="text-muted">{t("unassignedGroup")}</span>
        )}
      </div>
      {l.decisionNote && <div className="mt-1 text-xs italic text-tg-hint">“{l.decisionNote}”</div>}
    </div>
  );
}

/**
 * Shared lead card. When `onEdit` is set the summary is clickable (opens the
 * edit form); a `tel:` Call button opens the phone dialer on mobile; `onDelete`
 * adds a trash control. The action row (approve/sort/reject) comes as children.
 */
function LeadCard({
  lead: l,
  onEdit,
  onDelete,
  children,
}: {
  lead: LeadRow;
  onEdit?: () => void;
  onDelete?: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card className="flex h-full flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        {onEdit ? (
          <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
            <LeadSummary l={l} editable />
          </button>
        ) : (
          <div className="min-w-0 flex-1">
            <LeadSummary l={l} />
          </div>
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          {onEdit && (
            <button
              type="button"
              aria-label={t("editLead")}
              onClick={onEdit}
              className="rounded-full p-1.5 text-muted transition hover:bg-primary-soft hover:text-primary"
            >
              <Pencil size={15} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label={t("deleteLead")}
              onClick={onDelete}
              className="rounded-full p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Contact — a tel: link opens the phone's dialer on mobile (harmless on the
          website). */}
      {l.phone && (
        <a
          href={`tel:${l.phone}`}
          className="chip w-fit transition hover:text-primary hover:ring-primary/40"
        >
          <Phone size={13} /> {l.phone} · {t("call")}
        </a>
      )}

      {children}
    </Card>
  );
}

function RegisterLeadModal({
  classes,
  drafts,
  editing,
  onClose,
  onSaved,
}: {
  classes: Class[];
  drafts: DraftClassRow[];
  /** When set, the form edits this pending lead (PATCH) instead of creating. */
  editing?: LeadRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState(editing?.fullName ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [subject, setSubject] = useState(editing?.subject ?? "");
  const [gradeAtSchool, setGradeAtSchool] = useState(editing?.gradeAtSchool ?? "");
  const [level, setLevel] = useState(editing?.level ?? "");
  const [shift, setShift] = useState<"morning" | "afternoon">(editing?.shift ?? "morning");
  // Placement: "" | group:<id> | draft:<id> | __new__
  const [placement, setPlacement] = useState(
    editing?.classId ? `group:${editing.classId}` : editing?.draftClassId ? `draft:${editing.draftClassId}` : "",
  );
  const [newClassName, setNewClassName] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      let classId: string | null = null;
      let draftClassId: string | null = null;
      if (placement === "__new__") {
        const draft = await api<{ id: string }>("/api/draft-classes", {
          method: "POST",
          body: { name: newClassName, subject: subject || undefined },
        });
        draftClassId = draft.id;
      } else if (placement.startsWith("group:")) {
        classId = placement.slice(6);
      } else if (placement.startsWith("draft:")) {
        draftClassId = placement.slice(6);
      }
      // Create omits blanks (schema is optional, not nullable); edit sends null
      // so a cleared field is actually unset.
      const blank = editing ? null : undefined;
      const body = {
        fullName,
        phone: phone || blank,
        subject: subject || blank,
        gradeAtSchool: gradeAtSchool || blank,
        level: level || blank,
        shift,
        classId,
        draftClassId,
      };
      return editing
        ? api(`/api/leads/${editing.id}`, { method: "PATCH", body })
        : api("/api/leads", { method: "POST", body });
    },
    onSuccess: onSaved,
  });

  const needsName = placement === "__new__";

  return (
    <Modal open onClose={onClose} title={editing ? t("editLead") : t("registerStudent")}>
      <div className="space-y-3">
        <Field label={t("fullName")}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("phone")}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label={t("subject")}>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("gradeAtSchool")}>
            <Input value={gradeAtSchool} onChange={(e) => setGradeAtSchool(e.target.value)} />
          </Field>
          <Field label={t("level")}>
            <Input value={level} onChange={(e) => setLevel(e.target.value)} />
          </Field>
        </div>
        <Field label={t("shift")}>
          <Select value={shift} onChange={(e) => setShift(e.target.value as "morning" | "afternoon")}>
            <option value="morning">{t("morning")}</option>
            <option value="afternoon">{t("afternoon")}</option>
          </Select>
        </Field>
        <Field label={t("placement")}>
          <Select value={placement} onChange={(e) => setPlacement(e.target.value)}>
            <option value="">{t("unassignedGroup")}</option>
            {classes.length > 0 && (
              <optgroup label={t("groups")}>
                {classes.map((c) => (
                  <option key={c.id} value={`group:${c.id}`}>{c.name}</option>
                ))}
              </optgroup>
            )}
            {drafts.length > 0 && (
              <optgroup label={t("draftClasses")}>
                {drafts.map((d) => (
                  <option key={d.id} value={`draft:${d.id}`}>{d.name}</option>
                ))}
              </optgroup>
            )}
            <option value="__new__">＋ {t("newClass")}</option>
          </Select>
        </Field>
        {needsName && (
          <Field label={t("newClassName")}>
            <Input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} />
          </Field>
        )}
        {create.isError && (
          <div className="text-sm text-status-overdue">{(create.error as Error).message}</div>
        )}
        <Button
          className="w-full"
          disabled={!fullName || (needsName && !newClassName) || create.isPending}
          onClick={() => create.mutate()}
        >
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}

/** Create a new draft (teacherless) class to sort students into. */
function NewDraftModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [defaultFee, setDefaultFee] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api("/api/draft-classes", {
        method: "POST",
        body: { name, subject: subject || undefined, defaultFee: defaultFee ? Number(defaultFee) : undefined },
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={t("addDraftClass")}>
      <div className="space-y-3">
        <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-tg-text">{t("createDraftNote")}</div>
        <Field label={t("className")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("subject")}>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label={t("fee")}>
            <Input type="number" value={defaultFee} onChange={(e) => setDefaultFee(e.target.value)} placeholder="0" />
          </Field>
        </div>
        {create.isError && (
          <div className="text-sm text-status-overdue">{(create.error as Error).message}</div>
        )}
        <Button className="w-full" disabled={!name || create.isPending} onClick={() => create.mutate()}>
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}

function ApproveLeadModal({
  lead,
  classes,
  onClose,
  onSaved,
}: {
  lead: LeadRow;
  classes: Class[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [classId, setClassId] = useState(lead.classId ?? "");
  const [approvalDate, setApprovalDate] = useState(new Date().toISOString().slice(0, 10));

  const approve = useMutation({
    mutationFn: () =>
      api(`/api/leads/${lead.id}/approve`, {
        method: "POST",
        body: { classId: classId || undefined, approvalDate },
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={`${t("approveLeadTitle")} — ${lead.fullName}`}>
      <div className="space-y-3">
        <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-tg-text">{t("approveLeadNote")}</div>
        <Field label={t("targetGroup")}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t("chooseGroup")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("approvalDate")}>
          <Input type="date" value={approvalDate} onChange={(e) => setApprovalDate(e.target.value)} />
        </Field>
        {approve.isError && (
          <div className="text-sm text-status-overdue">{(approve.error as Error).message}</div>
        )}
        <Button className="w-full" disabled={!classId || approve.isPending} onClick={() => approve.mutate()}>
          {t("approveLead")}
        </Button>
      </div>
    </Modal>
  );
}

/** Sort a pending lead into a draft class or an existing group (or unassign). */
function SortModal({
  lead,
  classes,
  drafts,
  onClose,
  onSaved,
}: {
  lead: LeadRow;
  classes: Class[];
  drafts: DraftClassRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const initial = lead.classId ? `group:${lead.classId}` : lead.draftClassId ? `draft:${lead.draftClassId}` : "";
  const [placement, setPlacement] = useState(initial);

  const save = useMutation({
    mutationFn: () => {
      let classId: string | null = null;
      let draftClassId: string | null = null;
      if (placement.startsWith("group:")) classId = placement.slice(6);
      else if (placement.startsWith("draft:")) draftClassId = placement.slice(6);
      return api(`/api/leads/${lead.id}`, { method: "PATCH", body: { classId, draftClassId } });
    },
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={`${t("sortInto")} — ${lead.fullName}`}>
      <div className="space-y-3">
        <Field label={t("placement")}>
          <Select value={placement} onChange={(e) => setPlacement(e.target.value)}>
            <option value="">{t("unassignedGroup")}</option>
            {classes.length > 0 && (
              <optgroup label={t("groups")}>
                {classes.map((c) => (
                  <option key={c.id} value={`group:${c.id}`}>{c.name}</option>
                ))}
              </optgroup>
            )}
            {drafts.length > 0 && (
              <optgroup label={t("draftClasses")}>
                {drafts.map((d) => (
                  <option key={d.id} value={`draft:${d.id}`}>{d.name}</option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
        {save.isError && (
          <div className="text-sm text-status-overdue">{(save.error as Error).message}</div>
        )}
        <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}

/** Assign a teacher to a draft class (optionally renaming it) → real class. */
function AssignDraftModal({
  draft,
  teachers,
  onClose,
  onSaved,
}: {
  draft: DraftClassRow;
  teachers: TeacherRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [teacherId, setTeacherId] = useState("");
  const [name, setName] = useState(draft.name);
  const [defaultFee, setDefaultFee] = useState(Number(draft.defaultFee) > 0 ? String(draft.defaultFee) : "");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const assign = useMutation({
    mutationFn: () =>
      api(`/api/draft-classes/${draft.id}/assign-teacher`, {
        method: "POST",
        body: {
          teacherId,
          name: name.trim() || undefined,
          defaultFee: defaultFee ? Number(defaultFee) : undefined,
          startDate,
        },
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={`${t("assignTeacher")} — ${draft.name}`}>
      <div className="space-y-3">
        <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-tg-text">{t("assignTeacherNote")}</div>
        <Field label={t("className")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("teacher")}>
          <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">—</option>
            {teachers.map((x) => (
              <option key={x.id} value={x.id}>{x.fullName}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("fee")}>
            <Input type="number" value={defaultFee} onChange={(e) => setDefaultFee(e.target.value)} placeholder="0" />
          </Field>
          <Field label={t("startDate")}>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
        </div>
        {assign.isError && (
          <div className="text-sm text-status-overdue">{(assign.error as Error).message}</div>
        )}
        <Button className="w-full" disabled={!teacherId || !name.trim() || assign.isPending} onClick={() => assign.mutate()}>
          {t("assignTeacher")}
        </Button>
      </div>
    </Modal>
  );
}

function RejectLeadModal({
  lead,
  onClose,
  onSaved,
}: {
  lead: LeadRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [note, setNote] = useState("");

  const reject = useMutation({
    mutationFn: () => api(`/api/leads/${lead.id}/reject`, { method: "POST", body: { note: note || undefined } }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={`${t("rejectLead")} — ${lead.fullName}`}>
      <div className="space-y-4">
        <div className="rounded-lg bg-status-overdue/10 px-3 py-2 text-sm text-tg-text">{t("rejectLeadNote")}</div>
        <Field label={t("reason")}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {reject.isError && (
          <div className="text-sm text-status-overdue">{(reject.error as Error).message}</div>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>{t("cancel")}</Button>
          <Button className="flex-1" disabled={reject.isPending} onClick={() => reject.mutate()}>
            {t("rejectLead")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
