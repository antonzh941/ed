import { NextResponse } from "next/server";

import { isDatabaseConfigured, requireStarterEntitlementForAi } from "@/lib/env";
import { userHasCyclesBalance } from "@/lib/payment-starter";

/**
 * Проверка положительного баланса советов Сократа перед AI-запросом
 * (см. REQUIRE_STARTER_ENTITLEMENT_FOR_AI).
 * Без БД проверка отключается, чтобы не ломать self-hosted сценарии.
 */
export async function getAiEntitlementBlockResponse(
  appUserKey: string | undefined,
): Promise<NextResponse | null> {
  if (!requireStarterEntitlementForAi()) {
    return null;
  }
  if (!isDatabaseConfigured()) {
    return null;
  }
  if (!appUserKey?.trim()) {
    return NextResponse.json(
      {
        error:
          "Для генерации в этом режиме нужен сохранённый профиль. Обновите страницу и зайдите в кабинет.",
      },
      { status: 403 },
    );
  }
  const allowed = await userHasCyclesBalance(appUserKey.trim());
  if (allowed) {
    return null;
  }
  return NextResponse.json(
    {
      error: "Советы закончились. Пополните баланс, чтобы продолжить обучение.",
    },
    { status: 403 },
  );
}
