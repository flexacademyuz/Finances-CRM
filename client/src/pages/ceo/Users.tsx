import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import type { UserRow, TeacherRow } from "../../lib/types";
import type { Role, SalaryModel } from "@shared/schema";
import { PERMISSIONS, ROLE_DEFAULTS, type Permission } from "@shared/permissions";
import { Button, Card, Field, Input, Modal, Select, Spinner } from "../../components/ui";

const ROLES: Role[] = ["ceo", "accountant", "teacher"];
const MODELS: SalaryModel[] = ["percentage", "per_student", "fixed"];

/** CEO-only user & role management + teacher salary rules (spec §2, §3.4). */
export function UsersPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [salaryFor, setSalaryFor] = useState<UserRow | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [permsFor, setPermsFor] = useState<UserRow | null>(null);

  const users = useQuery({ queryKey: ["users"], queryFn: () => api<UserRow[]>("/api/users") });
  const teachers = useQuery({ queryKey: ["teachers-all"], queryFn: () => api<TeacherRow[]>("/api/teachers") });

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
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{u.fullName}</div>
                  <div className="text-xs text-tg-hint">
                    {t(u.role)} · ID {u.telegramId}
                    {u.username ? ` · @${u.username}` : ""}
                    {!u.active ? " · disabled" : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    className="rounded-lg bg-tg-bg p-1.5 text-tg-link"
                    title={t("editUser")}
                    onClick={() => setEditing(u)}
                  >
                    <Pencil size={16} />
                  </button>
                  {u.role !== "ceo" && (
                    <button
                      className="rounded-lg bg-tg-bg p-1.5 text-primary"
                      title={t("managePermissions")}
                      onClick={() => setPermsFor(u)}
                    >
                      <ShieldCheck size={16} />
                    </button>
                  )}
                </div>
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
      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries(); }}
        />
      )}
      {permsFor && (
        <PermissionsModal
          user={permsFor}
          onClose={() => setPermsFor(null)}
          onSaved={() => { setPermsFor(null); qc.invalidateQueries(); }}
        />
      )}
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

/** Edit a user's profile — fix a mistaken name, username, or role. */
function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState(user.fullName);
  const [username, setUsername] = useState(user.username ?? "");
  const [role, setRole] = useState<Role>(user.role);

  const save = useMutation({
    mutationFn: () =>
      api(`/api/users/${user.id}`, {
        method: "PATCH",
        body: { fullName, username: username.trim() || null, role },
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={`${t("editUser")} — ${user.fullName}`}>
      <div className="space-y-3">
        <Field label={t("fullName")}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label={t("username")}>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@" />
        </Field>
        <Field label={t("role")}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{t(r)}</option>
            ))}
          </Select>
        </Field>
        {save.isError && (
          <div className="text-sm text-status-overdue">{(save.error as Error).message}</div>
        )}
        <Button className="w-full" disabled={!fullName || save.isPending} onClick={() => save.mutate()}>
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Grant/revoke per-user permissions. Role defaults are always on (shown checked
 * & locked); the CEO toggles any extra abilities on top (spec: CEO decides who
 * can record payments, add groups, etc.).
 */
function PermissionsModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const defaults = new Set<Permission>(ROLE_DEFAULTS[user.role]);
  // Seed the extra (non-default) grants from what's stored on the user.
  const [granted, setGranted] = useState<Set<Permission>>(
    () => new Set(PERMISSIONS.filter((p) => !defaults.has(p) && user.permissions.includes(p))),
  );

  const toggle = (p: Permission) =>
    setGranted((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });

  const save = useMutation({
    mutationFn: () =>
      api(`/api/users/${user.id}/permissions`, {
        method: "PATCH",
        body: { permissions: Array.from(granted) },
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={`${t("permissions")} — ${user.fullName}`}>
      <div className="space-y-3">
        <p className="text-xs text-tg-hint">{t("permissionsNote")}</p>
        <div className="space-y-1.5">
          {PERMISSIONS.map((p) => {
            const locked = defaults.has(p);
            const checked = locked || granted.has(p);
            return (
              <label
                key={p}
                className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm ${
                  locked ? "opacity-60" : "cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={() => toggle(p)}
                />
                <span className="flex-1">{t(`perm_${p}`)}</span>
                {locked && <span className="text-xs text-tg-hint">{t(user.role)}</span>}
              </label>
            );
          })}
        </div>
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
