import { NextResponse } from "next/server";
import { z } from "zod";

import { logApiRouteException } from "@/lib/api-route-log";
import { isYooKassaConfigured } from "@/lib/env";
import { applyCyclesPurchaseFromPayment } from "@/lib/payment-starter";
import { getYooKassaPayment } from "@/lib/yookassa";
import { verifyYooKassaWebhookRequest } from "@/lib/yookassa-webhook-security";

const notificationSchema = z.object({
  type: z.string().optional(),
  event: z.string().optional(),
  object: z
    .object({
      id: z.string().min(1),
    })
    .optional(),
});

/**
 * HTTP-уведомления ЮKassa: в production обязательны `?token=` (длинный секрет),
 * IP из списка ЮKassa и опционально Basic Auth (`YOOKASSA_WEBHOOK_BASIC_*`).
 * Пример URL: `https://example.com/api/payments/yookassa/webhook?token=<secret>`.
 * После приёма нужно ответить 200 — иначе ЮKassa повторит доставку.
 */
export async function POST(request: Request) {
  try {
    const verification = verifyYooKassaWebhookRequest(request);
    if (!verification.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("yookassa webhook rejected", verification.reason);
      } else {
        console.warn("yookassa webhook rejected");
      }
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    if (!isYooKassaConfigured()) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const raw = (await request.json().catch(() => null)) as unknown;
    const parsed = notificationSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const { event, object } = parsed.data;
    if (event === "payment.succeeded" && object?.id) {
      const payment = await getYooKassaPayment(object.id);
      const result = await applyCyclesPurchaseFromPayment(payment);
      if (result.status === "skipped" && result.reason === "not_succeeded") {
        if (process.env.NODE_ENV !== "production") {
          console.warn("yookassa webhook: payment not succeeded on fetch");
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiRouteException("payments/yookassa/webhook failed", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
