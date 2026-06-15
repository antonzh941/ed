"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  authenticateTelegram,
  explainTask,
  fetchAuthSession,
  fetchDashboardSummary,
  fetchSystemStatus,
  generateTask,
  isDifyStaleUploadConversationError,
  logoutAuthSession,
  requestSocraticStep,
  syncProgressToApi,
} from "@/lib/learning/api";
import {
  buildProgressSnapshot,
  explanationModeOptions,
  formatDashboardDate,
  subjectLabels,
  subjectOptions,
} from "@/lib/learning/config";
import type {
  AuthSessionPublic,
  ChatMessage,
  DashboardSummary,
  ProgressSnapshot,
  SystemStatus,
  TelegramAuthState,
} from "@/lib/learning/contracts";
import { getTaskBlueprint, getTaskOptions } from "@/lib/task-blueprints";
import { useLearningStore } from "@/stores/learning-store";
import { useTelegramMiniApp } from "@/components/telegram-miniapp";

type AiAction = "generate" | "explain" | "chat";

type AiWaitState = {
  action: AiAction;
  startedAt: number;
  elapsedSeconds: number;
  hasFirstChunk: boolean;
};

const aiWaitCopy: Record<
  AiAction,
  { title: string; waiting: string[]; streaming: string; slow: string }
> = {
  generate: {
    title: "Готовлю задание",
    waiting: [
      "Подбираю формат под выбранный номер.",
      "Проверяю, чтобы задание было похоже на ОГЭ.",
      "Собираю условие без лишней подсказки к ответу.",
    ],
    streaming: "Задание уже появляется, можно читать первые строки.",
    slow: "Dify отвечает чуть дольше обычного, но запрос продолжает выполняться.",
  },
  explain: {
    title: "Готовлю разбор",
    waiting: [
      "Выделяю главный шаг решения.",
      "Раскладываю объяснение в спокойном темпе.",
      "Проверяю, чтобы разбор был понятен без лишних терминов.",
    ],
    streaming: "Разбор уже идет, текст будет дополняться по мере ответа.",
    slow: "Ответ занимает больше времени, но разбор уже готовится.",
  },
  chat: {
    title: "Наставник думает над следующим шагом",
    waiting: [
      "Смотрю на ваш ответ и историю решения.",
      "Подбираю вопрос, который поможет продвинуться дальше.",
      "Формулирую подсказку без готового ответа.",
    ],
    streaming: "Наставник уже отвечает.",
    slow: "Наставник задержался чуть дольше обычного, но диалог продолжается.",
  },
};

