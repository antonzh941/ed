import crypto from "node:crypto";

import { getServerEnv } from "@/lib/env";

/**
 * Стабильный псевдоним пользователя для внешних систем (Langfuse, трейсинг).
 * Один и тот же appUserKey всегда даёт один и тот же идентификатор.
 * PII (email, имя, реальный userId) никогда не передаётся наружу.
 */
export function getUserSessionId(appUserKey: string): string {
  const secret = getServerEnv().authCookieSecret.trim();

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_COOKIE_SECRET must be set in production (required for user pseudonymisation).",
    );
  }

  const salt = secret || "dev-only-pseudonym-salt-not-for-production";
  const digest = crypto.createHmac("sha256", salt).update(appUserKey.trim()).digest("hex");
  return `u_${digest.slice(0, 40)}`;
}
