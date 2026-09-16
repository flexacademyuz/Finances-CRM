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
  /** Every branch (for labels). */
  branches: Branch[];
  /** Only the branches this user may access (empty = all branches). */
  allowedBranches: Branch[];
  /** True when the user has full (all-branches) access. */
  fullAccess: boolean;
  /** True when there's more than one branch to switch between. */
  canSwitch: boolean;
  /** The active branch id, or null for the "All branches" view (full access). */
  selectedBranchId: string | null;
  /** Switch the active branch. Null = "All branches" (full-access users only). */
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
  const accessIds = me.user.branchIds ?? [];
  const fullAccess = accessIds.length === 0;
  const allowedBranches = fullAccess
    ? me.branches
    : me.branches.filter((b) => accessIds.includes(b.id));

  // Resolve the initial active branch:
  //  - full access: last persisted choice, else the "All branches" view (null).
  //  - restricted: last choice if it's still one of theirs, else their first.
  const resolveAllowed = (id: string | null): string | null => {
    if (fullAccess) return id; // null = all, or any specific branch
    if (id && accessIds.includes(id)) return id;
    return allowedBranches[0]?.id ?? null;
  };
  const [selectedBranchId, setSelected] = useState<string | null>(() =>
    resolveAllowed(getSelectedBranch()),
  );

  // Keep the header (sent on every request) in sync from the first render.
  if (getSelectedBranch() !== selectedBranchId) setSelectedBranch(selectedBranchId);

  const canSwitch = allowedBranches.length > 1;

  const setBranch = (id: string | null) => {
    const next = resolveAllowed(id);
    setSelectedBranch(next);
    setSelected(next);
    // Every list/report is branch-scoped, so refetch everything on a switch.
    qc.invalidateQueries();
  };

  return (
    <BranchContext.Provider
      value={{ branches: me.branches, allowedBranches, fullAccess, canSwitch, selectedBranchId, setBranch }}
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
