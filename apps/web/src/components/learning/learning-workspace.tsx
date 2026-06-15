"use client";

import { useState } from "react";
import { AlertCircle, ArrowLeft, BookOpen, Edit3, Send, Settings, Sparkles, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import type { LearningAppController } from "@/components/learning/use-learning-app-controller";

function AiPendingCard({
  title,
  description,
  elapsedSeconds,
  isSlow,
}: {
  title: string;
  description: string;
  elapsedSeconds: number;
  isSlow: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#6D5DF6]/20 bg-[#6D5DF6]/10 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 flex gap-1">
          {[0, 1, 2].map((dot) => (
            <motion.span
              key={dot}
              className="h-2 w-2 rounded-full bg-[#6D5DF6]"
              animate={{ opacity: [0.35, 1, 0.35], y: [0, -3, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.16 }}
            />
          ))}
        </div>
        <div>
          <div className="text-sm font-semibold text-[#111111]">{title}</div>
          <p className="mt-1 text-sm leading-6 text-[#6B7280]">{description}</p>
          {isSlow ? (
            <p className="mt-2 text-xs text-[#6B7280]">
              Ждем уже {elapsedSeconds} сек. Запрос не прерываем.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ErrorNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#DC2626]" />
        <div>
          <div className="text-sm font-semibold text-[#111111]">{title}</div>
          <p className="mt-1 text-sm leading-6 text-[#6B7280]">{message}</p>
        </div>
      </div>
    </div>
  );
}

export function LearningWorkspace({
  controller,
}: {
  controller: LearningAppController;
}) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(() => {
    if (controller.lesson.chat.length > 0 || controller.lesson.explanation.trim()) {
      return 3;
    }
    if (controller.lesson.generatedTask.trim()) {
      return 2;
    }
    return 1;
  });

  const hasTask = controller.lesson.generatedTask.trim().length > 0;
  const hasExplanation = controller.lesson.explanation.trim().length > 0;
  const hasChat = controller.lesson.chat.length > 0;

  function isStepCompleted(stepNum: 1 | 2 | 3) {
    if (stepNum === 1) {
      return hasTask;
    }
    if (stepNum === 2) {
      return hasExplanation;
    }
    return hasChat;
  }

  function canOpenStep(stepNum: 1 | 2 | 3) {
    if (stepNum === 1) {
      return true;
    }
    return hasTask;
  }

  async function handleGenerateAndMove() {
    const ok = await controller.handleGenerate();
    if (ok) {
      setCurrentStep(2);
    }
  }

  async function handleExplainAndMove() {
    await controller.handleExplain();
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F7F4]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => controller.setActiveView("dashboard")}
                className="flex items-center gap-2 text-[#6B7280] hover:text-[#111111]"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Назад</span>
              </button>
              <div className="h-6 w-px bg-black/10" />
              <div>
                <div className="font-semibold text-[#111111]">Рабочее пространство</div>
                <div className="text-sm text-[#6B7280]">Подготовка к ОГЭ</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 rounded-2xl bg-[#F8F7F4] px-4 py-2">
                <Trophy className="h-5 w-5 text-[#6D5DF6]" />
                <span className="font-semibold text-[#111111]">
                  {controller.progress.xp.toLocaleString("ru-RU")} XP
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <div className="mx-auto h-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center justify-center gap-4">
            {[
              { num: 1, label: "Настройка занятия" },
              { num: 2, label: "Разбор" },
              { num: 3, label: "Совместное решение" },
            ].map((step, index) => (
              <div key={step.num} className="flex items-center gap-4">
                <button
                  type="button"
                  disabled={!canOpenStep(step.num as 1 | 2 | 3)}
                  onClick={() => setCurrentStep(step.num as 1 | 2 | 3)}
                  className={`flex items-center gap-3 rounded-2xl px-6 py-3 transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                    currentStep === step.num
                      ? "bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6] text-white shadow-lg shadow-purple-500/20"
                      : isStepCompleted(step.num as 1 | 2 | 3)
                        ? "bg-[#22C55E]/10 text-[#22C55E]"
                        : "bg-white text-[#6B7280]"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-xl font-semibold ${
                      currentStep === step.num
                        ? "bg-white/20 text-white backdrop-blur-sm"
                        : isStepCompleted(step.num as 1 | 2 | 3)
                          ? "bg-[#22C55E] text-white"
                          : "bg-[#F8F7F4] text-[#6B7280]"
                    }`}
                  >
                    {currentStep === step.num
                      ? step.num
                      : isStepCompleted(step.num as 1 | 2 | 3)
                        ? "✓"
                        : step.num}
                  </div>
                  <span className="hidden font-medium md:block">{step.label}</span>
                </button>
                {index < 2 ? <div className="hidden h-0.5 w-8 bg-black/10 md:block" /> : null}
              </div>
            ))}
          </div>

          {controller.sessionError || controller.error ? (
            <div className="mb-6 space-y-3">
              {controller.sessionError ? (
                <ErrorNotice title="Не удалось проверить вход" message={controller.sessionError} />
              ) : null}
              {controller.error ? (
                <ErrorNotice title="Запрос не выполнен" message={controller.error} />
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[2fr_3fr] lg:h-[calc(100vh-240px)]">
            <div className="space-y-6 overflow-y-auto">
              {currentStep === 1 ? (
                <>
                  <div className="rounded-[28px] border border-black/5 bg-white p-8 shadow-lg shadow-black/5">
                    <div className="mb-6 flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]">
                        <Settings className="h-6 w-6 text-white" />
                      </div>
                      <h2 className="text-2xl font-semibold text-[#111111]">Настройка занятия</h2>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <label className="mb-3 block text-sm font-medium text-[#111111]">Предмет</label>
                        <div className="grid grid-cols-2 gap-3">
                          {controller.subjectOptions.map((subject) => (
                            <button
                              key={subject.value}
                              onClick={() => controller.setSubject(subject.value)}
                              className={`rounded-2xl px-4 py-3 font-medium transition-all ${
                                controller.profile.subject === subject.value
                                  ? "bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6] text-white shadow-lg shadow-purple-500/20"
                                  : "bg-[#F8F7F4] text-[#6B7280] hover:bg-[#F8F7F4]/80"
                              }`}
                            >
                              {subject.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="mb-3 block text-sm font-medium text-[#111111]">Тип задания</label>
                        <select
                          value={controller.lesson.taskNumber}
                          onChange={(event) => controller.setLessonPatch({ taskNumber: event.target.value })}
                          className="w-full rounded-2xl border border-black/5 bg-[#F8F7F4] px-4 py-3 text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#6D5DF6] appearance-none cursor-pointer"
                        >
                          {controller.taskOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={handleGenerateAndMove}
                        disabled={controller.loadingAction !== null}
                        className="w-full rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6] px-6 py-4 font-medium text-white shadow-lg shadow-purple-500/20 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                      >
                        Сгенерировать задание
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-[#6D5DF6]/20 bg-gradient-to-br from-[#6D5DF6]/10 to-[#8B5CF6]/10 p-8">
                    <h3 className="mb-4 font-semibold text-[#111111]">Формат экзамена</h3>
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="font-medium text-[#111111]">Название:</span>
                        <p className="mt-1 text-[#6B7280]">
                          {controller.taskBlueprint?.label ?? `Задание ${controller.lesson.taskNumber}`}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium text-[#111111]">Что проверяет:</span>
                        <p className="mt-1 text-[#6B7280]">
                          {controller.taskBlueprint?.focus ?? "После выбора номера появится описание навыка."}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium text-[#111111]">Формат ответа:</span>
                        <p className="mt-1 text-[#6B7280]">
                          {controller.taskBlueprint?.answerFormat ?? "будет определён автоматически"}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}

              {currentStep === 2 ? (
                <div className="rounded-[28px] border border-black/5 bg-white p-8 shadow-lg shadow-black/5">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#22C55E] to-[#16A34A]">
                      <BookOpen className="h-6 w-6 text-white" />
                    </div>
                    <h2 className="text-2xl font-semibold text-[#111111]">Разбор</h2>
                  </div>

                  <div className="space-y-6">
                    {!hasTask ? (
                      <div className="rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm leading-6 text-[#92400E]">
                        <p className="mb-2">
                          Текста задания пока нет. Сначала нажмите «Сгенерировать задание» на шаге «Настройка
                          занятия» или вставьте условие в поле справа.
                        </p>
                        <button
                          type="button"
                          onClick={() => setCurrentStep(1)}
                          className="font-medium text-[#6D5DF6] underline decoration-[#6D5DF6]/40 underline-offset-2 hover:decoration-[#6D5DF6]"
                        >
                          Перейти к настройке
                        </button>
                      </div>
                    ) : null}

                    <div>
                      <label className="mb-3 block text-sm font-medium text-[#111111]">Режим объяснения</label>
                      <div className="grid grid-cols-3 gap-3">
                        {controller.explanationModeOptions.map((mode) => (
                          <button
                            key={mode.value}
                            onClick={() => controller.setLessonPatch({ explanationMode: mode.value })}
                            className={`rounded-2xl px-4 py-3 font-medium transition-all ${
                              controller.lesson.explanationMode === mode.value
                                ? "bg-gradient-to-br from-[#22C55E] to-[#16A34A] text-white shadow-lg shadow-green-500/20"
                                : "bg-[#F8F7F4] text-[#6B7280] hover:bg-[#F8F7F4]/80"
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {!controller.lesson.explanation && controller.aiWaitStatus?.action === "explain" ? (
                      <AiPendingCard
                        title={controller.aiWaitStatus.title}
                        description={controller.aiWaitStatus.description}
                        elapsedSeconds={controller.aiWaitStatus.elapsedSeconds}
                        isSlow={controller.aiWaitStatus.isSlow}
                      />
                    ) : null}

                    {controller.lesson.explanation ? (
                      <div className="space-y-4 rounded-2xl bg-[#F8F7F4] p-6">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-[#111111]">Подробное объяснение</h4>
                          <button
                            onClick={() => controller.setLessonPatch({ explanation: "" })}
                            className="text-sm text-[#6B7280] hover:text-[#111111]"
                          >
                            Изменить
                          </button>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed text-[#6B7280]">
                          {controller.lesson.explanation}
                        </p>
                      </div>
                    ) : null}

                    {!controller.lesson.explanation ? (
                      <button
                        onClick={handleExplainAndMove}
                        disabled={controller.loadingAction !== null || !controller.lesson.generatedTask.trim()}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#22C55E] to-[#16A34A] px-6 py-4 font-medium text-white shadow-lg shadow-green-500/20 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                      >
                        <Sparkles className="h-5 w-5" />
                        Сгенерировать объяснение
                      </button>
                    ) : (
                      <button
                        onClick={() => setCurrentStep(3)}
                        className="w-full rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6] px-6 py-4 font-medium text-white shadow-lg shadow-purple-500/20 transition-all hover:scale-105"
                      >
                        Перейти к решению
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              {currentStep === 3 ? (
                <div className="rounded-[28px] border border-black/5 bg-white p-8 shadow-lg shadow-black/5">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]">
                      <Edit3 className="h-6 w-6 text-white" />
                    </div>
                    <h2 className="text-2xl font-semibold text-[#111111]">Текст задания</h2>
                  </div>

                  <textarea
                    value={controller.lesson.generatedTask}
                    onChange={(event) => controller.setLessonPatch({ generatedTask: event.target.value })}
                    className="h-64 w-full resize-none rounded-2xl border border-black/5 bg-[#F8F7F4] px-4 py-3 font-mono text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#6D5DF6]"
                    placeholder="Текст задания появится здесь..."
                  />

                  <p className="mt-3 text-xs text-[#6B7280]">
                    Вы можете отредактировать задание или вставить своё
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-lg shadow-black/5">
              {currentStep < 3 ? (
                <div className="flex h-full flex-col p-8">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]">
                      <Edit3 className="h-6 w-6 text-white" />
                    </div>
                    <h2 className="text-2xl font-semibold text-[#111111]">Текст задания</h2>
                  </div>

                  {controller.aiWaitStatus?.action === "generate" && !controller.lesson.generatedTask ? (
                    <div className="mb-4">
                      <AiPendingCard
                        title={controller.aiWaitStatus.title}
                        description={controller.aiWaitStatus.description}
                        elapsedSeconds={controller.aiWaitStatus.elapsedSeconds}
                        isSlow={controller.aiWaitStatus.isSlow}
                      />
                    </div>
                  ) : null}

                  <textarea
                    value={controller.lesson.generatedTask}
                    onChange={(event) => controller.setLessonPatch({ generatedTask: event.target.value })}
                    className="min-h-80 flex-1 resize-none rounded-2xl border border-black/5 bg-[#F8F7F4] px-4 py-3 font-mono text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#6D5DF6]"
                    placeholder="Текст задания появится здесь..."
                  />

                  <p className="mt-3 text-xs text-[#6B7280]">
                    Вы можете отредактировать задание или вставить своё
                  </p>
                </div>
              ) : (
                <>
                  <div className="border-b border-black/5 p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]">
                        <Sparkles className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h2 className="font-semibold text-[#111111]">ИИ-наставник</h2>
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full bg-[#22C55E]" />
                          <span className="text-sm text-[#6B7280]">Готов помочь</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-6 overflow-y-auto p-6">
                    <div className="flex gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]">
                        <Sparkles className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="rounded-2xl rounded-tl-sm bg-[#F8F7F4] p-4">
                          <p className="leading-relaxed text-[#111111]">
                            Привет! Напиши, что уже понял или где застрял — разберёмся вместе.
                          </p>
                        </div>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {controller.lesson.chat.map((message, index) =>
                        message.role === "student" ? (
                          <motion.div
                            key={`${message.role}-${index}-${message.text.slice(0, 12)}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex justify-end gap-3"
                          >
                            <div className="max-w-md rounded-2xl rounded-tr-sm bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6] p-4">
                              <p className="leading-relaxed text-white">{message.text}</p>
                            </div>
                            <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]" />
                          </motion.div>
                        ) : (
                          <motion.div
                            key={`${message.role}-${index}-${message.text.slice(0, 12)}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex gap-3"
                          >
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]">
                              <Sparkles className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1">
                              <div className="rounded-2xl rounded-tl-sm bg-[#F8F7F4] p-4">
                                <p className="whitespace-pre-wrap leading-relaxed text-[#111111]">
                                  {message.text}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        ),
                      )}
                    </AnimatePresence>

                    {controller.aiWaitStatus?.action === "chat" && !controller.aiWaitStatus.hasFirstChunk ? (
                      <AiPendingCard
                        title={controller.aiWaitStatus.title}
                        description={controller.aiWaitStatus.description}
                        elapsedSeconds={controller.aiWaitStatus.elapsedSeconds}
                        isSlow={controller.aiWaitStatus.isSlow}
                      />
                    ) : null}

                  </div>

                  <div className="border-t border-black/5 p-6">
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={controller.lesson.studentMessage}
                        onChange={(event) => controller.setLessonPatch({ studentMessage: event.target.value })}
                        placeholder="Напиши свои мысли или вопрос..."
                        className="flex-1 rounded-2xl border border-black/5 bg-[#F8F7F4] px-6 py-4 text-[#111111] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#6D5DF6]"
                      />
                      <button
                        onClick={controller.handleSocraticStep}
                        disabled={controller.loadingAction !== null}
                        className="flex items-center gap-2 rounded-2xl bg-[#6D5DF6] px-6 py-4 text-white transition-all hover:scale-105 hover:bg-[#5D4DE6] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                      >
                        <Send className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
