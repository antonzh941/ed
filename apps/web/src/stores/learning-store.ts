import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  defaultLessonState,
  defaultProfile,
  defaultProgress,
  type DashboardSummary,
  type LessonState,
  type Profile,
  type ProgressSnapshot,
  type Subject,
} from "@/lib/learning/contracts";
import {
  getInitialTaskNumber,
  normalizeStoredProfile,
} from "@/lib/learning/config";

type AppView = "dashboard" | "lesson";

type LearningStore = {
  hasHydrated: boolean;
  appUserKey: string;
  telegramUserId: string | null;
  studySessionId: string | null;
  activeView: AppView;
  profile: Profile;
  progress: ProgressSnapshot;
  lesson: LessonState;
  setHydrated: (value: boolean) => void;
  ensureAppUserKey: () => void;
  hydrateFromLegacyStorage: () => void;
  setTelegramIdentity: (input: { telegramUserId: string | null; appUserKey?: string }) => void;
  setActiveView: (view: AppView) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  setSubject: (subject: Subject) => void;
  setProgress: (patch: Partial<ProgressSnapshot>) => void;
  setLessonPatch: (patch: Partial<LessonState>) => void;
  resetLesson: () => void;
  startGeneratedSession: (input: {
    taskNumber: string;
    generatedTask: string;
    conversationId?: string | null;
  }) => void;
  setExplanation: (content: string) => void;
  appendChat: (messages: LessonState["chat"]) => void;
  setStudySessionId: (sessionId: string | null) => void;
  focusTask: (input: { subject: Subject; taskNumber: string }) => void;
  openRecentSession: (session: DashboardSummary["recentSessions"][number]) => void;
};

const LEGACY_KEYS = {
  appUserKey: "ai-tutor-app-user-key",
  telegramUserId: "ai-tutor-telegram-user-id",
  profile: "ai-tutor-profile",
  progress: "ai-tutor-progress",
  studySessionId: "ai-tutor-study-session-id",
};

function getStorage() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

function buildDefaultLesson(subject: Subject): LessonState {
  return {
    ...defaultLessonState,
    taskNumber: getInitialTaskNumber(subject),
  };
}

export const useLearningStore = create<LearningStore>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      appUserKey: "",
      telegramUserId: null,
      studySessionId: null,
      activeView: "dashboard",
      profile: defaultProfile,
      progress: defaultProgress,
      lesson: buildDefaultLesson(defaultProfile.subject),
      setHydrated: (value) => set({ hasHydrated: value }),
      ensureAppUserKey: () => {
        if (get().appUserKey || typeof window === "undefined") {
          return;
        }

        set({ appUserKey: window.crypto.randomUUID() });
      },
      hydrateFromLegacyStorage: () => {
        const storage = getStorage();

        if (!storage) {
          return;
        }

        const nextState: Partial<LearningStore> = {};

        const legacyAppUserKey = storage.getItem(LEGACY_KEYS.appUserKey);
        if (legacyAppUserKey && !get().appUserKey) {
          nextState.appUserKey = legacyAppUserKey;
        }

        const legacyTelegramUserId = storage.getItem(LEGACY_KEYS.telegramUserId);
        if (legacyTelegramUserId && !get().telegramUserId) {
          nextState.telegramUserId = legacyTelegramUserId;
        }

        const legacyProfile = storage.getItem(LEGACY_KEYS.profile);
        if (legacyProfile) {
          const parsedProfile = normalizeStoredProfile(JSON.parse(legacyProfile));

          if (parsedProfile) {
            nextState.profile = parsedProfile;
            nextState.lesson = {
              ...get().lesson,
              taskNumber: getInitialTaskNumber(parsedProfile.subject),
            };
          }
        }

        const legacyProgress = storage.getItem(LEGACY_KEYS.progress);
        if (legacyProgress) {
          const parsedProgress = JSON.parse(legacyProgress) as Partial<ProgressSnapshot>;
          nextState.progress = {
            xp: parsedProgress.xp ?? defaultProgress.xp,
            streak: parsedProgress.streak ?? defaultProgress.streak,
            weeklyGoal: parsedProgress.weeklyGoal ?? defaultProgress.weeklyGoal,
            completedThisWeek:
              parsedProgress.completedThisWeek ?? defaultProgress.completedThisWeek,
          };
        }

        const legacyStudySessionId = storage.getItem(LEGACY_KEYS.studySessionId);
        if (legacyStudySessionId && !get().studySessionId) {
          nextState.studySessionId = legacyStudySessionId;
        }

        if (Object.keys(nextState).length > 0) {
          set(nextState);
        }
      },
      setTelegramIdentity: ({ telegramUserId, appUserKey }) =>
        set({
          telegramUserId,
          appUserKey: appUserKey ?? get().appUserKey,
        }),
      setActiveView: (activeView) => set({ activeView }),
      updateProfile: (patch) =>
        set((state) => ({
          profile: {
            ...state.profile,
            ...patch,
          },
        })),
      setSubject: (subject) =>
        set((state) => ({
          profile: {
            ...state.profile,
            exam: "OGE",
            subject,
          },
          lesson: buildDefaultLesson(subject),
          studySessionId: null,
          activeView: "lesson",
        })),
      setProgress: (patch) =>
        set((state) => ({
          progress: {
            ...state.progress,
            ...patch,
          },
        })),
      setLessonPatch: (patch) =>
        set((state) => ({
          lesson: {
            ...state.lesson,
            ...patch,
          },
        })),
      resetLesson: () =>
        set((state) => ({
          lesson: buildDefaultLesson(state.profile.subject),
          studySessionId: null,
        })),
      startGeneratedSession: ({ taskNumber, generatedTask, conversationId }) =>
        set((state) => ({
          lesson: {
            ...state.lesson,
            taskNumber,
            generatedTask,
            generationConversationId: conversationId ?? null,
            teachingConversationId: null,
            explanation: "",
            chat: [],
            studentMessage: "",
          },
          studySessionId: null,
          activeView: "lesson",
        })),
      setExplanation: (content) =>
        set((state) => ({
          lesson: {
            ...state.lesson,
            explanation: content,
          },
        })),
      appendChat: (messages) =>
        set((state) => ({
          lesson: {
            ...state.lesson,
            chat: [...state.lesson.chat, ...messages],
            studentMessage: "",
          },
        })),
      setStudySessionId: (studySessionId) => set({ studySessionId }),
      focusTask: ({ subject, taskNumber }) =>
        set((state) => ({
          profile: {
            ...state.profile,
            exam: "OGE",
            subject,
          },
          lesson: {
            ...buildDefaultLesson(subject),
            taskNumber,
          },
          studySessionId: null,
          activeView: "lesson",
        })),
      openRecentSession: (session) =>
        set((state) => ({
          profile: {
            ...state.profile,
            exam: session.exam,
            subject: session.subject,
          },
          lesson: {
            ...state.lesson,
            taskNumber: session.taskNumber,
            generatedTask: session.taskText,
            generationConversationId: session.difyConversationId,
            teachingConversationId: null,
            explanation: session.explanation ?? "",
            chat: session.messages.map((message) => ({
              role: message.role,
              text: message.text,
            })),
            studentMessage: "",
          },
          studySessionId: session.id,
          activeView: "lesson",
        })),
    }),
    {
      name: "sokratai-web-state",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        appUserKey: state.appUserKey,
        telegramUserId: state.telegramUserId,
        studySessionId: state.studySessionId,
        activeView: state.activeView,
        profile: state.profile,
        progress: state.progress,
        lesson: state.lesson,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
