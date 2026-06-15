import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import { getDashboardSummary } from "@/lib/db";
import { isDatabaseConfigured } from "@/lib/env";
import { readAuthSessionFromCookies } from "@/lib/oauth";
import { upsertUserProfile } from "@/lib/db";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const rate = await checkRateLimit(request, "dashboard");
    if (!rate.ok) {
      return getRateLimitBlockResponse(rate);
    }
    if (!isDatabaseConfigured()) {
      return NextResponse.json({
        ok: false,
        database: false,
        summary: null,
      });
    }

    const session = await readAuthSessionFromCookies();
    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          error: "Требуется вход в аккаунт.",
        },
        { status: 401 },
      );
    }

    let summary = await getDashboardSummary(session.appUserKey);
    // First login can happen before the client managed to call /api/progress/update.
    // Ensure the user exists so the dashboard does not fall back to demo state.
    if (!summary) {
      await upsertUserProfile({
        appUserKey: session.appUserKey,
        profile: {
          studentName: session.displayName ?? "",
          exam: "OGE",
          subject: "russian",
          classLabel: "9",
          goalScore: "80",
        },
        progress: {
          xp: 0,
          streak: 0,
          weeklyGoal: 7,
          completedThisWeek: 0,
        },
      });
      summary = await getDashboardSummary(session.appUserKey);
    }

    return NextResponse.json({
      ok: true,
      database: true,
      summary,
    });
  } catch (error) {
    logApiRouteException("dashboard/summary failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Не удалось получить сводку из базы данных.",
      },
      { status: 400 },
    );
  }
}
