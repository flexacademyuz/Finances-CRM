import crypto from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type VerifiedInitData = {
  user: TelegramUser;
  authDate: number;
  raw: string;
};

/**
 * Verify Telegram Mini App `initData` per the official algorithm:
 *
 *   secret_key      = HMAC_SHA256(key="WebAppData", data=bot_token)
 *   expected_hash   = HMAC_SHA256(key=secret_key, data=data_check_string)
 *   data_check_string = "\n"-joined, key-sorted "key=value" pairs (minus hash)
 *
 * Returns the parsed user on success, or throws with a reason.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
): VerifiedInitData {
  if (!initData) throw new Error("Empty initData");
  if (!botToken) throw new Error("Server missing TELEGRAM_BOT_TOKEN");

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("initData missing hash");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(expectedHash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("initData hash mismatch");
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate) throw new Error("initData missing auth_date");
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > maxAgeSeconds) throw new Error("initData expired");

  const userJson = params.get("user");
  if (!userJson) throw new Error("initData missing user");
  const user = JSON.parse(userJson) as TelegramUser;
  if (!user?.id) throw new Error("initData user missing id");

  return { user, authDate, raw: initData };
}

export function telegramDisplayName(u: TelegramUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || `User ${u.id}`;
}
