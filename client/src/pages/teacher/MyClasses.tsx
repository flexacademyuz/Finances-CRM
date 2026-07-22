import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import type { Class, StudentRow } from "../../lib/types";
import { Button, Card, Empty, Field, Input, Modal, Spinner, StatusBadge } from "../../components/ui";

/** Teacher's own classes with per-class rosters (spec §3.1, teacher scope). */
export function MyClasses() {
  const { t } = useI18n();
  const [openClass, setOpenClass] = useState<string | null>(null);
  const [addTo, setAddTo] = useState<Class | null>(null);
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("myClasses")}</h1>

      {classes.isLoading ? (
        <Spinner />
      ) : classes.data?.length ? (
        <div className="space-y-2">
          {classes.data.map((c) => (
            <Card key={c.id} className="space-y-2">
              <button
                className="flex w-full items-center justify-between"
                onClick={() => setOpenClass(openClass === c.id ? null : c.id)}
              >
                <div className="text-left">
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-tg-hint">{money(c.defaultFee)}{c.schedule ? ` · ${c.schedule}` : ""}</div>
                </div>
                {openClass === c.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>

              {openClass === c.id && (
                <div className="space-y-2 border-t border-tg-hint/10 pt-2">
                  <Roster classId={c.id} />
                  <Button variant="ghost" className="w-full" onClick={() => setAddTo(c)}>
                    <Plus size={16} /> {t("add")} {t("student")}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Empty />
      )}

      {addTo && <AddStudentModal cls={addTo} onClose={() => setAddTo(null)} />}
    </div>
  );
}

function Roster({ classId }: { classId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const students = useQuery({
    queryKey: ["students", classId],
    queryFn: () => api<StudentRow[]>("/api/students", { query: { classId, activeOnly: "1" } }),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api(`/api/students/${id}/archive`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students", classId] }),
  });

  if (students.isLoading) return <Spinner />;
  if (!students.data?.length) return <Empty />;

  return (
    <div className="space-y-1.5">
      {students.data.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-lg bg-tg-bg px-3 py-2">
          <div>
            <div className="text-sm font-medium">{s.fullName}</div>
            {s.phone && <div className="text-xs text-tg-hint">{s.phone}</div>}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={s.status} />
            <button className="text-xs text-tg-hint" onClick={() => archive.mutate(s.id)}>
              {t("cancel")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AddStudentModal({ cls, onClose }: { cls: Class; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api("/api/students", {
        method: "POST",
        body: { fullName, phone: phone || undefined, classId: cls.id },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["students", cls.id] }); onClose(); },
  });

  return (
    <Modal open onClose={onClose} title={`${t("add")} — ${cls.name}`}>
      <div className="space-y-3">
        <Field label={t("fullName")}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label={t("phone")}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
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
