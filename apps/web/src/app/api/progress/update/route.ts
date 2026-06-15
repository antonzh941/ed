import { NextResponse } from "next/server";

import { logApiRouteException } from "@/lib/api-route-log";
import {
  createStudySession,
  upsertUserProfile,
  updateStudySession,
} from "@/lib/db";
import { isDatabaseConfigured } from "@/lib/env";
import { readAuthSessionFromCookies } from "@/lib/oauth";
import { progressUpdateSchema } from "@/lib/schemas";
import { assertBrowserMutationAllowed } from "@/lib/request-security";
import { checkRateLimit, getRateLimitBlockResponse } from "@/lib/rate-limit";

function buildStudySessionLabel(taskNumber: string) {
  return `Задание № ${taskNumber}`;
}

export async function POST(request: Request) {
  try {
    const csrf = assertBrowserMutationAllowed(request);
    if (csrf) {
      return csrf;
    }
    const rate = await checkRateLimit(request, "progress");
    if (!rate.ok) {
      return getRateLimitBlockResponse(rate);
    }
    const raw = await request.json();
    const input = progressUpdateSchema.parse(raw);

    if (!isDatabaseConfigured()) {
      return NextResponse.json({
        ok: false,
        database: false,
        message: "DATABASE_URL пока не настроен.",
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

    const user = await upsertUserProfile({
      appUserKey: session.appUserKey,
      telegramUserId: input.telegramUserId,
      profile: input.profile,
      progress: input.progress,
    });

    let studySessionId = input.studySession?.sessionId ?? null;

    if (input.studySession?.taskText && !studySessionId) {
      const created = await createStudySession({
        userId: user.id,
        exam: input.profile.exam,
        subject: input.profile.subject,
        taskNumber: input.studySession.taskNumber,
        topic: input.studySession.topic ?? buildStudySessionLabel(input.studySession.taskNumber),
        taskText: input.studySession.taskText,
        difyConversationId: input.studySession.difyConversationId,
      });
      studySessionId = created.id;
    }

    if (
      studySessionId &&
      (input.studySession?.explanation ||
        input.studySession?.difyConversationId ||
        input.studySession?.appendMessages)
    ) {
      const updated = await updateStudySession({
        sessionId: studySessionId,
        userId: user.id,
        explanation: input.studySession?.explanation,
        difyConversationId: input.studySession?.difyConversationId,
        appendMessages: input.studySession?.appendMessages,
      });
      if (!updated) {
        return NextResponse.json(
          {
            ok: false,
            error: "Сессия занятий не найдена или принадлежит другому пользователю.",
          },
          { status: 403 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      database: true,
      studySessionId,
    });
  } catch (error) {
    logApiRouteException("progress/update failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Не удалось сохранить прогресс в базу данных.",
      },
      { status: 400 },
    );
  }
}
