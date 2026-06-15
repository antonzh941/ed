import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import {
  AUTH_GUEST_KEY_COOKIE,
  AUTH_SESSION_COOKIE,
  AUTH_STATE_COOKIE,
  authSessionToPublic,
  createAuthSessionCookie,
  exchangeVkIdCode,
  getAuthCookieOptions,
  getAuthSessionMaxAgeSeconds,
  getExpiredAuthCookieOptions,
  upsertOAuthUser,
} from "@/lib/oauth";
import { assertBrowserMutationAllowed } from "@/lib/request-security";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";

type VkIdCallbackBody = {
  code?: string;
  deviceId?: string;
  codeVerifier?: string;
  state?: string;
};

export async function POST(request: Request) {
  const cookieStore = await cookies();

  try {
    const csrf = assertBrowserMutationAllowed(request);
    if (csrf) {
      return csrf;
    }
    const rate = await checkRateLimit(request, "auth");
    if (!rate.ok) {
      return getRateLimitBlockResponse(rate);
    }
    const body = (await request.json()) as VkIdCallbackBody;
    const expectedState = cookieStore.get(AUTH_STATE_COOKIE)?.value;
    if (
      !body.code ||
      !body.deviceId ||
      !body.codeVerifier ||
      !body.state ||
      !expectedState ||
      body.state !== expectedState
    ) {
      return NextResponse.json({ error: "Некорректный ответ VK ID." }, { status: 400 });
    }

    const profile = await exchangeVkIdCode({
      code: body.code,
      deviceId: body.deviceId,
      codeVerifier: body.codeVerifier,
      state: body.state,
    });
    const session = await upsertOAuthUser({
      profile,
      guestAppUserKey: cookieStore.get(AUTH_GUEST_KEY_COOKIE)?.value ?? null,
    });
    const response = NextResponse.json({ ok: true, session: authSessionToPublic(session) });

    response.cookies.set(
      AUTH_SESSION_COOKIE,
      createAuthSessionCookie(session),
      getAuthCookieOptions(getAuthSessionMaxAgeSeconds()),
    );
    response.cookies.set(AUTH_STATE_COOKIE, "", getExpiredAuthCookieOptions());
    response.cookies.set(AUTH_GUEST_KEY_COOKIE, "", getExpiredAuthCookieOptions());

    return response;
  } catch (error) {
    logApiRouteException("vk id callback failed", error);
    const response = NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось войти через VK ID.",
      },
      { status: 400 },
    );
    response.cookies.set(AUTH_STATE_COOKIE, "", getExpiredAuthCookieOptions());
    response.cookies.set(AUTH_GUEST_KEY_COOKIE, "", getExpiredAuthCookieOptions());
    return response;
  }
}
