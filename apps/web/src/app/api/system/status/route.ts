import { NextResponse } from "next/server";

import { getDatabaseHealth } from "@/lib/db";
import {
  getMissingServerEnv,
  isAiEnabled,
  isDatabaseConfigured,
  isYooKassaConfigured,
} from "@/lib/env";
import { getRagStats } from "@/lib/rag";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";

function shouldExposeStatusDebug() {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return process.env.EXPOSE_STATUS_DEBUG !== "0" && process.env.EXPOSE_STATUS_DEBUG !== "false";
}

export async function GET(request: Request) {
  const rate = await checkRateLimit(request, "status");
  if (!rate.ok) {
    return getRateLimitBlockResponse(rate);
  }

  if (process.env.NODE_ENV === "production") {
    const database = isDatabaseConfigured()
      ? await getDatabaseHealth()
      : {
          connected: false,
          error: null,
          provider: "postgresql",
        };
    return NextResponse.json({
      aiEnabled: isAiEnabled(),
      databaseEnabled: isDatabaseConfigured(),
      paymentsEnabled: isYooKassaConfigured(),
      database: {
        connected: database.connected,
        error: null,
        provider: database.provider,
      },
    });
  }

  const ragStats = await getRagStats();
  const database = isDatabaseConfigured()
    ? await getDatabaseHealth()
    : {
        connected: false,
        error: null,
        provider: "postgresql",
      };

  return NextResponse.json({
    aiEnabled: isAiEnabled(),
    databaseEnabled: isDatabaseConfigured(),
    paymentsEnabled: isYooKassaConfigured(),
    database: shouldExposeStatusDebug()
      ? database
      : {
          connected: database.connected,
          error: null,
          provider: database.provider,
        },
    payments: {
      provider: "yookassa",
      tariffLabel: "Пакеты советов Сократа",
      amountRub: 259,
    },
    ...(shouldExposeStatusDebug() ? { missingEnv: getMissingServerEnv() } : {}),
    rag: ragStats,
  });
}
