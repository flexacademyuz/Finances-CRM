import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { User, Branch } from "@shared/schema";
import { getSelectedBranch, setSelectedBranch } from "./branch";

export type Me = { user: User; teacherId: string | null; branches: Branch[] };

const SessionContext = createContext<Me | null>(null);

export function useSession(): Me {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside provider");
  return ctx;
}

/* ─────────────────────────── Branch selection ──────────────────────── */

type BranchState = {
  /** Every branch (for the switcher and labels). */
  branches: Branch[];
  /** The branch this user is pinned to, or null for all-branches access. */
  pinnedBranchId: string | null;
  /** True when the user may switch branches (all-branches access). */
  canSwitch: boolean;
  /** The active branch id, or null for the "All branches" view. */
  selectedBranchId: string | null;
  /** Switch the active branch (all-branches users only). */
  setBranch: (id: string | null) => void;
};

const BranchContext = createContext<BranchState | null>(null);

export function useBranch(): BranchState {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch outside provider");
  return ctx;
}

/** Look up a branch's name by id (falls back to "All branches" / the id). */
export function useBranchName(id: string | null | undefined): string {
  const { branches } = useBranch();
  if (!id) return "All branches";
  return branches.find((b) => b.id === id)?.name ?? "—";
}

export function BranchProvider({ me, children }: { me: Me; children: ReactNode }) {
  const qc = useQueryClient();
  const pinnedBranchId = me.user.branchId ?? null;
  const canSwitch = pinnedBranchId == null;

  // A pinned user is always locked to their branch. An all-branches user keeps
  // their last choice (persisted), defaulting to the "All branches" view.
  const initial = canSwitch ? getSelectedBranch() : pinnedBranchId;
  const [selectedBranchId, setSelected] = useState<string | null>(initial);

  // Keep the header in sync from the first render (a pinned user never wrote it).
  if (getSelectedBranch() !== (canSwitch ? selectedBranchId : pinnedBranchId)) {
    setSelectedBranch(canSwitch ? selectedBranchId : pinnedBranchId);
  }

  const setBranch = (id: string | null) => {
    if (!canSwitch) return;
    setSelectedBranch(id);
    setSelected(id);
    // Every list/report is branch-scoped, so refetch everything on a switch.
    qc.invalidateQueries();
  };

  return (
    <BranchContext.Provider
      value={{ branches: me.branches, pinnedBranchId, canSwitch, selectedBranchId, setBranch }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function SessionProvider({
  children,
  renderGate,
  renderLoading,
}: {
  children: (me: Me) => ReactNode;
  renderGate: (err: ApiError) => ReactNode;
  renderLoading: () => ReactNode;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/api/me"),
    retry: false,
  });

  if (isLoading) return <>{renderLoading()}</>;
  if (error || !data) return <>{renderGate(error as ApiError)}</>;
  return <SessionContext.Provider value={data}>{children(data)}</SessionContext.Provider>;
}
