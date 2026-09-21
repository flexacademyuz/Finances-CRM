import { env } from "../env";

/**
 * Thin client for the Eskiz.uz SMS gateway (https://notify.eskiz.uz/api).
 *
 * Auth is a JWT obtained from POST /auth/login with the account email+password;
 * it lasts ~30 days. We cache it in memory and re-login on demand or on a 401,
 * so a message send is normally a single request. Nothing here throws to the
 * caller: `sendSms` always resolves to a result object, so a gateway outage can
 * never break payment recording or a cron run — it just marks the row failed.
 *
 * This module knows nothing about students or templates; it only turns a phone
 * number + text into a delivered (or failed) message. See sms/service.ts for the
 * business rules (opt-out, dedup, dry-run, cadence).
 */

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

let cachedToken: string | null = null;

/** Digits-only Uzbek MSISDN (998XXXXXXXXX), or null if it can't be normalized. */
export function normalizeUzPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  // Common local forms → full country code.
  if (d.length === 9) d = "998" + d; // 90XXXXXXX
  else if (d.length === 12 && d.startsWith("998")) {
    /* already full */
  } else if (d.length === 13 && d.startsWith("998")) {
    d = d.slice(0, 12); // stray extra digit
  } else if (d.startsWith("998") && d.length === 12) {
    /* full */
  }
  return /^998\d{9}$/.test(d) ? d : null;
}

function apiUrl(path: string): string {
  return `${env.eskizBaseUrl.replace(/\/$/, "")}${path}`;
}

/** Log in and cache a fresh token. Returns null on failure. */
async function login(): Promise<string | null> {
  if (!env.eskizEmail || !env.eskizPassword) return null;
  try {
    const body = new URLSearchParams({
      email: env.eskizEmail,
      password: env.eskizPassword,
    });
    const res = await fetch(apiUrl("/auth/login"), { method: "POST", body });
    if (!res.ok) {
      console.error(`[eskiz] login failed: HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { data?: { token?: string } };
    cachedToken = json?.data?.token ?? null;
    return cachedToken;
  } catch (err) {
    console.error("[eskiz] login error:", (err as Error).message);
    return null;
  }
}

/** The cached token, logging in first if we don't have one yet. */
async function getToken(): Promise<string | null> {
  return cachedToken ?? (await login());
}

/**
 * Send one SMS. `phone` is normalized to 998XXXXXXXXX; a bad number fails fast.
 * On a 401 the token is refreshed once and the send retried. Best-effort: any
 * error is returned as `{ ok: false }`, never thrown.
 */
export async function sendSms(phone: string, message: string): Promise<SendResult> {
  const to = normalizeUzPhone(phone);
  if (!to) return { ok: false, error: `invalid_phone:${phone}` };
  if (!env.eskizEmail || !env.eskizPassword) return { ok: false, error: "eskiz_not_configured" };

  const attempt = async (token: string): Promise<Response> => {
    const body = new URLSearchParams({
      mobile_phone: to,
      message,
      from: env.eskizSender,
    });
    return fetch(apiUrl("/message/sms/send"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
  };

  try {
    let token = await getToken();
    if (!token) return { ok: false, error: "eskiz_auth_failed" };

    let res = await attempt(token);
    if (res.status === 401) {
      // Token expired/invalid — refresh once and retry.
      cachedToken = null;
      token = await login();
      if (!token) return { ok: false, error: "eskiz_auth_failed" };
      res = await attempt(token);
    }

    const text = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };

    // Eskiz returns e.g. { id: "...", status: "waiting", message: "..." }.
    let providerMessageId: string | null = null;
    try {
      const json = JSON.parse(text) as { id?: string | number };
      if (json?.id != null) providerMessageId = String(json.id);
    } catch {
      /* non-JSON body — treat as success but with no id */
    }
    return { ok: true, providerMessageId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
