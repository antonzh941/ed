import { NextResponse } from "next/server";
import { z } from "zod";

import { logApiRouteException } from "@/lib/api-route-log";
import { isDatabaseConfigured } from "@/lib/env";
import {
  AUTH_SESSION_COOKIE,
  getExpiredAuthCookieOptions,
  readAuthSessionFromCookies,
} from "@/lib/oauth";
import { getPrismaClient } from "@/lib/prisma";
import { assertBrowserMutationAllowed } from "@/lib/request-security";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";

const bodySchema = z.object({
  confirm: z.literal("DELETE_ACCOUNT_DATA"),
});

/**
 * Удаление учётной записи и связанных данных по запросу субъекта (152-ФЗ).
 * Сессия сбрасывается в любом случае после успешного ответа.
 */
export async function POST(request: Request) {
  try {
    const csrf = assertBrowserMutationAllowed(request);
    if (csrf) {
      return csrf;
    }
    const rate = await checkRateLimit(request, "auth");
    if (!rate.ok) {
      return getRateLimitBlockResponse(rate);
    }
    const session = await readAuthSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: "Войдите в аккаунт, чтобы удалить данные." }, { status: 401 });
    }

    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Подтвердите удаление: в теле запроса укажите {\"confirm\":\"DELETE_ACCOUNT_DATA\"}.",
        },
        { status: 400 },
      );
    }

    if (isDatabaseConfigured()) {
      const prisma = getPrismaClient();
      if (prisma) {
        await prisma.user.deleteMany({
          where: { appUserKey: session.appUserKey },
        });
      }
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_SESSION_COOKIE, "", getExpiredAuthCookieOptions());
    return response;
  } catch (error) {
    logApiRouteException("auth/delete-account failed", error);
    return NextResponse.json(
      { error: "Не удалось удалить данные. Попробуйте позже или напишите в поддержку." },
      { status: 500 },
    );
  }
}
