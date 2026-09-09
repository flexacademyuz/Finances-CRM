import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, X, ArrowLeftRight, Phone, GraduationCap, Clock } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { can } from "@shared/permissions";
import type { LeadRow, Class } from "../lib/types";

import { Button, Card, Empty, Field, Input, Modal, Select, Spinner } from "../components/ui";

type LeadStatus = "pending" | "approved" | "rejected";
const TABS: LeadStatus[] = ["pending", "approved", "rejected"];

/** New-student intake pipeline (feature #4): register, approve, swap, reject. */
export function LeadsPage() {
  const { t } = useI18n();
  const { user } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<LeadStatus>("pending");
  const [registering, setRegistering] = useState(false);
  const [approving, setApproving] = useState<LeadRow | null>(null);
  const [swapping, setSwapping] = useState<LeadRow | null>(null);
  const [rejecting, setRejecting] = useState<LeadRow | null>(null);

  const canRegister = can(user, "add_student");
  const canDecide = can(user, "approve_leads");

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });
  const leads = useQuery({
    queryKey: ["leads", tab],
    queryFn: () => api<LeadRow[]>("/api/leads", { query: { status: tab } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["leads"] });

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
        <div className="space-y-2">
          {leads.data.map((l) => (
            <Card key={l.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{l.fullName}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-tg-hint">
                    {l.phone && (
                      <span className="inline-flex items-center gap-1"><Phone size={12} /> {l.phone}</span>
                    )}
                    {l.gradeAtSchool && (
                      <span className="inline-flex items-center gap-1"><GraduationCap size={12} /> {l.gradeAtSchool}</span>
                    )}
                    {l.level && <span>{l.level}</span>}
                    <span className="inline-flex items-center gap-1"><Clock size={12} /> {t(l.shift)}</span>
                  </div>
                  <div className="mt-1 text-xs">
                    <span className="text-tg-hint">{t("targetGroup")}: </span>
                    <span className={l.className ? "font-medium" : "text-muted"}>
                      {l.className ?? t("unassignedGroup")}
                    </span>
                  </div>
                  {l.decisionNote && (
                    <div className="mt-1 text-xs italic text-tg-hint">“{l.decisionNote}”</div>
                  )}
                </div>
              </div>

              {l.status === "pending" && canDecide && (
                <div className="flex flex-wrap gap-2 border-t border-border pt-2">
                  <Button variant="ghost" onClick={() => setApproving(l)}>
                    <Check size={15} /> {t("approveLead")}
                  </Button>
                  <Button variant="ghost" onClick={() => setSwapping(l)}>
                    <ArrowLeftRight size={15} /> {t("swapGroup")}
                  </Button>
                  <Button variant="ghost" onClick={() => setRejecting(l)}>
                    <X size={15} /> {t("rejectLead")}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Empty>{t("noLeads")}</Empty>
      )}

      {registering && (
        <RegisterLeadModal
          classes={classes.data ?? []}
          onClose={() => setRegistering(false)}
          onSaved={() => { setRegistering(false); refresh(); }}
        />
      )}
      {approving && (
        <ApproveLeadModal
          lead={approving}
          classes={classes.data ?? []}
          onClose={() => setApproving(null)}
          onSaved={() => { setApproving(null); refresh(); }}
        />
      )}
      {swapping && (
        <SwapGroupModal
          lead={swapping}
          classes={classes.data ?? []}
          onClose={() => setSwapping(null)}
          onSaved={() => { setSwapping(null); refresh(); }}
        />
      )}
      {rejecting && (
        <RejectLeadModal
          lead={rejecting}
          onClose={() => setRejecting(null)}
          onSaved={() => { setRejecting(null); refresh(); }}
        />
      )}
    </div>
  );
}

function RegisterLeadModal({
  classes,
  onClose,
  onSaved,
}: {
  classes: Class[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [gradeAtSchool, setGradeAtSchool] = useState("");
  const [level, setLevel] = useState("");
  const [shift, setShift] = useState<"morning" | "afternoon">("morning");
  const [classId, setClassId] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api("/api/leads", {
        method: "POST",
        body: {
          fullName,
          phone: phone || undefined,
          gradeAtSchool: gradeAtSchool || undefined,
          level: level || undefined,
          shift,
          classId: classId || null,
        },
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={t("registerLead")}>
      <div className="space-y-3">
        <Field label={t("fullName")}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label={t("phone")}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("gradeAtSchool")}>
            <Input value={gradeAtSchool} onChange={(e) => setGradeAtSchool(e.target.value)} />
          </Field>
          <Field label={t("level")}>
            <Input value={level} onChange={(e) => setLevel(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("shift")}>
            <Select value={shift} onChange={(e) => setShift(e.target.value as "morning" | "afternoon")}>
              <option value="morning">{t("morning")}</option>
              <option value="afternoon">{t("afternoon")}</option>
            </Select>
          </Field>
          <Field label={t("targetGroup")}>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t("unassignedGroup")}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        {create.isError && (
          <div className="text-sm text-status-overdue">{(create.error as Error).message}</div>
        )}
        <Button className="w-full" disabled={!fullName || create.isPending} onClick={() => create.mutate()}>
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

/** Reassign a still-pending lead to a different group without approving yet. */
function SwapGroupModal({
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

  const save = useMutation({
    mutationFn: () =>
      api(`/api/leads/${lead.id}`, { method: "PATCH", body: { classId: classId || null } }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={`${t("swapGroup")} — ${lead.fullName}`}>
      <div className="space-y-3">
        <Field label={t("targetGroup")}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t("unassignedGroup")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
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
