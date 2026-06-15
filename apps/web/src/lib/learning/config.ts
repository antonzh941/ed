import { getDefaultTaskNumber, type SubjectCode } from "@/lib/task-blueprints";

import type { ExplanationMode, ProgressSnapshot, Subject } from "@/lib/learning/contracts";

export const subjectLabels: Record<Subject, string> = {
  russian: "Русский язык",
  math: "Математика",
  geography: "География",
  history: "История",
};

export const supportedSubjects = [
  "russian",
  "math",
  "geography",
  "history",
] as const satisfies readonly SubjectCode[];

export const subjectOptions = supportedSubjects.map((subject) => ({
  value: subject,
  label: subjectLabels[subject],
}));

export const explanationModeOptions: Array<{
  value: ExplanationMode;
  label: string;
}> = [
  { value: "short", label: "Кратко" },
  { value: "detailed", label: "Подробно" },
  { value: "stepByStep", label: "По шагам" },
];

export function normalizeStoredProfile(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<{
    studentName: string;
    exam: string;
    subject: Subject;
    classLabel: string;
    goalScore: string;
  }>;

  const subject =
    typeof candidate.subject === "string" && candidate.subject in subjectLabels
      ? candidate.subject
      : "russian";

  return {
    studentName: typeof candidate.studentName === "string" ? candidate.studentName : "",
    exam: "OGE" as const,
    subject,
    classLabel: typeof candidate.classLabel === "string" ? candidate.classLabel : "9",
    goalScore: typeof candidate.goalScore === "string" ? candidate.goalScore : "80",
  };
}

export function buildProgressSnapshot(
  xp: number,
  streak: number,
  weeklyGoal: number,
  completedThisWeek: number,
): ProgressSnapshot {
  return {
    xp,
    streak,
    weeklyGoal,
    completedThisWeek,
  };
}

export function getInitialTaskNumber(subject: Subject) {
  return getDefaultTaskNumber("OGE", subject);
}

export function formatDashboardDate(value: string | null) {
  if (!value) {
    return "Ещё нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

export function formatSessionDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
