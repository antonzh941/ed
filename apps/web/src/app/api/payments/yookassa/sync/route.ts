import { NextResponse } from "next/server";
import { z } from "zod";

import { logApiRouteException } from "@/lib/api-route-log";
import { isYooKassaConfigured } from "@/lib/env";
import { readAuthSessionFromCookies } from "@/lib/oauth";
import { assertBrowserMutationAllowed } from "@/lib/request-security";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";
import { applyCyclesPurchaseFromPayment } from "@/lib/payment-starter";
import { getYooKassaPayment, getYooKassaPaymentMetadataAppUserKey } from "@/lib/yookassa";

const syncBodySchema = z.object({
  paymentId: z.string().min(10).max(80),
});

/**
 * Синхронное подтверждение оплаты после return_url (когда webhook ещё не пришёл
 * или не настроен). Платёж должен быть создан в этом аккаунте (metadata в ЮKassa).
 */
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
    if (!isYooKassaConfigured()) {
      return NextResponse.json({ error: "ЮKassa не настроена." }, { status: 400 });
    }

    const session = await readAuthSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: "Требуется вход в аккаунт." }, { status: 401 });
    }

    const raw = await request.json().catch(() => ({}));
    const { paymentId } = syncBodySchema.parse(raw);
    const payment = await getYooKassaPayment(paymentId);
    const ownerKey = getYooKassaPaymentMetadataAppUserKey(payment);
    if (!ownerKey || ownerKey !== session.appUserKey) {
      return NextResponse.json({ error: "Платёж не найден." }, { status: 404 });
    }

    const result = await applyCyclesPurchaseFromPayment(payment, {
      expectedAppUserKey: session.appUserKey,
    });

    if (result.status === "skipped" && result.reason === "payment_owner_mismatch") {
      return NextResponse.json({ error: "Платёж не найден." }, { status: 404 });
    }

    if (result.status === "skipped" && result.reason === "not_succeeded") {
      return NextResponse.json(
        { ok: false, applied: false, reason: "not_succeeded" },
        { status: 400 },
      );
    }
    if (result.status === "skipped" && result.reason === "no_app_user_key") {
      return NextResponse.json(
        { ok: false, applied: false, reason: "no_app_user_key" },
        { status: 400 },
      );
    }
    if (result.status === "skipped") {
      return NextResponse.json(
        { ok: false, applied: false, reason: result.reason },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      applied: result.status === "applied",
      already: result.status === "already_recorded",
    });
  } catch (error) {
    logApiRouteException("payments/yookassa/sync failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Синхронизация не удалась.",
      },
      { status: 400 },
    );
  }
}
