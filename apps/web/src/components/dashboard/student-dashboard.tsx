"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronRight, Flame, Loader2, RefreshCw, Sparkles, Target, TrendingUp, Trophy } from "lucide-react";

import type { LearningAppController } from "@/components/learning/use-learning-app-controller";

const subjectVisuals = {
  math: {
    icon: "📐",
    color: "from-[#6D5DF6] to-[#8B5CF6]",
  },
  russian: {
    icon: "📝",
    color: "from-[#22C55E] to-[#16A34A]",
  },
  geography: {
    icon: "🌍",
    color: "from-[#3B82F6] to-[#2563EB]",
  },
  history: {
    icon: "📚",
    color: "from-[#F59E0B] to-[#D97706]",
  },
} as const;

function DashboardNotice({
  tone,
  title,
  description,
  actionLabel,
  onAction,
  loading = false,
}: {
  tone: "loading" | "error" | "warning";
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
}) {
  const isError = tone === "error";
  const iconClassName = isError ? "text-[#DC2626]" : "text-[#6D5DF6]";
  const containerClassName = isError
    ? "border-[#FCA5A5] bg-[#FEF2F2]"
    : "border-[#6D5DF6]/20 bg-[#6D5DF6]/10";

  return (
    <div className={`rounded-[24px] border p-4 ${containerClassName}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {tone === "loading" ? (
            <Loader2 className={`mt-0.5 h-5 w-5 animate-spin ${iconClassName}`} />
          ) : (
            <AlertCircle className={`mt-0.5 h-5 w-5 ${iconClassName}`} />
          )}
          <div>
            <div className="font-semibold text-[#111111]">{title}</div>
            <p className="mt-1 text-sm leading-6 text-[#6B7280]">{description}</p>
          </div>
        </div>
        {actionLabel && onAction ? (
          <button
            onClick={onAction}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-[#111111] shadow-sm transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function StudentDashboard({
  controller,
}: {
  controller: LearningAppController;
}) {
  const summary = controller.dashboardSummary;
  const totalSessions = summary?.overview.totalSessions ?? 0;
  const learnerName = controller.learnerName;
  const weeklyGoal = Math.max(controller.progress.weeklyGoal, 1);
  const completedThisWeek = controller.progress.completedThisWeek;
  const weeklyPercent = Math.min(100, Math.round((completedThisWeek / weeklyGoal) * 100));
  const focusSubject = controller.profile.subject;
  const achievements =
    summary?.achievements ??
    [
      {
        code: "first_task",
        title: "Первый шаг",
        description: "Сгенерировать первое задание и начать подготовку.",
        progress: Math.min(100, totalSessions * 100),
        currentValue: Math.min(totalSessions, 1),
        targetValue: 1,
        earned: totalSessions > 0,
        earnedAt: null,
      },
      {
        code: "three_day_streak",
        title: "Три дня подряд",
        description: "Заниматься 3 дня без пропусков.",
        progress: Math.min(100, Math.round((controller.progress.streak / 3) * 100)),
        currentValue: Math.min(controller.progress.streak, 3),
        targetValue: 3,
        earned: controller.progress.streak >= 3,
        earnedAt: null,
      },
      {
        code: "level_five",
        title: "Уровень 5",
        description: "Набрать 600 XP за регулярную работу.",
        progress: Math.min(100, Math.round((controller.progress.xp / 600) * 100)),
        currentValue: Math.min(controller.progress.xp, 600),
        targetValue: 600,
        earned: controller.progress.xp >= 600,
        earnedAt: null,
      },
    ];
  const earnedCount = achievements.filter((achievement) => achievement.earned).length;
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");
  const achievementColors = [
    "from-[#6D5DF6] to-[#8B5CF6]",
    "from-[#22C55E] to-[#16A34A]",
    "from-[#F59E0B] to-[#D97706]",
    "from-[#FF6B35] to-[#F97316]",
  ];

  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-semibold text-[#111111]">ИзиОГЭ</span>
            </Link>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 rounded-2xl bg-[#F8F7F4] px-4 py-2">
                <Flame className="h-5 w-5 text-[#FF6B35]" />
                <span className="font-semibold text-[#111111]">{controller.progress.streak}</span>
                <span className="text-sm text-[#6B7280]">дней подряд</span>
              </div>
              <button
                onClick={() => controller.setActiveView("lesson")}
                className="rounded-2xl bg-[#6D5DF6] px-5 py-2.5 font-medium text-white transition-all hover:scale-105 hover:bg-[#5D4DE6]"
              >
                Учиться
              </button>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]" />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold text-[#111111] md:text-5xl">
            Привет, {learnerName}! 👋
          </h1>
          <p className="text-xl text-[#6B7280]">Продолжим подготовку к экзаменам?</p>
        </div>

        {controller.sessionError || controller.dashboardError || controller.dashboardLoading ? (
          <div className="mb-8 space-y-3">
            {controller.sessionError ? (
              <DashboardNotice
                tone="warning"
                title="Не удалось проверить вход"
                description={controller.sessionError}
              />
            ) : null}
            {controller.dashboardError ? (
              <DashboardNotice
                tone="error"
                title="Кабинет не обновился"
                description={controller.dashboardError}
                actionLabel="Повторить"
                onAction={() => void controller.refreshDashboard()}
                loading={controller.dashboardLoading}
              />
            ) : null}
            {controller.dashboardLoading ? (
              <DashboardNotice
                tone="loading"
                title={summary ? "Обновляю кабинет" : "Загружаю кабинет"}
                description={
                  summary
                    ? "Подтягиваю свежие занятия, достижения и баланс советов."
                    : "Пока показываю локальный прогресс, данные из базы появятся через несколько секунд."
                }
              />
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-[28px] border border-black/5 bg-white p-8 shadow-lg shadow-black/5">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-[#111111]">Твой прогресс</h2>
                <div className="flex items-center gap-2 rounded-full bg-[#6D5DF6]/10 px-4 py-2 text-[#6D5DF6]">
                  <Trophy className="h-5 w-5" />
                  <span className="font-semibold">{controller.progress.xp.toLocaleString("ru-RU")} XP</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  { label: "Решено задач", value: String(totalSessions), icon: <Target className="h-5 w-5" /> },
                  { label: "Серия", value: `${controller.progress.streak} дней`, icon: <Flame className="h-5 w-5 text-[#FF6B35]" /> },
                  { label: "Целевой балл", value: controller.profile.goalScore || "80", icon: <TrendingUp className="h-5 w-5 text-[#22C55E]" /> },
                  { label: "Уровень", value: String(controller.level), icon: <Trophy className="h-5 w-5 text-[#6D5DF6]" /> },
                ].map((stat, index) => (
                  <div key={index} className="rounded-2xl bg-[#F8F7F4] p-4 text-center">
                    <div className="mb-2 flex justify-center">{stat.icon}</div>
                    <div className="mb-1 text-2xl font-bold text-[#111111]">{stat.value}</div>
                    <div className="text-sm text-[#6B7280]">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6] p-8 shadow-lg shadow-purple-500/20">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h3 className="mb-2 text-2xl font-semibold text-white">Недельная цель</h3>
                  <p className="text-white/80">Следи за прогрессом за эту неделю</p>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                  <Target className="h-8 w-8 text-white" />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex justify-between text-white">
                    <span>Решить {weeklyGoal} задач</span>
                    <span className="font-semibold">
                      {completedThisWeek}/{weeklyGoal}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-white/20 backdrop-blur-sm">
                    <div className="h-full rounded-full bg-white" style={{ width: `${weeklyPercent}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-white">
                    <span>Заниматься 5 дней</span>
                    <span className="font-semibold">{Math.min(controller.progress.streak, 5)}/5 ✓</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-white/20 backdrop-blur-sm">
                    <div
                      className="h-full rounded-full bg-white"
                      style={{ width: `${Math.min(100, (controller.progress.streak / 5) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-full bg-white/20 px-4 py-2 text-center text-white backdrop-blur-sm">
                {completedThisWeek >= weeklyGoal
                  ? "Цель закрыта: значок «Ритм недели» уже твой"
                  : `До значка «Ритм недели» осталось ${Math.max(0, weeklyGoal - completedThisWeek)} заданий`}
              </div>
            </div>

            <div>
              <h2 className="mb-6 text-2xl font-semibold text-[#111111]">Предметы</h2>
              <div className="grid gap-6 md:grid-cols-2">
                {controller.subjectOptions.map((subjectOption) => {
                  const subject = subjectOption.value;
                  const visual = subjectVisuals[subject];
                  const stat = summary?.subjectStats.find((item) => item.subject === subject);
                  const progress = stat?.completionRate ?? 0;
                  const lessons = stat?.sessionsCount ?? 0;

                  return (
                    <button
                      key={subject}
                      onClick={() => {
                        controller.setSubject(subject);
                        controller.setActiveView("lesson");
                      }}
                      className="group rounded-[28px] border border-black/5 bg-white p-6 text-left shadow-lg shadow-black/5 transition-all hover:scale-105 hover:shadow-2xl"
                    >
                      <div className="mb-4 flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${visual.color} text-3xl`}>
                            {visual.icon}
                          </div>
                          <div>
                            <h3 className="text-xl font-semibold text-[#111111]">{subjectOption.label}</h3>
                            <p className="text-sm text-[#6B7280]">{lessons} заданий</p>
                          </div>
                        </div>
                        <ChevronRight className="h-6 w-6 text-[#6B7280] transition-transform group-hover:translate-x-1" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-[#6B7280]">Прогресс</span>
                          <span className="font-semibold text-[#111111]">{progress}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[#F8F7F4]">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${visual.color}`}
                            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => controller.setActiveView("lesson")}
              className="group block w-full rounded-[28px] bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6] p-8 text-left shadow-2xl shadow-purple-500/20 transition-all hover:scale-105"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="mb-2 text-2xl font-semibold text-white">Продолжить обучение</h3>
                  <p className="mb-4 text-white/80">
                    {controller.subjectLabels[focusSubject]} • Задание {controller.lesson.taskNumber}
                  </p>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-white backdrop-blur-sm">
                    <span>{controller.currentFocus.title}</span>
                  </div>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm transition-transform group-hover:rotate-12">
                  <ChevronRight className="h-8 w-8 text-white" />
                </div>
              </div>
            </button>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-lg shadow-black/5">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#F97316]">
                  <Flame className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#111111]">Серия</h3>
                  <p className="text-sm text-[#6B7280]">Занимайся каждый день</p>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-7 gap-2">
                {["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map((day, index) => (
                  <div key={index} className="text-center">
                    <div className="mb-1 text-xs text-[#6B7280]">{day}</div>
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                        index < Math.min(controller.progress.streak, 7)
                          ? "bg-gradient-to-br from-[#22C55E] to-[#16A34A]"
                          : "bg-[#F8F7F4]"
                      }`}
                    >
                      {index < Math.min(controller.progress.streak, 7) ? (
                        <div className="h-2 w-2 rounded-full bg-white" />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl bg-[#F8F7F4] py-3 text-center">
                <div className="text-2xl font-bold text-[#111111]">{controller.progress.streak} дней</div>
                <div className="text-sm text-[#6B7280]">Текущая серия</div>
              </div>
            </div>

            <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-lg shadow-black/5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-[#111111]">Достижения</h3>
                <span className="rounded-full bg-[#6D5DF6]/10 px-3 py-1 text-xs font-semibold text-[#6D5DF6]">
                  {earnedCount}/{achievements.length}
                </span>
              </div>
              <div className="space-y-3">
                {achievements.slice(0, 4).map((achievement, index) => {
                  const color = achievement.earned
                    ? "from-[#22C55E] to-[#16A34A]"
                    : achievementColors[index % achievementColors.length];

                  return (
                  <div key={achievement.code} className="rounded-2xl bg-[#F8F7F4] p-4">
                    <div className="mb-2 flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${color}`}>
                        <Trophy className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-[#111111]">{achievement.title}</div>
                          {achievement.earned ? (
                            <span className="rounded-full bg-[#22C55E]/10 px-2 py-0.5 text-[10px] font-semibold text-[#16A34A]">
                              получено
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-[#6B7280]">{achievement.description}</div>
                        <div className="mt-1 text-[11px] font-medium text-[#6B7280]">
                          {achievement.currentValue}/{achievement.targetValue}
                        </div>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${color}`}
                        style={{ width: `${achievement.progress}%` }}
                      />
                    </div>
                  </div>
                );
                })}
              </div>
            </div>

            <div className="rounded-[28px] bg-gradient-to-br from-[#22C55E] to-[#16A34A] p-6 shadow-lg shadow-green-500/20">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-white">Отличная работа!</h3>
              <p className="text-sm leading-relaxed text-white/90">
                {earnedCount > 0
                  ? `Уже открыто ${earnedCount} достижений. Следующая цель видна в кабинете.`
                  : "Начни с первого задания: прогресс, XP и значки сохранятся в кабинете."}
              </p>
            </div>
          </div>
        </div>

        {controller.authSession ? (
          <div className="mt-10 rounded-[28px] border border-[#FCA5A5]/60 bg-[#FEF2F2] p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-[#991B1B]">Удаление аккаунта и данных</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#7F1D1D]/90">
              Будут удалены профиль, прогресс, учебные сессии, привязка к VK ID или Яндексу и записи о начислении
              советов Сократа в нашей базе. Восстановить данные будет нельзя. История диалогов у внешнего
              AI-провайдера хранится по его правилам и не удаляется этой кнопкой автоматически — при необходимости
              обратитесь в поддержку.
            </p>
            {deleteAccountError ? (
              <p className="mt-3 text-sm text-[#B91C1C]">{deleteAccountError}</p>
            ) : null}
            <button
              type="button"
              disabled={deleteAccountLoading}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Удалить аккаунт и все данные в сервисе? Действие необратимо.",
                  )
                ) {
                  return;
                }
                setDeleteAccountLoading(true);
                setDeleteAccountError("");
                try {
                  const res = await fetch("/api/auth/delete-account", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ confirm: "DELETE_ACCOUNT_DATA" }),
                  });
                  const data = (await res.json().catch(() => ({}))) as { error?: string };
                  if (!res.ok) {
                    throw new Error(data.error || "Не удалось выполнить удаление.");
                  }
                  window.location.assign("/");
                } catch (err) {
                  setDeleteAccountError(err instanceof Error ? err.message : "Ошибка удаления.");
                } finally {
                  setDeleteAccountLoading(false);
                }
              }}
              className="mt-4 inline-flex items-center justify-center rounded-2xl border border-[#DC2626] bg-white px-5 py-2.5 text-sm font-semibold text-[#B91C1C] transition hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteAccountLoading ? "Удаляю…" : "Удалить аккаунт и данные"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
