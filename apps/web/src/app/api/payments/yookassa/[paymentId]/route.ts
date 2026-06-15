import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import { isYooKassaConfigured } from "@/lib/env";
import { readAuthSessionFromCookies } from "@/lib/oauth";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";
import {
  getYooKassaPayment,
  getYooKassaPaymentMetadataAppUserKey,
  toYooKassaPaymentPublic,
} from "@/lib/yookassa";

type RouteContext = {
  params: Promise<{
    paymentId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const rate = await checkRateLimit(request, "payments");
    if (!rate.ok) {
      return getRateLimitBlockResponse(rate);
    }
    if (!isYooKassaConfigured()) {
      return NextResponse.json(
        {
          error: "ЮKassa пока не настроена.",
        },
        { status: 400 },
      );
    }

    const session = await readAuthSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: "Требуется вход в аккаунт." }, { status: 401 });
    }

    const { paymentId } = await context.params;
    const payment = await getYooKassaPayment(paymentId);
    const ownerKey = getYooKassaPaymentMetadataAppUserKey(payment);
    if (!ownerKey || ownerKey !== session.appUserKey) {
      return NextResponse.json({ error: "Платёж не найден." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      payment: toYooKassaPaymentPublic(payment),
    });
  } catch (error) {
    logApiRouteException("payments/yookassa/[paymentId] failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось получить статус платежа из ЮKassa.",
      },
      { status: 400 },
    );
  }
}
