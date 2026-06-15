import type { ExamCode, SubjectCode } from "@/lib/task-blueprints";

export type Exam = ExamCode;
export type Subject = SubjectCode;
export type ExplanationMode = "short" | "detailed" | "stepByStep";

export type Profile = {
  studentName: string;
  exam: Exam;
  subject: Subject;
  classLabel: string;
  goalScore: string;
};

export type ChatMessage = {
  role: "student" | "assistant";
  text: string;
};

export type ProgressSnapshot = {
  xp: number;
  streak: number;
  weeklyGoal: number;
  completedThisWeek: number;
};

export type LessonState = {
  taskNumber: string;
  explanationMode: ExplanationMode;
  generatedTask: string;
  generationConversationId: string | null;
  teachingConversationId: string | null;
  explanation: string;
  chat: ChatMessage[];
  studentMessage: string;
};

export type SystemStatus = {
  aiEnabled: boolean;
  databaseEnabled: boolean;
  paymentsEnabled: boolean;
  /** Только в dev / при EXPOSE_STATUS_DEBUG. */
  database?: {
    connected: boolean;
    error: string | null;
    provider: string;
  };
  payments?: {
    provider: "yookassa";
    tariffLabel: string;
    amountRub: number;
  };
  missingEnv?: string[];
  rag?: {
    chunks: number;
    sources: number;
  };
};

export type ProgressSyncResponse = {
  ok: boolean;
  database?: boolean;
  studySessionId?: string | null;
};

export type TelegramAuthState =
  | {
      status: "idle" | "loading";
      user: null;
      platform: string | null;
      message: string;
    }
  | {
      status: "connected";
      user: {
        id: number;
        username?: string;
        first_name?: string;
        last_name?: string;
      };
      platform: string | null;
      message: string;
    }
  | {
      status: "error";
      user: null;
      platform: string | null;
      message: string;
    };

/** Публичная сессия для клиента (без внутренних идентификаторов и email). */
export type AuthSessionPublic = {
  provider: "vk" | "yandex";
  displayName: string | null;
};

export type DashboardSummary = {
  profile: Profile;
  progress: ProgressSnapshot;
  entitlements: {
    cyclesBalance: number;
  };
  overview: {
    totalSessions: number;
    explainedSessions: number;
    totalMessages: number;
    activeDays: number;
    strongestSubject: string | null;
    lastActivityAt: string | null;
  };
  subjectStats: Array<{
    subject: Subject;
    label: string;
    sessionsCount: number;
    explainedCount: number;
    messagesCount: number;
    completionRate: number;
    lastActivityAt: string | null;
  }>;
  weakTopics: Array<{
    subject: Subject;
    subjectLabel: string;
    topic: string;
    sessionsCount: number;
    explainedCount: number;
    messagesCount: number;
    completionRate: number;
    reviewScore: number;
    lastTaskNumber: string;
    lastActivityAt: string | null;
  }>;
  weeklyPlan: {
    weeklyGoal: number;
    completedThisWeek: number;
    remainingThisWeek: number;
    focusSubjects: Array<{
      subject: Subject;
      label: string;
      targetSessions: number;
      completedSessions: number;
      remainingSessions: number;
    }>;
    topicGoals: Array<{
      subject: Subject;
      subjectLabel: string;
      topic: string;
      taskNumber: string;
      suggestedSessions: number;
    }>;
    actions: Array<{
      title: string;
      description: string;
    }>;
  };
  recommendations: Array<{
    id: string;
    subject: Subject;
    subjectLabel: string;
    topic: string;
    taskNumber: string;
    title: string;
    description: string;
    actionLabel: string;
    priority: number;
  }>;
  achievements: Array<{
    code: string;
    title: string;
    description: string;
    progress: number;
    currentValue: number;
    targetValue: number;
    earned: boolean;
    earnedAt: string | null;
  }>;
  recentSessions: Array<{
    id: string;
    exam: Exam;
    subject: Subject;
    taskNumber: string;
    topic: string;
    taskText: string;
    difyConversationId: string | null;
    explanation: string | null;
    createdAt: string;
    updatedAt: string;
    messagesCount: number;
    messages: Array<{
      id: string;
      role: "student" | "assistant";
      text: string;
      createdAt: string;
    }>;
  }>;
};

export const defaultProfile: Profile = {
  studentName: "",
  exam: "OGE",
  subject: "russian",
  classLabel: "9",
  goalScore: "80",
};

export const defaultProgress: ProgressSnapshot = {
  xp: 120,
  streak: 4,
  weeklyGoal: 7,
  completedThisWeek: 3,
};

export const defaultLessonState: LessonState = {
  taskNumber: "1",
  explanationMode: "detailed",
  generatedTask: "",
  generationConversationId: null,
  teachingConversationId: null,
  explanation: "",
  chat: [],
  studentMessage: "",
};
