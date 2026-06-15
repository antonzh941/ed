import { NextResponse } from "next/server";
import { z } from "zod";

import { logApiRouteException } from "@/lib/api-route-log";
import { getYooKassaReturnUrl, isDatabaseConfigured, isYooKassaConfigured } from "@/lib/env";
import { readAuthSessionFromCookies } from "@/lib/oauth";
import { findCycleTariff } from "@/lib/payment-plans";
import { assertBrowserMutationAllowed } from "@/lib/request-security";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";
import { applyFreeCycleTariff } from "@/lib/payment-starter";
import { getPrismaClient } from "@/lib/prisma";
import { createYooKassaPayment } from "@/lib/yookassa";

const createPaymentSchema = z.object({
  /** Не передаётся в ЮKassa; только для необязательного отображаемого имени при бесплатном тест-драйве. */
  studentName: z.string().max(120).optional(),
  tariffId: z.string().max(64).optional(),
  amountRub: z.number().int().nonnegative().optional(),
  cyclesCount: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  try {
    const csrf = assertBrowserMutationAllowed(request);
    if (csrf) {
      return csrf;
    }
    const rate = await checkRateLimit(request, "payments");
    if (!rate.ok) {
      return getRateLimitBlockResponse(rate);
    }
    const raw = await request.json().catch(() => ({}));
    const input = createPaymentSchema.parse(raw);
    const tariff = findCycleTariff({
      tariffId: input.tariffId,
      amountRub: input.amountRub,
      cyclesCount: input.cyclesCount,
    });

    if (!tariff) {
      return NextResponse.json(
        {
          error: "Неизвестный пакет советов Сократа.",
        },
        { status: 400 },
      );
    }

    const session = await readAuthSessionFromCookies();

    if (!session) {
      return NextResponse.json(
        {
          error: "Для покупки пакета войдите через VK ID или Яндекс.",
        },
        { status: 401 },
      );
    }

    if (tariff.amountRub === 0) {
      const result = await applyFreeCycleTariff({
        appUserKey: session.appUserKey,
        studentName: input.studentName?.trim() || undefined,
        tariff,
      });

      if (result.status === "skipped") {
        return NextResponse.json(
          {
            error: "Не удалось начислить тест-драйв. Проверьте подключение базы данных.",
          },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        paymentId: result.paymentId,
        confirmationUrl: null,
        status: "succeeded",
        applied: result.status === "applied",
        already: result.status === "already_recorded",
        tariff,
      });
    }

    if (!isYooKassaConfigured()) {
      return NextResponse.json(
        {
          error: "ЮKassa пока не настроена. Добавьте shop ID и secret key в переменные окружения.",
        },
        { status: 400 },
      );
    }

    let internalUserId: string | null = null;
    if (isDatabaseConfigured()) {
      const prisma = getPrismaClient();
      if (prisma) {
        const row = await prisma.user.findUnique({
          where: { appUserKey: session.appUserKey },
          select: { id: true },
        });
        internalUserId = row?.id ?? null;
      }
    }

    const payment = await createYooKassaPayment({
      amountRub: tariff.amountRub,
      returnUrl: getYooKassaReturnUrl(),
      tariffId: tariff.id,
      tariffTitle: tariff.title,
      cyclesCount: tariff.cyclesCount,
      appUserKey: session.appUserKey,
      internalUserId,
    });

    return NextResponse.json({
      ok: true,
      paymentId: payment.id,
      confirmationUrl: payment.confirmation?.confirmation_url ?? null,
      status: payment.status,
      tariff,
    });
  } catch (error) {
    logApiRouteException("payments/yookassa/create failed", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось создать платёж через ЮKassa.",
      },
      { status: 400 },
    );
  }
}
