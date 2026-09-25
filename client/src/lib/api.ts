import { getInitData } from "./telegram";
import { getToken } from "./auth";
import { getSelectedBranch } from "./branch";
import { getImpersonatedUserId, stopImpersonating } from "./impersonation";

/**
 * Choose the auth header: Telegram initData when running inside Telegram, else a
 * web session bearer token (browser login). Empty string when neither exists.
 */
function authHeader(): string {
  const initData = getInitData();
  if (initData) return `tma ${initData}`;
  const token = getToken();
  return token ? `Bearer ${token}` : "";
}

/** CEO "view as user" header, when impersonating. */
function impersonationHeader(): Record<string, string> {
  const id = getImpersonatedUserId();
  return id ? { "X-Impersonate-User": id } : {};
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Fetch wrapper that attaches the Telegram initData as the Authorization
 * header (`tma <initData>`) so the server can verify the caller on every
 * request (spec §7).
 */
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }

  const branch = getSelectedBranch();
  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      ...(branch ? { "X-Branch-Id": branch } : {}),
      ...impersonationHeader(),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let code = "error";
    let message = res.statusText;
    try {
      const data = await res.json();
      code = data.error ?? code;
      message = data.message ?? message;
    } catch {
      /* non-JSON error */
    }
    // The impersonated user was disabled/removed: drop back to the CEO session.
    if (code === "impersonation_invalid") {
      stopImpersonating();
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json() as Promise<T>;
  return res.text() as unknown as T;
}

/** Trigger a browser download of a CSV endpoint (carries the auth header). */
export async function downloadCsv(path: string, filename: string, query?: Record<string, string | undefined>) {
  const url = new URL(path, window.location.origin);
  if (query) for (const [k, v] of Object.entries(query)) if (v) url.searchParams.set(k, v);
  const branch = getSelectedBranch();
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: authHeader(),
      ...(branch ? { "X-Branch-Id": branch } : {}),
      ...impersonationHeader(),
    },
  });
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
