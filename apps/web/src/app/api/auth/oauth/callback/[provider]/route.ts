import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import { getServerEnv } from "@/lib/env";
import {
  AUTH_GUEST_KEY_COOKIE,
  AUTH_SESSION_COOKIE,
  AUTH_STATE_COOKIE,
  createAuthSessionCookie,
  exchangeOAuthCode,
  getAuthCookieOptions,
  getAuthSessionMaxAgeSeconds,
  getExpiredAuthCookieOptions,
  upsertOAuthUser,
  type AuthProvider,
} from "@/lib/oauth";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{
    provider: string;
  }>;
};

function parseProvider(value: string): AuthProvider | null {
  return value === "vk" || value === "yandex" ? value : null;
}

function redirectToApp(searchParams?: Record<string, string>) {
  const url = new URL("/app", getServerEnv().appBaseUrl);
  Object.entries(searchParams ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

function redirectToAuthError() {
  const response = redirectToApp({ auth: "error" });
  response.cookies.set(AUTH_STATE_COOKIE, "", getExpiredAuthCookieOptions());
  response.cookies.set(AUTH_GUEST_KEY_COOKIE, "", getExpiredAuthCookieOptions());
  return response;
}

export async function GET(request: Request, context: RouteContext) {
  const cookieStore = await cookies();

  try {
    const rate = await checkRateLimit(request, "auth");
    if (!rate.ok) {
      return getRateLimitBlockResponse(rate);
    }
    const { provider: rawProvider } = await context.params;
    const provider = parseProvider(rawProvider);
    if (!provider) {
      return redirectToAuthError();
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = cookieStore.get(AUTH_STATE_COOKIE)?.value;

    if (!code || !state || !expectedState || state !== expectedState) {
      return redirectToAuthError();
    }

    const profile = await exchangeOAuthCode(provider, code);
    const session = await upsertOAuthUser({
      profile,
      guestAppUserKey: cookieStore.get(AUTH_GUEST_KEY_COOKIE)?.value ?? null,
    });
    const response = redirectToApp({ auth: "success" });

    response.cookies.set(
      AUTH_SESSION_COOKIE,
      createAuthSessionCookie(session),
      getAuthCookieOptions(getAuthSessionMaxAgeSeconds()),
    );
    response.cookies.set(AUTH_STATE_COOKIE, "", getExpiredAuthCookieOptions());
    response.cookies.set(AUTH_GUEST_KEY_COOKIE, "", getExpiredAuthCookieOptions());

    return response;
  } catch (error) {
    logApiRouteException("oauth callback failed", error);
    return redirectToAuthError();
  }
}
