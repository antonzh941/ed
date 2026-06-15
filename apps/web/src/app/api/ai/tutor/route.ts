import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import { getAiEntitlementBlockResponse } from "@/lib/ai-entitlement";
import { gatewayGenerate } from "@/lib/ai/gateway";
import { startTrace } from "@/lib/ai/gateway/tracing";
import {
  detectJailbreak,
  filterTutorResponse,
  buildTutorMessages,
  isAnswerCorrect,
  isBreakdownMode,
  incrementHint,
  advancePhaseOnSuccess,
} from "@/lib/ai/tutor";
import { getUserSessionId } from "@/lib/user-session-id";
import { isDatabaseConfigured } from "@/lib/env";
import { readAuthSessionFromCookies } from "@/lib/oauth";
import { getPrismaClient } from "@/lib/prisma";
import { assertBrowserMutationAllowed } from "@/lib/request-security";
import { checkAiRateLimit, getAiRateLimitBlockResponse } from "@/lib/rate-limit";
import { tutorRequestSchema } from "@/lib/schemas";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Отдаёт текст как SSE-поток text_chunk, совместимый с клиентом. */
function textToSseResponse(text: string): Response {
  const encoder = new TextEncoder();
  const chunks = text.match(/.{1,80}/g) ?? [text]; // имитируем стриминг кусками
  const sseStream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const event = JSON.stringify({ event: "text_chunk", data: { text: chunk } });
        controller.enqueue(encoder.encode(`data: ${event}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

// ─── POST /api/ai/tutor ───────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const csrf = assertBrowserMutationAllowed(request);
    if (csrf) return csrf;

    const rate = await checkAiRateLimit(request);
    if (!rate.ok) return getAiRateLimitBlockResponse(rate);

    const raw = await request.json();
    const input = tutorRequestSchema.parse(raw);

    const authSession = await readAuthSessionFromCookies();
    if (!authSession) {
      return NextResponse.json(
        { error: "Для ИИ-наставника войдите через VK ID или Яндекс." },
        { status: 401 },
      );
    }

    const block = await getAiEntitlementBlockResponse(authSession.appUserKey);
    if (block) return block;

    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "База данных не настроена." }, { status: 503 });
    }

    const db = getPrismaClient()!;
    const sessionId = getUserSessionId(authSession.appUserKey);

    // ── Загружаем задание ───────────────────────────────────────────────────
    const task = await db.task.findUnique({ where: { id: input.taskId } });
    if (!task) {
      return NextResponse.json({ error: "Задание не найдено." }, { status: 404 });
    }

    // ── Загружаем или создаём сессию решения ────────────────────────────────
    let session = input.sessionId
      ? await db.solvingSession.findUnique({
          where: { id: input.sessionId },
          include: { _count: { select: { attempts: true } } },
        })
      : null;

    if (!session) {
      // Ищем активную сессию пользователя для этого задания
      const user = await db.user.findUnique({
        where: { appUserKey: authSession.appUserKey },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json({ error: "Пользователь не найден." }, { status: 404 });
      }

      session = await db.solvingSession.create({
        data: {
          userId: user.id,
          taskId: task.id,
          phase: "understanding",
          hintLevel: 0,
          status: "active",
        },
        include: { _count: { select: { attempts: true } } },
      });
    }

    const currentPhase = session.phase;
    const currentHintLevel = session.hintLevel;

    // ── Джейлбрейк-проверка ─────────────────────────────────────────────────
    if (detectJailbreak(input.studentMessage)) {
      const trace = await startTrace({
        role: "tutor",
        model: "filter",
        provider: "primary",
        sessionId,
        subject: task.subjectCode,
        taskNumber: String(task.taskNumber),
      });
      // Логируем в Langfuse с тегом jailbreak-attempt
      trace.setError(new Error("jailbreak-attempt"));
      await trace.flush();
    }

    // ── Проверяем — отвечает ли ученик (для создания Attempt) ───────────────
    const isAnswerAttempt =
      currentPhase === "check" ||
      (currentPhase === "steps" && input.studentMessage.length < 50);

    let newHintLevel = currentHintLevel;
    let newPhase = currentPhase;

    if (isAnswerAttempt && task.answerType === "short" && task.canonicalAnswer) {
      const correct = isAnswerCorrect(
        input.studentMessage,
        task.canonicalAnswer,
        task.acceptedAnswers,
      );

      await db.attempt.create({
        data: {
          sessionId: session.id,
          answerRaw: input.studentMessage,
          isCorrect: correct,
        },
      });

      if (correct) {
        newPhase = advancePhaseOnSuccess(currentPhase);
        if (newPhase === "reflect") {
          await db.solvingSession.update({
            where: { id: session.id },
            data: { phase: "reflect", status: "completed", updatedAt: new Date() },
          });
        } else {
          await db.solvingSession.update({
            where: { id: session.id },
            data: { phase: newPhase, updatedAt: new Date() },
          });
        }
      } else {
        newHintLevel = incrementHint(currentHintLevel);
        await db.solvingSession.update({
          where: { id: session.id },
          data: {
            hintLevel: newHintLevel,
            phase: isBreakdownMode(newHintLevel) ? "steps" : currentPhase,
            updatedAt: new Date(),
          },
        });
      }
    }

    // ── Генерируем ответ тьютора ─────────────────────────────────────────────
    const messages = buildTutorMessages({
      taskCondition: task.conditionMd,
      canonicalAnswer: task.canonicalAnswer,
      phase: newPhase,
      hintLevel: newHintLevel,
      history: input.history,
      studentMessage: input.studentMessage,
    });

    const { text } = await gatewayGenerate({
      role: "tutor",
      messages,
      sessionId,
      subject: task.subjectCode,
      taskNumber: String(task.taskNumber),
    });

    // ── Выходной фильтр утечки эталона ──────────────────────────────────────
    const { safeReplacement } = await filterTutorResponse({
      responseText: text,
      canonicalAnswer: task.canonicalAnswer,
      answerType: task.answerType,
      sessionId,
    });

    // ── Возвращаем SSE ───────────────────────────────────────────────────────
    return textToSseResponse(safeReplacement);
  } catch (error) {
    logApiRouteException("tutor-route failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Не удалось обработать запрос тьютора.",
      },
      { status: 502 },
    );
  }
}
