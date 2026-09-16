/**
 * The branch an all-branches user (CEO / cross-branch staff) is currently
 * viewing, sent to the server as the `X-Branch-Id` header on every request. Null
 * means "All branches" (no filter). Pinned users are locked server-side to their
 * own branch regardless of this value, so it's harmless to always send it.
 *
 * Kept in a module variable (read synchronously by the api() wrapper) mirrored to
 * localStorage so the choice survives reloads.
 */
const KEY = "selectedBranchId";

let current: string | null = readInitial();

function readInitial(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The selected branch id, or null for "All branches". */
export function getSelectedBranch(): string | null {
  return current;
}

/** Set (or clear, with null) the selected branch and persist it. */
export function setSelectedBranch(id: string | null): void {
  current = id;
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode) — the module var still holds it */
  }
}
