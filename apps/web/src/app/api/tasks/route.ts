import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import { isDatabaseConfigured } from "@/lib/env";
import { readAuthSessionFromCookies } from "@/lib/oauth";
import { getPrismaClient } from "@/lib/prisma";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";
import { taskQuerySchema } from "@/lib/schemas";
import { serializeTask } from "@/lib/task-serializer";

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const query = taskQuerySchema.parse(Object.fromEntries(searchParams));

    const db = getPrismaClient()!;

    const where = {
      status: "approved" as const,
      ...(query.subject ? { subjectCode: query.subject } : {}),
      ...(query.taskNumber ? { taskNumber: query.taskNumber } : {}),
      ...(query.topicId ? { topicId: query.topicId } : {}),
    };

    if (query.random) {
      // Случайная выборка: получаем ID всех подходящих, берём случайный
      const ids = await db.task.findMany({ where, select: { id: true } });
      if (ids.length === 0) {
        return NextResponse.json({ tasks: [], total: 0 });
      }
      const randomId = ids[Math.floor(Math.random() * ids.length)].id;
      const task = await db.task.findUnique({
        where: { id: randomId },
        include: { topic: true },
      });
      return NextResponse.json({ tasks: task ? [serializeTask(task)] : [], total: 1 });
    }

    const [tasks, total] = await Promise.all([
      db.task.findMany({
        where,
        include: { topic: true },
        orderBy: [{ subjectCode: "asc" }, { taskNumber: "asc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      db.task.count({ where }),
    ]);

    return NextResponse.json({
      tasks: tasks.map(serializeTask),
      total,
      page: query.page,
      limit: query.limit,
      pages: Math.ceil(total / query.limit),
    });
  } catch (error) {
    logApiRouteException("GET /api/tasks failed", error);
    return NextResponse.json({ error: "Не удалось получить задания." }, { status: 500 });
  }
}
