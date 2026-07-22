import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import type { UserRow, TeacherRow } from "../../lib/types";
import type { Role, SalaryModel } from "@shared/schema";
import { Button, Card, Field, Input, Modal, Select, Spinner } from "../../components/ui";

const ROLES: Role[] = ["ceo", "accountant", "teacher"];
const MODELS: SalaryModel[] = ["percentage", "per_student", "fixed"];

/** CEO-only user & role management + teacher salary rules (spec §2, §3.4). */
export function UsersPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [salaryFor, setSalaryFor] = useState<UserRow | null>(null);

  const users = useQuery({ queryKey: ["users"], queryFn: () => api<UserRow[]>("/api/users") });
  const teachers = useQuery({ queryKey: ["teachers-all"], queryFn: () => api<TeacherRow[]>("/api/teachers") });

  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      api(`/api/users/${id}/role`, { method: "PATCH", body: { role } }),
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("users")}</h1>
        <Button onClick={() => setInviting(true)}>
          <Plus size={18} /> {t("invite")}
        </Button>
      </div>

      {users.isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          {users.data?.map((u) => (
            <Card key={u.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{u.fullName}</div>
                  <div className="text-xs text-tg-hint">
                    ID {u.telegramId}
                    {u.username ? ` · @${u.username}` : ""}
                    {!u.active ? " · disabled" : ""}
                  </div>
                </div>
                <Select
                  className="w-32"
                  value={u.role}
                  onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value as Role })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </div>
              {u.role === "teacher" && (
                <button className="text-sm text-tg-link" onClick={() => setSalaryFor(u)}>
                  {t("salaryModel")} →
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      <InviteModal
        open={inviting}
        onClose={() => setInviting(false)}
        onSaved={() => { setInviting(false); qc.invalidateQueries(); }}
      />
      {salaryFor && (
        <SalaryRuleModal
          user={salaryFor}
          teacher={teachers.data?.find((x) => x.userId === salaryFor.id)}
          onClose={() => setSalaryFor(null)}
          onSaved={() => { setSalaryFor(null); qc.invalidateQueries(); }}
        />
      )}
    </div>
  );
}

function InviteModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [telegramId, setTelegramId] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("teacher");

  const create = useMutation({
    mutationFn: () =>
      api("/api/users", { method: "POST", body: { telegramId: Number(telegramId), fullName, role } }),
    onSuccess: () => { setTelegramId(""); setFullName(""); setRole("teacher"); onSaved(); },
  });

  return (
    <Modal open={open} onClose={onClose} title={t("invite")}>
      <div className="space-y-3">
        <Field label={t("telegramId")}>
          <Input type="number" value={telegramId} onChange={(e) => setTelegramId(e.target.value)} />
        </Field>
        <Field label={t("fullName")}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label={t("role")}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </Field>
        {create.isError && (
          <div className="text-sm text-status-overdue">{(create.error as Error).message}</div>
        )}
        <Button
          className="w-full"
          disabled={!telegramId || !fullName || create.isPending}
          onClick={() => create.mutate()}
        >
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}

function SalaryRuleModal({
  user,
  teacher,
  onClose,
  onSaved,
}: {
  user: UserRow;
  teacher?: TeacherRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [salaryModel, setSalaryModel] = useState<SalaryModel>(teacher?.salaryModel ?? "percentage");
  const [salaryValue, setSalaryValue] = useState(teacher?.salaryValue ?? "0");

  const save = useMutation({
    mutationFn: () =>
      api(`/api/users/${user.id}/salary-rule`, {
        method: "PATCH",
        body: { salaryModel, salaryValue: Number(salaryValue) },
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={`${t("salaryModel")} — ${user.fullName}`}>
      <div className="space-y-3">
        <Field label={t("salaryModel")}>
          <Select value={salaryModel} onChange={(e) => setSalaryModel(e.target.value as SalaryModel)}>
            {MODELS.map((m) => (
              <option key={m} value={m}>{t(m)}</option>
            ))}
          </Select>
        </Field>
        <Field label={salaryModel === "percentage" ? "%" : t("value")}>
          <Input type="number" value={salaryValue} onChange={(e) => setSalaryValue(e.target.value)} />
        </Field>
        <p className="text-xs text-tg-hint">
          {salaryModel === "percentage" && `${salaryValue}% of collected tuition.`}
          {salaryModel === "per_student" && `${money(Number(salaryValue))} per paid student.`}
          {salaryModel === "fixed" && `${money(Number(salaryValue))} fixed per month.`}
        </p>
        <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}
