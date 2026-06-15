import { getPrismaClient } from "@/lib/prisma";

type ExamType = "OGE";
type SubjectType = "russian" | "math" | "geography" | "history";

type ProfileInput = {
  studentName: string;
  exam: ExamType;
  subject: SubjectType;
  classLabel: string;
  goalScore: string;
};

type ProgressInput = {
  xp: number;
  streak: number;
  weeklyGoal: number;
  completedThisWeek: number;
};

type ChatMessageInput = {
  role: "student" | "assistant";
  text: string;
};

const subjectLabels: Record<SubjectType, string> = {
  russian: "Русский язык",
  math: "Математика",
  geography: "География",
  history: "История",
};

const recommendationTemplates: Record<
  SubjectType,
  (taskNumber: string) => { title: string; description: string; actionLabel: string }
> = {
  russian: (taskNumber) => ({
    title: `Вернитесь к заданию № ${taskNumber}`,
    description:
      "По русскому языку полезно ещё раз разобрать формат, увидеть типичные ловушки и решить 2-3 похожих задания подряд.",
    actionLabel: "Повторить номер",
  }),
  math: (taskNumber) => ({
    title: `Укрепите задание № ${taskNumber}`,
    description:
      "По математике стоит заново разобрать алгоритм решения и закрепить его на нескольких заданиях одного формата.",
    actionLabel: "Сделать ещё вариант",
  }),
  geography: (taskNumber) => ({
    title: `Повторите задание № ${taskNumber}`,
    description:
      "По географии полезно ещё раз разобрать карту или тему и решить похожий номер.",
    actionLabel: "Повторить номер",
  }),
  history: (taskNumber) => ({
    title: `Освежите задание № ${taskNumber}`,
    description:
      "По истории полезно ещё раз закрепить формат и типовые связи перед следующей сессией.",
    actionLabel: "Повторить номер",
  }),
};

type AchievementRule = {
  code: string;
  title: string;
  description: string;
  target: number;
  kind: "sessions" | "explained" | "messages" | "streak" | "xp" | "subjectMastery" | "weeklyGoal";
};

type GamificationStats = {
  totalSessions: number;
  explainedSessions: number;
  totalMessages: number;
  streak: number;
  xp: number;
  completedThisWeek: number;
  weeklyGoal: number;
  maxSubjectSessions: number;
};

const achievementRules: AchievementRule[] = [
  {
    code: "first_task",
    title: "Первый шаг",
    description: "Сгенерировать первое задание и начать подготовку.",
    target: 1,
    kind: "sessions",
  },
  {
    code: "first_explanation",
    title: "Разобрался",
    description: "Получить первый разбор задания.",
    target: 1,
    kind: "explained",
  },
  {
    code: "socratic_dialogue",
    title: "В диалоге",
    description: "Написать 5 сообщений наставнику в режиме Сократа.",
    target: 5,
    kind: "messages",
  },
  {
    code: "three_day_streak",
    title: "Три дня подряд",
    description: "Заниматься 3 дня без пропусков.",
    target: 3,
    kind: "streak",
  },
  {
    code: "week_rhythm",
    title: "Ритм недели",
    description: "Закрыть недельную цель по занятиям.",
    target: 1,
    kind: "weeklyGoal",
  },
  {
    code: "subject_focus",
    title: "Фокус на предмете",
    description: "Пройти 10 занятий по одному предмету.",
    target: 10,
    kind: "subjectMastery",
  },
  {
    code: "level_five",
    title: "Уровень 5",
    description: "Набрать 600 XP за регулярную работу.",
    target: 600,
    kind: "xp",
  },
  {
    code: "exam_sprint",
    title: "Экзаменационный спринт",
    description: "Пройти 25 учебных сессий.",
    target: 25,
    kind: "sessions",
  },
];

function parseGoalScore(goalScore: string) {
  const normalized = Number.parseInt(goalScore, 10);
  return Number.isFinite(normalized) ? normalized : null;
}

