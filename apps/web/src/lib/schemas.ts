import { z } from "zod";

export const examSchema = z.enum(["OGE"]);
export const subjectSchema = z.enum(["russian", "math", "geography", "history"]);
export const taskNumberSchema = z.string().regex(/^\d+(\.\d+)?$/, "Некорректный номер задания");

export const difyLearningRequestSchema = z.object({
  action: z.enum(["generate_task", "explain_task", "socratic_step"]).default("generate_task"),
  exam: examSchema,
  subject: subjectSchema,
  taskNumber: taskNumberSchema,
  taskText: z.string().min(8).max(6000).optional(),
  mode: z.enum(["short", "detailed", "stepByStep"]).optional(),
  studentMessage: z.string().min(1).max(2000).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["student", "assistant"]),
        text: z.string().min(1).max(2000),
      }),
    )
    .max(10)
    .default([]),
  conversationId: z.string().max(200).optional(),
});

export const profileSchema = z.object({
  studentName: z.string().max(120).default(""),
  exam: examSchema,
  subject: subjectSchema,
  classLabel: z.string().max(20).default(""),
  goalScore: z.string().max(10).default(""),
});

export const progressSchema = z.object({
  xp: z.number().int().min(0),
  streak: z.number().int().min(0),
  weeklyGoal: z.number().int().min(1).max(30),
  completedThisWeek: z.number().int().min(0).max(100),
});

export const progressUpdateSchema = z.object({
  telegramUserId: z.string().max(100).optional(),
  profile: profileSchema,
  progress: progressSchema,
  studySession: z
    .object({
      sessionId: z.string().max(100).optional(),
      taskNumber: taskNumberSchema,
      topic: z.string().min(2).max(120).optional(),
      taskText: z.string().min(8).max(12000).optional(),
      explanation: z.string().min(1).max(12000).optional(),
      difyConversationId: z.string().max(200).optional(),
      appendMessages: z
        .array(
          z.object({
            role: z.enum(["student", "assistant"]),
            text: z.string().min(1).max(2000),
          }),
        )
        .max(10)
        .optional(),
    })
    .optional(),
});

// ─── Task bank ────────────────────────────────────────────────────────────────

export const taskQuerySchema = z.object({
  subject: subjectSchema.optional(),
  taskNumber: z.coerce.number().int().min(1).max(35).optional(),
  topicId: z.string().max(40).optional(),
  random: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  page: z.coerce.number().int().min(1).default(1),
});

export const createSessionSchema = z.object({
  taskId: z.string().min(1).max(40),
});

export const patchSessionSchema = z.object({
  status: z.enum(["abandoned"]),
});

export type TaskQuery = z.infer<typeof taskQuerySchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type PatchSessionInput = z.infer<typeof patchSessionSchema>;

// ─── Tutor ─────────────────────────────────────────────────────────────────────

export const tutorRequestSchema = z.object({
  taskId: z.string().min(1).max(40),
  sessionId: z.string().min(1).max(40).optional(),
  studentMessage: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["student", "assistant"]),
        text: z.string().min(1).max(2000),
      }),
    )
    .max(30)
    .default([]),
});

export type TutorRequest = z.infer<typeof tutorRequestSchema>;
export type DifyLearningRequest = z.infer<typeof difyLearningRequestSchema>;
export type ProgressUpdateInput = z.infer<typeof progressUpdateSchema>;
