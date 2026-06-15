import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import { isDatabaseConfigured } from "@/lib/env";
import { readAuthSessionFromCookies } from "@/lib/oauth";
import { getPrismaClient } from "@/lib/prisma";
import { assertBrowserMutationAllowed } from "@/lib/request-security";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";
import { patchSessionSchema } from "@/lib/schemas";
import { serializeTask } from "@/lib/task-serializer";

// ─── helpers ──────────────────────────────────────────────────────────────────

function serializeSession(session: {
  id: string;
  taskId: string;
  phase: string;
  hintLevel: number;
  status: string;
  startedAt: Date;
  updatedAt: Date;
  task: Parameters<typeof serializeTask>[0];
  _count: { attempts: number };
  attempts: Array<{
    id: string;
    answerRaw: string;
    isCorrect: boolean | null;
    score: number | null;
    feedback: string | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: session.id,
    taskId: session.taskId,
    phase: session.phase,
    hintLevel: session.hintLevel,
    status: session.status,
    attemptsCount: session._count.attempts,
    startedAt: session.startedAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    task: serializeTask(session.task),
    attempts: session.attempts.map((a) => ({
      id: a.id,
      answerRaw: a.answerRaw,
      isCorrect: a.isCorrect,
      score: a.score,
      feedback: a.feedback,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

async function resolveUserId(appUserKey: string) {
  const db = getPrismaClient()!;
  const user = await db.user.findUnique({
    where: { appUserKey },
    select: { id: true },
  });
  return user?.id ?? null;
}

// ─── GET /api/sessions/[id] ───────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rate = await checkRateLimit(request, "api");
    if (!rate.ok) return getRateLimitBlockResponse(rate);

    const authSession = await readAuthSessionFromCookies();
    if (!authSession) {
      return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "База данных не настроена." }, { status: 503 });
    }

    const { id } = await params;
    const db = getPrismaClient()!;
    const userId = await resolveUserId(authSession.appUserKey);
    if (!userId) {
      return NextResponse.json({ error: "Пользователь не найден." }, { status: 404 });
    }

    const session = await db.solvingSession.findUnique({
      where: { id },
      include: {
        task: { include: { topic: true } },
        _count: { select: { attempts: true } },
        attempts: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            answerRaw: true,
            isCorrect: true,
            score: true,
            feedback: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Сессия не найдена." }, { status: 404 });
    }
    if (session.userId !== userId) {
      return NextResponse.json({ error: "Доступ запрещён." }, { status: 403 });
    }

    return NextResponse.json({ session: serializeSession(session) });
  } catch (error) {
    logApiRouteException("GET /api/sessions/[id] failed", error);
    return NextResponse.json({ error: "Не удалось получить сессию." }, { status: 500 });
  }
}

// ─── PATCH /api/sessions/[id] ─────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id } = await params;
    const raw = await request.json();
    const input = patchSessionSchema.parse(raw);

    const db = getPrismaClient()!;
    const userId = await resolveUserId(authSession.appUserKey);
    if (!userId) {
      return NextResponse.json({ error: "Пользователь не найден." }, { status: 404 });
    }

    const session = await db.solvingSession.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });

    if (!session) {
      return NextResponse.json({ error: "Сессия не найдена." }, { status: 404 });
    }
    if (session.userId !== userId) {
      return NextResponse.json({ error: "Доступ запрещён." }, { status: 403 });
    }
    if (session.status !== "active") {
      return NextResponse.json(
        { error: "Сессия уже завершена или прервана." },
        { status: 409 },
      );
    }

    const updated = await db.solvingSession.update({
      where: { id },
      data: { status: input.status, updatedAt: new Date() },
      select: { id: true, status: true, updatedAt: true },
    });

    return NextResponse.json({
      session: {
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logApiRouteException("PATCH /api/sessions/[id] failed", error);
    return NextResponse.json({ error: "Не удалось обновить сессию." }, { status: 500 });
  }
}
