/**
 * CEO "view as user". While set, every API request carries an
 * `X-Impersonate-User` header and the server answers as that user (CEO-only,
 * enforced server-side). The CEO's own branch choice is stashed so it can be
 * restored when they stop.
 */
import { getSelectedBranch, setSelectedBranch } from "./branch";

const KEY = "impersonateUserId";
const BRANCH_KEY = "impersonateSavedBranch";

export function getImpersonatedUserId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Start viewing the app as `userId`, then reload into their home screen. */
export function startImpersonating(userId: string): void {
  try {
    localStorage.setItem(BRANCH_KEY, getSelectedBranch() ?? "");
    localStorage.setItem(KEY, userId);
  } catch {
    return; // storage unavailable — impersonation can't persist across requests
  }
  setSelectedBranch(null);
  window.location.href = "/";
}

/** Drop impersonation state without navigating (e.g. on logout). */
export function clearImpersonation(): void {
  try {
    const saved = localStorage.getItem(BRANCH_KEY);
    localStorage.removeItem(KEY);
    localStorage.removeItem(BRANCH_KEY);
    setSelectedBranch(saved || null);
  } catch {
    /* ignore */
  }
}

/** Return to the CEO's own session. */
export function stopImpersonating(): void {
  clearImpersonation();
  window.location.href = "/users";
}
