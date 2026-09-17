import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Building2, Calculator } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import type { Branch } from "../../lib/types";
import type { PaymentGroupStatus } from "../../lib/types";
import { Button, Card, Field, Input, Modal, Spinner } from "../../components/ui";

/**
 * CEO-only branch administration: create branches, rename them, and see which
 * Telegram group each one posts its payments to. Everything else in the app is
 * scoped to a branch; users are pinned to a branch on the Users screen.
 */
export function BranchesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<Branch[]>("/api/branches") });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">{t("branches")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("branchesNote")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={18} /> {t("addBranch")}
        </Button>
      </div>


      {branches.isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          {(branches.data ?? []).map((b) => (
            <BranchCard key={b.id} branch={b} onEdit={() => setEditing(b)} />
          ))}
        </div>
      )}

      {creating && (
        <BranchModal
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); qc.invalidateQueries(); }}
        />
      )}
      {editing && (
        <BranchModal
          branch={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries(); }}
        />
      )}
    </div>
  );
}

/** One branch: name, active state, and its Telegram payment-group link status. */
function BranchCard({ branch, onEdit }: { branch: Branch; onEdit: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [recalcOpen, setRecalcOpen] = useState(false);
  const group = useQuery({
    queryKey: ["branch-group", branch.id],
    queryFn: () => api<PaymentGroupStatus>(`/api/branches/${branch.id}/payment-group`),
  });

  const unlink = useMutation({
    mutationFn: () => api(`/api/branches/${branch.id}/payment-group/unlink`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branch-group", branch.id] }),
  });

  const recalc = useMutation({
    mutationFn: () =>
      api<{ updated: number; total: number }>(`/api/branches/${branch.id}/recalculate-balances`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <Building2 size={18} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold">{branch.name}</div>
            {!branch.active && <div className="text-xs text-status-overdue">Inactive</div>}
          </div>
        </div>
        <button className="rounded-lg bg-tg-bg p-1.5 text-tg-link" title={t("renameBranch")} onClick={onEdit}>
          <Pencil size={16} />
        </button>
      </div>

      {/* Fix outstanding balances / partial labels after correcting fees. */}
      <button
        onClick={() => { recalc.reset(); setRecalcOpen(true); }}
        className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm transition hover:border-primary hover:bg-primary-soft"
      >
        <Calculator size={16} className="shrink-0 text-primary" />
        <span className="flex-1 font-medium">{t("recalcBalances")}</span>
      </button>
      {recalcOpen && (
        <Modal open onClose={() => setRecalcOpen(false)} title={`${t("recalcBalances")} — ${branch.name}`}>
          <div className="space-y-4">
            <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-tg-text">{t("recalcBalancesNote")}</p>
            {recalc.isError && (
              <div className="text-sm text-status-overdue">{(recalc.error as Error).message}</div>
            )}
            {recalc.isSuccess ? (
              <>
                <div className="text-sm font-medium text-status-paid">
                  {t("recalcDone").replace("{n}", String(recalc.data.updated))}
                </div>
                <Button className="w-full" onClick={() => setRecalcOpen(false)}>{t("save")}</Button>
              </>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setRecalcOpen(false)}>{t("cancel")}</Button>
                <Button className="flex-1" disabled={recalc.isPending} onClick={() => recalc.mutate()}>
                  {t("recalcBalances")}
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Telegram payment-notification group for this branch. */}
      <div className="rounded-lg border border-border px-3 py-2">
        <div className="text-xs font-semibold text-muted">📣 {t("paymentNotifications")}</div>
        {group.isLoading ? (
          <div className="py-1"><Spinner /></div>
        ) : group.data?.linked ? (
          <div className="mt-1 space-y-2">
            <div className="text-sm font-semibold">{group.data.title ?? `chat ${group.data.chatId}`}</div>
            {unlink.isError && (
              <div className="text-sm text-status-overdue">{(unlink.error as Error).message}</div>
            )}
            <Button
              variant="ghost"
              className="w-full text-status-overdue"
              disabled={unlink.isPending}
              onClick={() => unlink.mutate()}
            >
              {t("unlinkGroup")}
            </Button>
          </div>
        ) : (
          <div className="mt-1 space-y-1">
            <div className="text-sm text-tg-hint">{t("noBranchGroupLinked")}</div>
            <p className="rounded-lg bg-primary-soft px-3 py-2 text-xs text-tg-text">{t("linkBranchGroupHint")}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Create a new branch, or rename / (de)activate an existing one. */
function BranchModal({
  branch,
  onClose,
  onSaved,
}: {
  branch?: Branch;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const editing = !!branch;
  const [name, setName] = useState(branch?.name ?? "");
  const [active, setActive] = useState(branch?.active ?? true);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api(`/api/branches/${branch!.id}`, { method: "PATCH", body: { name, active } })
        : api("/api/branches", { method: "POST", body: { name } }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={editing ? t("renameBranch") : t("newBranch")}>
      <div className="space-y-3">
        <Field label={t("branchName")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Branch 1" />
        </Field>
        {editing && (
          <label className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>{t("active")}</span>
          </label>
        )}
        {save.isError && <div className="text-sm text-status-overdue">{(save.error as Error).message}</div>}
        <Button className="w-full" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}
