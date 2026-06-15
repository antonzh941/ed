import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  AUTH_SESSION_COOKIE,
  authSessionToPublic,
  getExpiredAuthCookieOptions,
  parseAuthSessionCookie,
} from "@/lib/oauth";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const rate = await checkRateLimit(request, "auth");
  if (!rate.ok) {
    return getRateLimitBlockResponse(rate);
  }

  const cookieStore = await cookies();
  const rawSessionCookie = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const session = parseAuthSessionCookie(rawSessionCookie);
  const response = NextResponse.json({
    ok: true,
    authenticated: Boolean(session),
    session: session ? authSessionToPublic(session) : null,
  });

  if (rawSessionCookie && !session) {
    response.cookies.set(AUTH_SESSION_COOKIE, "", getExpiredAuthCookieOptions());
  }

  return response;
}