function getWeekStart(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function calculateCurrentStreak(activityDates: Date[]) {
  const activeDays = new Set(activityDates.map((date) => date.toISOString().slice(0, 10)));
  if (activeDays.size === 0) {
    return 0;
  }

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  if (!activeDays.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getAchievementValue(rule: AchievementRule, stats: GamificationStats) {
  switch (rule.kind) {
    case "sessions":
      return stats.totalSessions;
    case "explained":
      return stats.explainedSessions;
    case "messages":
      return stats.totalMessages;
    case "streak":
      return stats.streak;
    case "xp":
      return stats.xp;
    case "subjectMastery":
      return stats.maxSubjectSessions;
    case "weeklyGoal":
      return stats.weeklyGoal > 0 && stats.completedThisWeek >= stats.weeklyGoal ? 1 : 0;
  }
}

async function ensureAchievementCatalog(prisma: ReturnType<typeof requirePrisma>) {
  await Promise.all(
    achievementRules.map((rule) =>
      prisma.achievement.upsert({
        where: {
          code: rule.code,
        },
        create: {
          code: rule.code,
          title: rule.title,
          description: rule.description,
        },
        update: {
          title: rule.title,
          description: rule.description,
        },
      }),
    ),
  );
}

async function awardEarnedAchievements(
  prisma: ReturnType<typeof requirePrisma>,
  userId: string,
  stats: GamificationStats,
) {
  await ensureAchievementCatalog(prisma);
  const achievements = await prisma.achievement.findMany({
    where: {
      code: {
        in: achievementRules.map((rule) => rule.code),
      },
    },
  });
  const achievementByCode = new Map<string, { id: string; code: string }>(
    achievements.map((achievement: { id: string; code: string }) => [achievement.code, achievement]),
  );
  const earnedRules = achievementRules.filter((rule) => getAchievementValue(rule, stats) >= rule.target);

  await Promise.all(
    earnedRules.map((rule) => {
      const achievement = achievementByCode.get(rule.code);
      if (!achievement) {
        return Promise.resolve();
      }

      return prisma.userAchievement.upsert({
        where: {
          userId_achievementId: {
            userId,
            achievementId: achievement.id,
          },
        },
        create: {
          userId,
          achievementId: achievement.id,
        },
        update: {},
      });
    }),
  );
}

function requirePrisma() {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL не настроен.");
  }

  return prisma;
}

export async function getDatabaseHealth() {
  try {
    const prisma = requirePrisma();
    await prisma.$queryRaw`SELECT 1`;

    return {
      connected: true,
      error: null,
      provider: "postgresql",
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Database connection failed",
      provider: "postgresql",
    };
  }
}

export async function upsertUserProfile(input: {
  appUserKey: string;
  telegramUserId?: string;
  profile: ProfileInput;
  progress: ProgressInput;
}) {
  const prisma = requirePrisma();
  return prisma.user.upsert({
    where: {
      appUserKey: input.appUserKey,
    },
    create: {
      appUserKey: input.appUserKey,
      telegramUserId: input.telegramUserId,
      displayName: input.profile.studentName || null,
      exam: input.profile.exam,
      subject: input.profile.subject,
      classLabel: input.profile.classLabel || null,
      goalScore: parseGoalScore(input.profile.goalScore),
      xp: input.progress.xp,
      streak: input.progress.streak,
      weeklyGoal: input.progress.weeklyGoal,
      completedThisWeek: input.progress.completedThisWeek,
    },
    update: {
      telegramUserId: input.telegramUserId,
      displayName: input.profile.studentName || null,
      exam: input.profile.exam,
      subject: input.profile.subject,
      classLabel: input.profile.classLabel || null,
      goalScore: parseGoalScore(input.profile.goalScore),
      xp: input.progress.xp,
      streak: input.progress.streak,
      weeklyGoal: input.progress.weeklyGoal,
      completedThisWeek: input.progress.completedThisWeek,
    },
  });
}

export async function createStudySession(input: {
  userId: string;
  exam: ExamType;
  subject: SubjectType;
  taskNumber: string;
  topic: string;
  taskText: string;
  difyConversationId?: string;
}) {
  const prisma = requirePrisma();
  return prisma.studySession.create({
    data: {
      userId: input.userId,
      exam: input.exam,
      subject: input.subject,
      taskNumber: input.taskNumber,
      topic: input.topic,
      taskText: input.taskText,
      difyConversationId: input.difyConversationId,
    },
  });
}

export async function updateStudySession(input: {
  sessionId: string;
  userId: string;
  explanation?: string;
  difyConversationId?: string;
  appendMessages?: ChatMessageInput[];
}) {
  const prisma = requirePrisma();
  const owned = await prisma.studySession.findFirst({
    where: { id: input.sessionId, userId: input.userId },
    select: { id: true },
  });
  if (!owned) {
    return null;
  }

  if (
    !input.explanation &&
    !input.difyConversationId &&
    (!input.appendMessages || input.appendMessages.length === 0)
  ) {
    return prisma.studySession.findUnique({
      where: {
        id: input.sessionId,
      },
    });
  }

  return prisma.studySession.update({
    where: {
      id: input.sessionId,
    },
    data: {
      explanation: input.explanation,
      difyConversationId: input.difyConversationId,
      chatMessages: input.appendMessages?.length
        ? {
            create: input.appendMessages.map((message) => ({
              role: message.role,
              text: message.text,
            })),
          }
        : undefined,
    },
    include: {
      chatMessages: true,
    },
  });
}

export async function getDashboardSummary(appUserKey: string) {
  const prisma = requirePrisma();
  const user = await prisma.user.findUnique({
    where: {
      appUserKey,
    },
  });

  if (!user) {
    return null;
  }

  const allSessions = await prisma.studySession.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      chatMessages: {
        select: {
          id: true,
        },
      },
    },
  });

  const recentSessions = await prisma.studySession.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 6,
    include: {
      chatMessages: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
  type AllSession = (typeof allSessions)[number];
  type RecentSession = (typeof recentSessions)[number];
  type TopicStatAccumulator = {
    subject: SubjectType;
    topic: string;
    sessionsCount: number;
    explainedCount: number;
    messagesCount: number;
    lastTaskNumber: string;
    lastActivityAt: Date;
  };

  const explainedSessions = allSessions.filter((session: AllSession) =>
    Boolean(session.explanation?.trim()),
  );
  const totalMessages = allSessions.reduce(
    (sum: number, session: AllSession) => sum + session.chatMessages.length,
    0,
  );
  const activeDays = new Set(
    allSessions.map((session: AllSession) => session.updatedAt.toISOString().slice(0, 10)),
  ).size;
  const currentStreak = allSessions.length
    ? calculateCurrentStreak(allSessions.map((session: AllSession) => session.updatedAt))
    : user.streak;
  const weekStart = getWeekStart();
  const completedThisWeek = allSessions.filter(
    (session: AllSession) => session.createdAt >= weekStart,
  ).length;

  const subjectStats = (Object.keys(subjectLabels) as SubjectType[]).map((subject) => {
    const sessions = allSessions.filter((session: AllSession) => session.subject === subject);
    const messagesCount = sessions.reduce(
      (sum: number, session: AllSession) => sum + session.chatMessages.length,
      0,
    );
    const explainedCount = sessions.filter((session: AllSession) =>
      Boolean(session.explanation?.trim()),
    ).length;
    const lastActivityAt = sessions[0]?.updatedAt ?? null;

    return {
      subject,
      label: subjectLabels[subject],
      sessionsCount: sessions.length,
      explainedCount,
      messagesCount,
      completionRate:
        sessions.length > 0 ? Math.round((explainedCount / sessions.length) * 100) : 0,
      lastActivityAt,
    };
  });
  const maxSubjectSessions = Math.max(0, ...subjectStats.map((item) => item.sessionsCount));
  const gamificationStats: GamificationStats = {
    totalSessions: allSessions.length,
    explainedSessions: explainedSessions.length,
    totalMessages,
    streak: currentStreak,
    xp: user.xp,
    completedThisWeek,
    weeklyGoal: user.weeklyGoal,
    maxSubjectSessions,
  };
  await awardEarnedAchievements(prisma, user.id, gamificationStats);
  const earnedAchievements = await prisma.userAchievement.findMany({
    where: {
      userId: user.id,
    },
    include: {
      achievement: true,
    },
    orderBy: {
      earnedAt: "desc",
    },
  });
  const earnedByCode = new Map(
    earnedAchievements.map((item) => [item.achievement.code, item.earnedAt]),
  );

  if (user.streak !== currentStreak || user.completedThisWeek !== completedThisWeek) {
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        streak: currentStreak,
        completedThisWeek,
      },
    });
  }

  const strongestSubject =
    [...subjectStats]
      .filter((item) => item.sessionsCount > 0)
      .sort((left, right) => {
        if (right.sessionsCount !== left.sessionsCount) {
          return right.sessionsCount - left.sessionsCount;
        }

        return right.messagesCount - left.messagesCount;
      })[0] ?? null;

  const topicStatsEntries = Array.from(
    allSessions.reduce((map: Map<string, TopicStatAccumulator>, session: AllSession) => {
      const key = `${session.subject}:${session.taskNumber}`;
      const existing = map.get(key) ?? {
        subject: session.subject,
        topic: `Задание № ${session.taskNumber}`,
        sessionsCount: 0,
        explainedCount: 0,
        messagesCount: 0,
        lastTaskNumber: session.taskNumber,
        lastActivityAt: session.updatedAt,
      };

      existing.sessionsCount += 1;
      existing.messagesCount += session.chatMessages.length;
      existing.explainedCount += session.explanation?.trim() ? 1 : 0;

      if (session.updatedAt > existing.lastActivityAt) {
        existing.lastActivityAt = session.updatedAt;
        existing.lastTaskNumber = session.taskNumber;
      }

      map.set(key, existing);
      return map;
    }, new Map<string, TopicStatAccumulator>()),
  ) as Array<[string, TopicStatAccumulator]>;
  const topicStats = topicStatsEntries
    .map(([, item]: [string, TopicStatAccumulator]) => {
      const reviewScore =
        item.sessionsCount * 3 + item.messagesCount * 2 - item.explainedCount * 2;

      return {
        ...item,
        reviewScore,
        label: subjectLabels[item.subject],
        completionRate:
          item.sessionsCount > 0
            ? Math.round((item.explainedCount / item.sessionsCount) * 100)
            : 0,
      };
    })
    .sort((left, right) => {
      if (right.reviewScore !== left.reviewScore) {
        return right.reviewScore - left.reviewScore;
      }

      return right.lastActivityAt.getTime() - left.lastActivityAt.getTime();
    });

  const weakTopics = topicStats.slice(0, 4);
  const recommendations = weakTopics.map((topicItem, index) => {
    const template = recommendationTemplates[topicItem.subject](topicItem.lastTaskNumber);

    return {
      id: `${topicItem.subject}-${topicItem.lastTaskNumber}-${index + 1}`,
      subject: topicItem.subject,
      subjectLabel: topicItem.label,
      topic: topicItem.topic,
      taskNumber: topicItem.lastTaskNumber,
      title: template.title,
      description: template.description,
      actionLabel: template.actionLabel,
      priority: index + 1,
    };
  });
  const remainingThisWeek = Math.max(0, user.weeklyGoal - completedThisWeek);
  const focusSubjectCandidates = [
    ...new Set([
      ...weakTopics.map((item) => item.subject),
      strongestSubject
        ? subjectStats.find((item) => item.label === strongestSubject.label)?.subject
        : null,
      user.subject,
    ]),
  ].filter((value): value is SubjectType => Boolean(value));
  const focusSubjects = focusSubjectCandidates.slice(0, 3).map((subject, index, array) => {
    const stat = subjectStats.find((item) => item.subject === subject);
    const targetSessions =
      remainingThisWeek > 0
        ? Math.max(
            1,
            Math.floor(
              (remainingThisWeek + (array.length - index - 1)) / Math.max(array.length, 1),
            ),
          )
        : 0;

    return {
      subject,
      label: subjectLabels[subject],
      targetSessions,
      completedSessions: stat?.sessionsCount ?? 0,
      remainingSessions: targetSessions,
    };
  });
  const weeklyTopicGoals = weakTopics.slice(0, 3).map((item, index) => ({
    subject: item.subject,
    subjectLabel: item.label,
    topic: item.topic,
    taskNumber: item.lastTaskNumber,
    suggestedSessions:
      remainingThisWeek > 1 && index === 0 ? 2 : remainingThisWeek > 0 ? 1 : 0,
  }));
  const weeklyActions = [
    remainingThisWeek > 0
      ? {
          title: `Закрыть ещё ${remainingThisWeek} сессии на этой неделе`,
          description:
            "Сфокусируйтесь на коротких, но регулярных занятиях: генерация задания, разбор и один шаг в режиме Сократа уже засчитываются в прогресс.",
        }
      : {
          title: "Недельная цель уже выполнена",
          description:
            "Можно перейти в режим усиления: добить слабые номера, где было больше всего повторов и диалога.",
        },
    weeklyTopicGoals[0]
      ? {
          title: `Взять в фокус задание № ${weeklyTopicGoals[0].taskNumber}`,
          description: `Лучший кандидат на ближайший повтор: ${weeklyTopicGoals[0].subjectLabel}, номер ${weeklyTopicGoals[0].taskNumber}.`,
        }
      : {
          title: "Добавить больше учебных сессий",
          description:
            "Когда накопится история занятий, кабинет начнёт точнее подсказывать следующий учебный маршрут.",
        },
  ];

  return {
    profile: {
      studentName: user.displayName ?? "",
      exam: user.exam,
      subject: user.subject,
      classLabel: user.classLabel ?? "",
      goalScore: user.goalScore?.toString() ?? "",
    },
    progress: {
      xp: user.xp,
      streak: currentStreak,
      weeklyGoal: user.weeklyGoal,
      completedThisWeek,
    },
    entitlements: {
      cyclesBalance: user.cyclesBalance,
    },
    overview: {
      totalSessions: allSessions.length,
      explainedSessions: explainedSessions.length,
      totalMessages,
      activeDays,
      strongestSubject: strongestSubject?.label ?? null,
      lastActivityAt: allSessions[0]?.updatedAt ?? null,
    },
    subjectStats,
    weakTopics: weakTopics.map((item) => ({
      subject: item.subject,
      subjectLabel: item.label,
      topic: item.topic,
      sessionsCount: item.sessionsCount,
      explainedCount: item.explainedCount,
      messagesCount: item.messagesCount,
      completionRate: item.completionRate,
      reviewScore: item.reviewScore,
      lastTaskNumber: item.lastTaskNumber,
      lastActivityAt: item.lastActivityAt,
    })),
    weeklyPlan: {
      weeklyGoal: user.weeklyGoal,
      completedThisWeek,
      remainingThisWeek,
      focusSubjects,
      topicGoals: weeklyTopicGoals,
      actions: weeklyActions,
    },
    achievements: achievementRules.map((rule) => {
      const value = getAchievementValue(rule, gamificationStats);
      const progress = Math.min(100, Math.round((value / rule.target) * 100));
      const earnedAt = earnedByCode.get(rule.code) ?? null;

      return {
        code: rule.code,
        title: rule.title,
        description: rule.description,
        progress,
        currentValue: Math.min(value, rule.target),
        targetValue: rule.target,
        earned: Boolean(earnedAt),
        earnedAt,
      };
    }),
    recommendations,
    recentSessions: recentSessions.map((session: RecentSession) => ({
      id: session.id,
      exam: session.exam,
      subject: session.subject,
      taskNumber: session.taskNumber,
      topic: session.topic,
      taskText: session.taskText,
      difyConversationId: session.difyConversationId,
      explanation: session.explanation,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messagesCount: session.chatMessages.length,
      messages: session.chatMessages.map((message: RecentSession["chatMessages"][number]) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        createdAt: message.createdAt,
      })),
    })),
  };
}
