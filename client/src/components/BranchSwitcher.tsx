import { Building2 } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { useBranch } from "../lib/session";

/**
 * Branch scope control (shared by the sidebar and the timetable):
 *  - Full-access users get a dropdown incl. an "All branches" overview.
 *  - Users granted several branches get a dropdown limited to theirs (one at a
 *    time — no cross-company overview).
 *  - Users granted exactly one branch see a static chip naming it.
 * Hidden when there's nothing to switch and nothing worth labelling.
 */
export function BranchSwitcher({ className }: { className?: string }) {
  const { t } = useI18n();
  const { branches, allowedBranches, fullAccess, canSwitch, selectedBranchId, setBranch } = useBranch();
  const selectCls =
    className ??
    "max-w-[9rem] truncate rounded-btn bg-bg px-2 py-1 text-xs font-semibold ring-1 ring-border";

  if (fullAccess) {
    if (branches.length <= 1) return null; // nothing to switch between
    return (
      <select
        aria-label={t("branch")}
        className={selectCls}
        value={selectedBranchId ?? "all"}
        onChange={(e) => setBranch(e.target.value === "all" ? null : e.target.value)}
      >
        <option value="all">{t("allBranches")}</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    );
  }

  // Restricted to a set of branches.
  if (canSwitch) {
    return (
      <select
        aria-label={t("branch")}
        className={selectCls}
        value={selectedBranchId ?? allowedBranches[0]?.id}
        onChange={(e) => setBranch(e.target.value)}
      >
        {allowedBranches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    );
  }

  // Exactly one branch → static chip.
  const name = allowedBranches[0]?.name;
  if (!name) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-btn bg-primary-soft px-2 py-1 text-xs font-semibold text-primary">
      <Building2 size={13} />
      <span className="max-w-[8rem] truncate">{name}</span>
    </span>
  );
}
