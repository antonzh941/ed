import crypto from "node:crypto";

export function verifyTelegramInitData(initData: string, botToken: string) {
  if (!initData || !botToken) {
    return false;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return false;
  }

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  return signature === hash;
}

export function parseTelegramUser(initData: string) {
  const params = new URLSearchParams(initData);
  const rawUser = params.get("user");

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  } catch {
    return null;
  }
}
