import crypto from "node:crypto";

import { NextResponse } from "next/server";

import {
  AUTH_GUEST_KEY_COOKIE,
  AUTH_STATE_COOKIE,
  getAuthCookieOptions,
  getVkIdClientId,
  getVkIdRedirectUri,
} from "@/lib/oauth";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";

function createState() {
  // 32 bytes -> 43 base64url chars (>= 32 required by VKID docs)
  return crypto.randomBytes(32).toString("base64url");
}

function isValidState(value: string) {
  // VKID requirement: random string, min 32 chars.
  // Keep it permissive but ensure it’s not trivially short.
  return value.length >= 32 && value.length <= 256;
}
export async function GET(request: Request) {
  const rate = await checkRateLimit(request, "auth");
  if (!rate.ok) {
    return getRateLimitBlockResponse(rate);
  }
  const url = new URL(request.url);
  const candidateState = url.searchParams.get("state")?.trim() ?? "";
  const state = candidateState && isValidState(candidateState) ? candidateState : createState();
  const guestAppUserKey = url.searchParams.get("guestAppUserKey")?.trim();
  const response = NextResponse.json({
    appId: Number(getVkIdClientId()),
    redirectUrl: getVkIdRedirectUri(),
    state,
  });

  response.cookies.set(AUTH_STATE_COOKIE, state, getAuthCookieOptions(60 * 10));
  if (guestAppUserKey) {
    response.cookies.set(AUTH_GUEST_KEY_COOKIE, guestAppUserKey, getAuthCookieOptions(60 * 10));
  }

  return response;
}
