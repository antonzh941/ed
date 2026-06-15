import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import { getAiEntitlementBlockResponse } from "@/lib/ai-entitlement";
import { gatewayStream, type GatewayMessage } from "@/lib/ai/gateway";
import { getUserSessionId } from "@/lib/user-session-id";
import { isDatabaseConfigured, requireStarterEntitlementForAi } from "@/lib/env";
import { readAuthSessionFromCookies } from "@/lib/oauth";
import { decrementUserCycleBalance } from "@/lib/payment-starter";
import { assertBrowserMutationAllowed } from "@/lib/request-security";
import { checkAiRateLimit, getAiRateLimitBlockResponse } from "@/lib/rate-limit";
import { difyLearningRequestSchema, type DifyLearningRequest } from "@/lib/schemas";
import { getTaskBlueprintSummary } from "@/lib/task-blueprints";

const OUTPUT_GUARD = [
  "ВАЖНО:",
  "— Только кириллица, никаких <think>, тегов, латиницы вместо букв.",
  "— Никакого markdown: ни *, ни **, ни #.",
].join("\n");

const SUBJECT_LABELS: Record<DifyLearningRequest["subject"], string> = {
  russian: "русскому языку",
  math: "математике",
  geography: "географии",
  history: "истории",
};

function buildMessages(input: DifyLearningRequest): GatewayMessage[] {
  const subjectLabel = SUBJECT_LABELS[input.subject];
  const blueprint = getTaskBlueprintSummary(input.exam, input.subject, input.taskNumber);

  if (input.action === "explain_task") {
    const modeLabel =
      input.mode === "short"
        ? "кратко — только ключевые шаги"
        : input.mode === "stepByStep"
          ? "максимально пошагово, каждый шаг отдельной строкой"
          : "подробно с пояснениями";

    return [
      {
        role: "system",
        content: [
          OUTPUT_GUARD,
          "[РЕЖИМ: ОБЪЯСНЕНИЕ]",
          blueprint,
          `Объясни задание ОГЭ по ${subjectLabel}, номер ${input.taskNumber}. Стиль: ${modeLabel}.`,
          "ВАЖНО: объясняй только метод и алгоритм решения. НЕ называй итоговый ответ. Ученик должен прийти к ответу сам.",
        ].join("\n\n"),
      },
      {
        role: "user",
        content: `Задание: ${input.taskText ?? ""}`,
      },
    ];
  }

  if (input.action === "socratic_step") {
    const stepCount = input.history.filter((m) => m.role === "student").length;
    const stepInstruction =
      stepCount >= 4
        ? "Ученик уже сделал 4+ попытки. Объясни решение пошагово сам."
        : "Задай ровно ОДИН наводящий вопрос. Не давай ответ.";

    const messages: GatewayMessage[] = [
      {
        role: "system",
        content: [
          OUTPUT_GUARD,
          "[РЕЖИМ: СОКРАТ]",
          blueprint,
          `Задание ОГЭ по ${subjectLabel}, номер ${input.taskNumber}:\n${input.taskText ?? ""}`,
          stepInstruction,
        ].join("\n\n"),
      },
      // история диалога → messages
      ...input.history.map((m): GatewayMessage => ({
        role: m.role === "student" ? "user" : "assistant",
        content: m.text,
      })),
      // текущее сообщение ученика
      {
        role: "user",
        content: input.studentMessage ?? "",
      },
    ];
    return messages;
  }

  // generate_task (default)
  return [
    {
      role: "system",
      content: [
        OUTPUT_GUARD,
        "[РЕЖИМ: ГЕНЕРАЦИЯ]",
        blueprint,
        "Строго соблюдай формат ФИПИ: тип задания, структуру условия, формат ответа.",
        "Выдай только текст задания и варианты ответа. НЕ пиши ответ, НЕ пиши подсказку, НЕ пиши 'С чего начать'.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: `Сгенерируй ОДНО задание ОГЭ по ${subjectLabel}, номер ${input.taskNumber}.`,
    },
  ];
}

/** Оборачивает ReadableStream<string> в SSE-формат, совместимый с клиентом. */
function toSseResponse(textStream: ReadableStream<string>): Response {
  const encoder = new TextEncoder();
  const sseStream = new ReadableStream({
    async start(controller) {
      const reader = textStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const event = JSON.stringify({ event: "text_chunk", data: { text: value } });
          controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        }
      } catch (err) {
        // Пробрасываем ошибку провайдера как SSE-событие, чтобы клиент мог её обработать
        const msg = err instanceof Error ? err.message : "Ошибка AI-провайдера";
        console.error("[gateway stream error]", err);
        const errEvent = JSON.stringify({ event: "error", message: msg });
        controller.enqueue(encoder.encode(`data: ${errEvent}\n\n`));
      } finally {
        controller.close();
      }
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

export async function POST(request: Request) {
  try {
    const csrf = assertBrowserMutationAllowed(request);
    if (csrf) return csrf;

    const rate = await checkAiRateLimit(request);
    if (!rate.ok) return getAiRateLimitBlockResponse(rate);

    const raw = await request.json();
    const input = difyLearningRequestSchema.parse(raw);

    const session = await readAuthSessionFromCookies();
    if (!session) {
      return NextResponse.json(
        { error: "Для ИИ-наставника войдите через VK ID или Яндекс." },
        { status: 401 },
      );
    }

    const block = await getAiEntitlementBlockResponse(session.appUserKey);
    if (block) return block;

    const role = input.action === "explain_task" ? "explainer" : "tutor";
    const sessionId = getUserSessionId(session.appUserKey);

    const stream = await gatewayStream({
      role,
      messages: buildMessages(input),
      sessionId,
      subject: input.subject,
      taskNumber: input.taskNumber,
    });

    const appUserKey = session.appUserKey;
    if (requireStarterEntitlementForAi() && isDatabaseConfigured() && appUserKey) {
      const consumption = await decrementUserCycleBalance(appUserKey);
      if (!consumption.consumed) {
        return NextResponse.json(
          { error: "Советы закончились. Пополните баланс, чтобы продолжить обучение." },
          { status: 403 },
        );
      }
    }

    return toSseResponse(stream);
  } catch (error) {
    logApiRouteException("generate-task failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Не удалось выполнить запрос к ИИ.",
      },
      { status: 502 },
    );
  }
}
