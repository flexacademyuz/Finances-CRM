import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * Minimal HMAC-signed session tokens (HS256, JWT-shaped: payload.signature) for
 * browser logins outside Telegram — no external dependency. The payload carries
 * the user id and an expiry; the signature is verified in constant time.
 */
function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", env.sessionSecret).update(payload).digest());
}

/** Issue a token for a user, valid for `ttlDays` (default from env). */
export function signToken(userId: string, ttlDays = env.sessionTtlDays): string {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const payload = b64url(JSON.stringify({ uid: userId, exp }));
  return `${payload}.${sign(payload)}`;
}

/** Verify a token; returns the user id if valid and unexpired, else null. */
export function verifyToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (typeof data.uid !== "string" || typeof data.exp !== "number") return null;
    if (data.exp * 1000 < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}
