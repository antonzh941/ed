import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import {
  AUTH_GUEST_KEY_COOKIE,
  AUTH_STATE_COOKIE,
  getAuthCookieOptions,
  getOAuthAuthorizationUrl,
  type AuthProvider,
} from "@/lib/oauth";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";

function parseProvider(value: string | null): AuthProvider | null {
  return value === "vk" || value === "yandex" ? value : null;
}

export async function GET(request: Request) {
  try {
    const rate = await checkRateLimit(request, "auth");
    if (!rate.ok) {
      return getRateLimitBlockResponse(rate);
    }
    const url = new URL(request.url);
    const provider = parseProvider(url.searchParams.get("provider"));
    if (!provider) {
      return NextResponse.json({ error: "Неизвестный провайдер входа." }, { status: 400 });
    }

    const state = crypto.randomUUID();
    const authUrl = getOAuthAuthorizationUrl({ provider, state });
    const response = NextResponse.redirect(authUrl);
    const guestAppUserKey = url.searchParams.get("guestAppUserKey")?.trim();

    response.cookies.set(AUTH_STATE_COOKIE, state, getAuthCookieOptions(60 * 10));
    if (guestAppUserKey) {
      response.cookies.set(AUTH_GUEST_KEY_COOKIE, guestAppUserKey, getAuthCookieOptions(60 * 10));
    }

    return response;
  } catch (error) {
    logApiRouteException("oauth start failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось начать вход.",
      },
      { status: 400 },
    );
  }
}
