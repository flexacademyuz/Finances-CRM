/**
 * Web session token storage. In a browser (outside Telegram) the app signs in
 * with username/password and keeps a bearer token here; inside Telegram, initData
 * is used instead and no token is needed.
 */
const KEY = "flex_session_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* storage unavailable — session just won't persist */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
