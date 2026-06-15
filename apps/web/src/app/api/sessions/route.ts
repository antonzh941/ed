import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import { isDatabaseConfigured } from "@/lib/env";
import { readAuthSessionFromCookies } from "@/lib/oauth";
import { getPrismaClient } from "@/lib/prisma";
import { assertBrowserMutationAllowed } from "@/lib/request-security";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";
import { createSessionSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const csrf = assertBrowserMutationAllowed(request);
    if (csrf) return csrf;

    const rate = await checkRateLimit(request, "api");
    if (!rate.ok) return getRateLimitBlockResponse(rate);

    const authSession = await readAuthSessionFromCookies();
    if (!authSession) {
      return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "База данных не настроена." }, { status: 503 });
    }

    const raw = await request.json();
    const input = createSessionSchema.parse(raw);

    const db = getPrismaClient()!;

    // Проверяем, что задание существует и доступно
    const task = await db.task.findUnique({
      where: { id: input.taskId },
      select: { id: true, status: true, subjectCode: true, taskNumber: true },
    });
    if (!task || task.status === "rejected") {
      return NextResponse.json({ error: "Задание не найдено." }, { status: 404 });
    }

    const user = await db.user.findUnique({
      where: { appUserKey: authSession.appUserKey },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден." }, { status: 404 });
    }

    // Переиспользуем активную сессию для той же задачи, если есть
    const existing = await db.solvingSession.findFirst({
      where: { userId: user.id, taskId: task.id, status: "active" },
      include: { _count: { select: { attempts: true } } },
    });
    if (existing) {
      return NextResponse.json({ session: serializeSession(existing) }, { status: 200 });
    }

    const session = await db.solvingSession.create({
      data: {
        userId: user.id,
        taskId: task.id,
        phase: "understanding",
        hintLevel: 0,
        status: "active",
      },
      include: { _count: { select: { attempts: true } } },
    });

    return NextResponse.json({ session: serializeSession(session) }, { status: 201 });
  } catch (error) {
    logApiRouteException("POST /api/sessions failed", error);
    return NextResponse.json({ error: "Не удалось создать сессию." }, { status: 500 });
  }
}

// ─── serializer (local, только нужные поля) ───────────────────────────────────

function serializeSession(
  session: {
    id: string;
    taskId: string;
    phase: string;
    hintLevel: number;
    status: string;
    startedAt: Date;
    updatedAt: Date;
    _count: { attempts: number };
  },
) {
  return {
    id: session.id,
    taskId: session.taskId,
    phase: session.phase,
    hintLevel: session.hintLevel,
    status: session.status,
    attemptsCount: session._count.attempts,
    startedAt: session.startedAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
