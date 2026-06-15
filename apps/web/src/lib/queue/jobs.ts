import type { SubjectType } from "@prisma/client";

export const TASK_GENERATION_QUEUE = "task-generation";

/** Payload for a single task-generation job. */
export interface GenerateTaskJobData {
  /** ОГЭ subject code. */
  subject: SubjectType;
  /**
   * Task type number within the exam (1–30 for geography, etc.).
   * Maps 1:1 to Task.taskNumber in the DB.
   */
  taskNumber: number;
  /**
   * Shared label for this generation run — becomes Task.sourceLabel.
   * Format: "AI-YYYYMMDD-NNN"
   */
  batchLabel: string;
}

/** Result stored in the job's returnValue. */
export interface GenerateTaskJobResult {
  taskId: string | null;
  status: "approved" | "rejected" | "error";
  reason?: string;
}
