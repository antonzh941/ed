import { NextResponse } from "next/server";

import { AUTH_SESSION_COOKIE, getExpiredAuthCookieOptions } from "@/lib/oauth";
import { assertBrowserMutationAllowed } from "@/lib/request-security";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const csrf = assertBrowserMutationAllowed(request);
  if (csrf) {
    return csrf;
  }
  const rate = await checkRateLimit(request, "auth");
  if (!rate.ok) {
    return getRateLimitBlockResponse(rate);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_SESSION_COOKIE, "", getExpiredAuthCookieOptions());

  return response;
}
