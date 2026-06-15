import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";

function trustedOrigins(): string[] {
  const env = getServerEnv();
  const out = new Set<string>();
  try {
    out.add(new URL(env.appBaseUrl).origin);
  } catch {
    /* ignore */
  }
  const raw = process.env.TRUSTED_ORIGINS?.trim();
  if (raw) {
    for (const part of raw.split(",")) {
      const s = part.trim();
      if (!s) {
        continue;
      }
      try {
        out.add(new URL(s).origin);
      } catch {
        /* ignore */
      }
    }
  }
  return [...out];
}

export function isMutatingHttpMethod(method: string) {
  const m = method.toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

/**
 * Защита cookie-сессии от подделки межсайтовыми POST: ожидаем Origin/Referer
 * с доверенного хоста или Sec-Fetch-Site: same-origin (современные браузеры).
 * Webhook-и и сервер-сервер вызывайте без этой проверки.
 */
export function assertBrowserMutationAllowed(request: Request): NextResponse | null {
  if (!isMutatingHttpMethod(request.method)) {
    return null;
  }

  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  const origins = trustedOrigins();
  if (origins.length === 0) {
    return NextResponse.json({ error: "Сервер не настроен (APP_BASE_URL)." }, { status: 500 });
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin") {
    return null;
  }

  const origin = request.headers.get("origin");
  if (origin && origins.includes(origin)) {
    return null;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (origins.includes(new URL(referer).origin)) {
        return null;
      }
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ error: "Запрос отклонён (проверка источника)." }, { status: 403 });
}
