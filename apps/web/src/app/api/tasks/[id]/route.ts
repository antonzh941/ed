import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import { isDatabaseConfigured } from "@/lib/env";
import { readAuthSessionFromCookies } from "@/lib/oauth";
import { getPrismaClient } from "@/lib/prisma";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";
import { serializeTask } from "@/lib/task-serializer";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rate = await checkRateLimit(request, "api");
    if (!rate.ok) return getRateLimitBlockResponse(rate);

    const session = await readAuthSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "База данных не настроена." }, { status: 503 });
    }

    const { id } = await params;
    const db = getPrismaClient()!;

    const task = await db.task.findUnique({
      where: { id },
      include: { topic: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Задание не найдено." }, { status: 404 });
    }

    // Не отдаём задания в статусе rejected/pending обычным пользователям
    if (task.status === "rejected" || task.status === "pending") {
      return NextResponse.json({ error: "Задание недоступно." }, { status: 404 });
    }

    return NextResponse.json({ task: serializeTask(task) });
  } catch (error) {
    logApiRouteException("GET /api/tasks/[id] failed", error);
    return NextResponse.json({ error: "Не удалось получить задание." }, { status: 500 });
  }
}
