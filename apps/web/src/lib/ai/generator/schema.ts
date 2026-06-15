import { z } from "zod";

/**
 * JSON schema that the Generator LLM must output.
 * The model receives this structure description in its system prompt.
 */
export const GeneratedTaskSchema = z.object({
  /** Full task condition in Markdown (may include numbered options). */
  conditionMd: z.string().min(20).max(4000),
  /**
   * The single canonical correct answer.
   * For multiple-choice: "4) Мехико"
   * For sequence: "3, 2, 1"
   * For open-ended: concise model answer.
   */
  canonicalAnswer: z.string().min(1).max(800),
  /**
   * Alternative accepted answer strings (without the canonical one).
   * E.g. ["Мехико"] for a multiple-choice where "4) Мехико" is canonical.
   */
  acceptedAnswers: z.array(z.string().max(200)).max(6).default([]),
  /**
   * First-level hint for the student tutor — must NOT reveal the answer.
   * 1-2 sentences pointing toward the right reasoning path.
   */
  solutionHint: z.string().min(10).max(400),
});

export type GeneratedTask = z.infer<typeof GeneratedTaskSchema>;
