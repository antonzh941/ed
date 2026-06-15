import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import { getServerEnv } from "@/lib/env";
import { assertBrowserMutationAllowed } from "@/lib/request-security";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";
import { parseTelegramUser, verifyTelegramInitData } from "@/lib/telegram-auth";

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
    const body = (await request.json()) as { initData?: string };
    const initData = body.initData ?? "";
    const env = getServerEnv();

    if (!env.telegramBotToken) {
      return NextResponse.json({
        ok: false,
        mode: "development",
        message:
          "TELEGRAM_BOT_TOKEN пока не задан. Можно продолжать локальную разработку.",
      });
    }

    const isValid = verifyTelegramInitData(initData, env.telegramBotToken);

    if (!isValid) {
      return NextResponse.json(
        {
          ok: false,
          message: "Подпись Telegram initData не прошла проверку.",
        },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      user: parseTelegramUser(initData),
    });
  } catch (error) {
    logApiRouteException("telegram auth failed", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Не удалось проверить Telegram initData.",
      },
      { status: 400 },
    );
  }
}