export function useLearningAppController() {
  const telegramMiniApp = useTelegramMiniApp();
  const {
    hasHydrated,
    appUserKey,
    telegramUserId,
    studySessionId,
    activeView,
    profile,
    progress,
    lesson,
    setActiveView,
    ensureAppUserKey,
    hydrateFromLegacyStorage,
    setTelegramIdentity,
    updateProfile,
    setSubject,
    setProgress,
    setLessonPatch,
    startGeneratedSession,
    setExplanation,
    setStudySessionId,
    focusTask,
    openRecentSession,
  } = useLearningStore();

  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [authSession, setAuthSession] = useState<AuthSessionPublic | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [loadingAction, setLoadingAction] = useState<
    "generate" | "explain" | "chat" | "profile" | null
  >(null);
  const [aiWaitState, setAiWaitState] = useState<AiWaitState | null>(null);
  const [error, setError] = useState("");
  const [telegramAuth, setTelegramAuth] = useState<TelegramAuthState>({
    status: "idle",
    user: null,
    platform: null,
    message: "Локальный веб-режим.",
  });
  const bootstrappedKeyRef = useRef<string | null>(null);
  const hasAttemptedTelegramAuth = useRef(false);

  useEffect(() => {
    hydrateFromLegacyStorage();
    ensureAppUserKey();
  }, [ensureAppUserKey, hydrateFromLegacyStorage]);

  useEffect(() => {
    void fetchSystemStatus()
      .then((data) => setStatus(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    void fetchAuthSession()
      .then((data) => {
        setSessionError("");
        if (!data.authenticated || !data.session) {
          setAuthSession(null);
          return;
        }

        setAuthSession(data.session);
        setTelegramIdentity({
          telegramUserId: telegramUserId ?? null,
        });
        // После OAuth входа хотим подставить имя из провайдера вместо "демо"-профиля.
        // Если пользователь уже вручную ввёл имя — не перетираем.
        const currentName = profile.studentName.trim();
        if ((!currentName || currentName.toLowerCase() === "ученик") && data.session.displayName) {
          updateProfile({ studentName: data.session.displayName });
        }
      })
      .catch((requestError) => {
        setAuthSession(null);
        setSessionError(
          requestError instanceof Error
            ? requestError.message
            : "Не удалось проверить сессию входа.",
        );
      });
  }, [
    hasHydrated,
    profile.studentName,
    setTelegramIdentity,
    telegramUserId,
    updateProfile,
  ]);

  useEffect(() => {
    if (!telegramMiniApp.isAvailable || !telegramMiniApp.initData || hasAttemptedTelegramAuth.current) {
      return;
    }

    hasAttemptedTelegramAuth.current = true;
    setTelegramAuth({
      status: "loading",
      user: null,
      platform: telegramMiniApp.platform,
      message: "Проверяю Telegram-подпись...",
    });

    void authenticateTelegram(telegramMiniApp.initData)
      .then((data) => {
        if (!data.ok || !data.user) {
          setTelegramAuth({
            status: "error",
            user: null,
            platform: telegramMiniApp.platform,
            message: data.message ?? "Telegram-подпись не прошла проверку.",
          });
          return;
        }

        const nextTelegramUserId = String(data.user.id);
        const nextAppUserKey = `telegram-user-${data.user.id}`;

        setTelegramIdentity({
          telegramUserId: nextTelegramUserId,
          appUserKey: nextAppUserKey,
        });
        updateProfile({
          studentName:
            profile.studentName ||
            [data.user.first_name, data.user.last_name].filter(Boolean).join(" ").trim() ||
            profile.studentName,
        });
        setTelegramAuth({
          status: "connected",
          user: data.user,
          platform: telegramMiniApp.platform,
          message: data.user.username
            ? `Miniapp подключён как @${data.user.username}.`
            : "Miniapp подключён через Telegram.",
        });
      })
      .catch(() => {
        setTelegramAuth({
          status: "error",
          user: null,
          platform: telegramMiniApp.platform,
          message: "Не удалось подтвердить вход через Telegram.",
        });
      });
  }, [
    profile.studentName,
    setTelegramIdentity,
    telegramMiniApp.initData,
    telegramMiniApp.isAvailable,
    telegramMiniApp.platform,
    updateProfile,
  ]);

  const refreshDashboard = useCallback(async () => {
    if (!authSession) {
      return null;
    }

    setDashboardLoading(true);
    setDashboardError("");
    try {
      const data = await fetchDashboardSummary();
      setDashboardSummary(data.summary);
      if (data.summary?.profile) {
        updateProfile(data.summary.profile);
      }
      if (data.summary?.progress) {
        setProgress(data.summary.progress);
      }
      return data.summary;
    } catch (requestError) {
      setDashboardError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось обновить кабинет.",
      );
      return null;
    } finally {
      setDashboardLoading(false);
    }
  }, [authSession, setProgress]);

  const syncProgress = useCallback(
    async (options?: {
      progress?: ProgressSnapshot;
      studySession?: {
        sessionId?: string;
        taskNumber: string;
        taskText?: string;
        explanation?: string;
        difyConversationId?: string;
        appendMessages?: ChatMessage[];
      };
    }) => {
      if (!authSession) {
        return null;
      }

      try {
        const result = await syncProgressToApi({
          telegramUserId,
          profile,
          progress: options?.progress ?? progress,
          studySession: options?.studySession,
        });

        if (result.database) {
          void refreshDashboard();
        }

        return result;
      } catch {
        return null;
      }
    },
    [authSession, profile, progress, refreshDashboard, telegramUserId],
  );

  useEffect(() => {
    if (!hasHydrated || !authSession) {
      return;
    }
    const bootstrapKey = `${authSession.provider}:${authSession.displayName ?? ""}`;
    if (bootstrappedKeyRef.current === bootstrapKey) {
      return;
    }

    // IMPORTANT: do NOT immediately sync local (demo) progress into DB on login.
    // First, fetch the authoritative dashboard from DB and overwrite local state.
    bootstrappedKeyRef.current = bootstrapKey;
    void refreshDashboard();
  }, [authSession, hasHydrated, refreshDashboard]);

  useEffect(() => {
    if (!hasHydrated || !authSession) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshDashboard();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [authSession, hasHydrated, refreshDashboard]);

  const level = useMemo(() => Math.max(1, Math.floor(progress.xp / 120)), [progress.xp]);
  const weeklyProgress = useMemo(
    () => Math.min(100, Math.round((progress.completedThisWeek / progress.weeklyGoal) * 100)),
    [progress.completedThisWeek, progress.weeklyGoal],
  );
  const taskOptions = useMemo(
    () => getTaskOptions(profile.exam, profile.subject),
    [profile.exam, profile.subject],
  );
  const taskBlueprint = useMemo(
    () => getTaskBlueprint(profile.exam, profile.subject, lesson.taskNumber),
    [lesson.taskNumber, profile.exam, profile.subject],
  );
  const learnerName =
    (authSession?.displayName ?? profile.studentName).trim() || "ученик";
  const aiWaitStartedAt = aiWaitState?.startedAt;

  useEffect(() => {
    if (!aiWaitStartedAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setAiWaitState((current) =>
        current
          ? {
              ...current,
              elapsedSeconds: Math.floor((Date.now() - current.startedAt) / 1000),
            }
          : current,
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [aiWaitStartedAt]);

  const beginAiWait = useCallback((action: AiAction) => {
    setAiWaitState({
      action,
      startedAt: Date.now(),
      elapsedSeconds: 0,
      hasFirstChunk: false,
    });
  }, []);

  const markAiFirstChunk = useCallback(() => {
    setAiWaitState((current) => {
      if (!current || current.hasFirstChunk) {
        return current;
      }

      return {
        ...current,
        hasFirstChunk: true,
      };
    });
  }, []);

  const endAiWait = useCallback(() => {
    setAiWaitState(null);
  }, []);

  const aiWaitStatus = useMemo(() => {
    if (!aiWaitState) {
      return null;
    }

    const copy = aiWaitCopy[aiWaitState.action];
    const waitingIndex = Math.floor(aiWaitState.elapsedSeconds / 4) % copy.waiting.length;
    const isSlow = !aiWaitState.hasFirstChunk && aiWaitState.elapsedSeconds >= 12;

    return {
      action: aiWaitState.action,
      title: copy.title,
      description: aiWaitState.hasFirstChunk
        ? copy.streaming
        : isSlow
          ? copy.slow
          : copy.waiting[waitingIndex],
      elapsedSeconds: aiWaitState.elapsedSeconds,
      hasFirstChunk: aiWaitState.hasFirstChunk,
      isSlow,
    };
  }, [aiWaitState]);

  const currentFocus = useMemo(() => {
    const taskMeta = `${subjectLabels[profile.subject]} · № ${lesson.taskNumber}`;

    if (!lesson.generatedTask.trim()) {
      return {
        eyebrow: "Сейчас лучший следующий шаг",
        title: `${learnerName}, начните новую учебную сессию`,
        description:
          "Выберите предмет и номер задания, затем получите вариант в формате экзамена. После этого можно сразу перейти к разбору и работе вместе с наставником.",
        meta: taskMeta,
      };
    }

    if (!lesson.explanation.trim()) {
      return {
        eyebrow: "Следующий шаг",
        title: "Разберите задание до ощущения ясности",
        description:
          "Подробный разбор снимает напряжение перед самостоятельной попыткой и показывает, где именно лежит ключевая логика решения.",
        meta: taskMeta,
      };
    }

    if (lesson.chat.length === 0) {
      return {
        eyebrow: "Следующий шаг",
        title: "Закрепите понимание в диалоге",
        description:
          "Переходите к совместному решению: короткие сообщения помогут довести мысль до уверенного ответа без спешки.",
        meta: taskMeta,
      };
    }

    return {
      eyebrow: "Сессия в процессе",
      title: "Доведите решение до устойчивой уверенности",
      description:
        "История занятия и прогресс сохраняются в кабинете, поэтому можно спокойно идти по шагам и возвращаться к этому номеру позже.",
      meta: `${taskMeta} · ${lesson.chat.length} сообщений в разборе`,
    };
  }, [learnerName, lesson.chat.length, lesson.explanation, lesson.generatedTask, lesson.taskNumber, profile.subject]);

  const sessionStages = useMemo(() => {
    const hasTask = Boolean(lesson.generatedTask.trim());
    const hasExplanation = Boolean(lesson.explanation.trim());
    const hasDialogue = lesson.chat.length > 0;

    return [
      {
        step: "Шаг 1",
        title: "Задание",
        status: !hasTask ? "current" : "done",
      },
      {
        step: "Шаг 2",
        title: "Разбор",
        status: hasTask && !hasExplanation ? "current" : hasExplanation ? "done" : "upcoming",
      },
      {
        step: "Шаг 3",
        title: "Совместное решение",
        status: hasExplanation && !hasDialogue ? "current" : hasDialogue ? "done" : "upcoming",
      },
    ] as const;
  }, [lesson.chat.length, lesson.explanation, lesson.generatedTask]);

  const activeActionLabel =
    loadingAction === "generate"
      ? "Собираю новое задание под выбранный номер."
      : loadingAction === "explain"
        ? "Готовлю понятный разбор текущего задания."
        : loadingAction === "chat"
          ? "Наставник формулирует следующий шаг."
          : loadingAction === "profile"
            ? "Сохраняю настройки и обновляю кабинет."
            : null;

  const onboardingComplete = Boolean(profile.studentName.trim() && profile.goalScore.trim());

  async function handleGenerate(): Promise<boolean> {
    setLoadingAction("generate");
    beginAiWait("generate");
    setError("");
    setStudySessionId(null);
    setActiveView("lesson");
    setLessonPatch({
      generatedTask: "",
      generationConversationId: null,
      teachingConversationId: null,
      explanation: "",
      chat: [],
      studentMessage: "",
    });

    try {
      const data = await generateTask({
        exam: profile.exam,
        subject: profile.subject,
        taskNumber: lesson.taskNumber,
      }, {
        onChunk: (content) => {
          markAiFirstChunk();
          setLessonPatch({ generatedTask: content });
        },
      });

      if (!data.content.trim()) {
        setError("Не удалось получить текст задания. Попробуйте повторить запрос.");
        return false;
      }

      const nextProgress = buildProgressSnapshot(
        progress.xp + 25,
        progress.streak,
        progress.weeklyGoal,
        progress.completedThisWeek + 1,
      );

      startGeneratedSession({
        taskNumber: lesson.taskNumber,
        generatedTask: data.content,
        conversationId: data.conversationId ?? null,
      });
      setProgress(nextProgress);

      const syncResult = await syncProgress({
        progress: nextProgress,
        studySession: {
          taskNumber: lesson.taskNumber,
          taskText: data.content,
          difyConversationId: data.conversationId,
        },
      });

      if (syncResult?.studySessionId) {
        setStudySessionId(syncResult.studySessionId);
      }

      return true;
    } catch (requestError) {
      const msg =
        requestError instanceof Error
          ? requestError.message
          : "Не удалось сгенерировать задание.";
      if (isDifyStaleUploadConversationError(msg)) {
        setLessonPatch({ generationConversationId: null, teachingConversationId: null });
      }
      setError(msg);
      return false;
    } finally {
      setLoadingAction(null);
      endAiWait();
    }
  }

  async function handleExplain() {
    if (!lesson.generatedTask.trim()) {
      setError("Сначала получите задание или вставьте текст вручную.");
      return;
    }

    setLoadingAction("explain");
    beginAiWait("explain");
    setError("");
    setExplanation("");

    try {
      const data = await explainTask({
        exam: profile.exam,
        subject: profile.subject,
        taskNumber: lesson.taskNumber,
        taskText: lesson.generatedTask,
        mode: lesson.explanationMode,
        conversationId: lesson.teachingConversationId,
      }, {
        onChunk: (content) => {
          markAiFirstChunk();
          setExplanation(content);
        },
      });

      const nextProgress = buildProgressSnapshot(
        progress.xp + 15,
        progress.streak,
        progress.weeklyGoal,
        progress.completedThisWeek,
      );

      setExplanation(data.content);
      setLessonPatch({
        teachingConversationId: data.conversationId ?? lesson.teachingConversationId,
      });
      setProgress(nextProgress);

      if (studySessionId) {
        await syncProgress({
          progress: nextProgress,
          studySession: {
            sessionId: studySessionId,
            taskNumber: lesson.taskNumber,
            explanation: data.content,
            difyConversationId: data.conversationId,
          },
        });
      }
    } catch (requestError) {
      const msg = requestError instanceof Error ? requestError.message : "Не удалось объяснить задание.";
      if (isDifyStaleUploadConversationError(msg)) {
        setLessonPatch({ teachingConversationId: null });
      }
      setError(msg);
    } finally {
      setLoadingAction(null);
      endAiWait();
    }
  }

  async function handleSocraticStep() {
    if (!lesson.generatedTask.trim()) {
      setError("Сначала нужно получить задание, которое вы будете решать.");
      return;
    }

    if (!lesson.studentMessage.trim()) {
      setError("Напишите ваш текущий шаг, вопрос или сомнение.");
      return;
    }

    setLoadingAction("chat");
    beginAiWait("chat");
    setError("");

    const previousChat = lesson.chat;
    const studentText = lesson.studentMessage.trim();
    const optimisticHistory = [...previousChat, { role: "student" as const, text: studentText }];
    setLessonPatch({
      chat: optimisticHistory,
      studentMessage: "",
    });

    try {
      const data = await requestSocraticStep({
        exam: profile.exam,
        subject: profile.subject,
        taskNumber: lesson.taskNumber,
        taskText: lesson.generatedTask,
        studentMessage: studentText,
        history: previousChat,
        conversationId: lesson.teachingConversationId,
      }, {
        onChunk: (content) => {
          markAiFirstChunk();
          setLessonPatch({
            chat: [...optimisticHistory, { role: "assistant" as const, text: content }],
          });
        },
      });

      const nextProgress = buildProgressSnapshot(
        progress.xp + 20,
        progress.streak,
        progress.weeklyGoal,
        progress.completedThisWeek,
      );
      const nextChat = [...optimisticHistory, { role: "assistant" as const, text: data.content }];

      setLessonPatch({
        chat: nextChat,
        teachingConversationId: data.conversationId ?? lesson.teachingConversationId,
      });
      setProgress(nextProgress);

      if (studySessionId) {
        await syncProgress({
          progress: nextProgress,
          studySession: {
            sessionId: studySessionId,
            taskNumber: lesson.taskNumber,
            difyConversationId: data.conversationId,
            appendMessages: [
              { role: "student", text: studentText },
              { role: "assistant", text: data.content },
            ],
          },
        });
      }
    } catch (requestError) {
      const msg = requestError instanceof Error ? requestError.message : "Не удалось продолжить диалог.";
      const staleUpload = isDifyStaleUploadConversationError(msg);
      setLessonPatch({
        chat: previousChat,
        studentMessage: studentText,
        ...(staleUpload ? { teachingConversationId: null } : {}),
      });
      setError(msg);
    } finally {
      setLoadingAction(null);
      endAiWait();
    }
  }

  async function handleSaveProfile() {
    setLoadingAction("profile");
    setError("");

    try {
      await syncProgress();
      await refreshDashboard();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Не удалось сохранить профиль.",
      );
    } finally {
      setLoadingAction(null);
    }
  }

  function handleAuthLogin(provider: "vk" | "yandex") {
    const url = new URL("/api/auth/oauth/start", window.location.origin);
    url.searchParams.set("provider", provider);
    if (appUserKey) {
      url.searchParams.set("guestAppUserKey", appUserKey);
    }
    window.location.assign(url.toString());
  }

  async function handleAuthLogout() {
    setSessionError("");
    try {
      await logoutAuthSession();
      bootstrappedKeyRef.current = null;
      setAuthSession(null);
    } catch (requestError) {
      setSessionError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось выйти из аккаунта.",
      );
    }
  }

  async function handleIncreaseWeeklyGoal() {
    const nextWeeklyGoal = Math.min(14, progress.weeklyGoal + 1);
    const nextProgress = buildProgressSnapshot(
      progress.xp,
      progress.streak,
      nextWeeklyGoal,
      progress.completedThisWeek,
    );

    setProgress({ weeklyGoal: nextWeeklyGoal });
    await syncProgress({ progress: nextProgress });
  }

  function handleFocusTask(input: { subject: DashboardSummary["weakTopics"][number]["subject"]; taskNumber: string }) {
    focusTask(input);
    setError("");
  }

  function handleOpenSession(session: DashboardSummary["recentSessions"][number]) {
    openRecentSession(session);
    setError("");
  }

  return {
    appUserKey,
    aiWaitStatus,
    authSession,
    activeView,
    activeActionLabel,
    currentFocus,
    dashboardError,
    dashboardLoading,
    dashboardSummary,
    error,
    explanationModeOptions,
    formatDashboardDate,
    handleExplain,
    handleFocusTask,
    handleGenerate,
    handleAuthLogin,
    handleAuthLogout,
    handleIncreaseWeeklyGoal,
    handleOpenSession,
    handleSaveProfile,
    handleSocraticStep,
    learnerName,
    level,
    loadingAction,
    onboardingComplete,
    profile,
    progress,
    refreshDashboard,
    sessionStages,
    sessionError,
    setActiveView,
    setLessonPatch,
    setSubject,
    status,
    studySessionId,
    subjectLabels,
    subjectOptions,
    taskBlueprint,
    taskOptions,
    telegramAuth,
    updateProfile,
    weeklyProgress,
    lesson,
  };
}

export type LearningAppController = ReturnType<typeof useLearningAppController>;
