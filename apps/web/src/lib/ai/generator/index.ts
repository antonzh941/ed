/**
 * Task Generator — генерирует и валидирует задания ОГЭ по географии.
 *
 * Пайплайн:
 *   1. Fetch 2 few-shot examples from the approved task bank.
 *   2. Call Generator (deepseek-reasoner) → raw JSON.
 *   3. Parse & validate JSON with Zod.
 *   4. For short-answer tasks: call Grader (deepseek-reasoner) to solve blind.
 *   5. Compare grader answer vs canonical → approve or reject.
 *   6. Upsert Task with status "approved" or "rejected".
 */

import type { SubjectType } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { gatewayGenerate } from "@/lib/ai/gateway";
import { buildGenerationMessages, buildValidationMessages } from "./prompts";
import { GeneratedTaskSchema } from "./schema";

// ─── constants ────────────────────────────────────────────────────────────────

/**
 * Task numbers that require extended (free-response) answers.
 * Validation is skipped for these — the model answer is trusted as-is.
 */
const EXTENDED_TASK_NUMBERS = new Set([12, 28, 29, 30]);

// ─── answer normaliser ────────────────────────────────────────────────────────

/**
 * Normalise an answer string for fuzzy comparison:
 * lowercase → strip leading "N) " prefix → remove extra punctuation/spaces.
 */
function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^\d+\)\s*/, "")          // strip "4) " prefix
    .replace(/[^а-яёa-z0-9,\s]/gi, "") // keep letters, digits, commas, spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if the validator's answer is close enough to the canonical one.
 * "Close enough" = one normalised string contains the other (covers abbreviations,
 * word order, minor wording differences).
 */
function answersMatch(canonical: string, validatorAnswer: string): boolean {
  const a = normalise(canonical);
  const b = normalise(validatorAnswer);
  return a === b || a.includes(b) || b.includes(a);
}

// ─── JSON extractor ───────────────────────────────────────────────────────────

/**
 * Extract the first JSON object from an LLM response.
 * The model might wrap JSON in markdown code blocks or add prose.
 */
function extractJson(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try to find {...} in the text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new SyntaxError("No JSON object found in LLM response");
  }
}

// ─── main export ──────────────────────────────────────────────────────────────

export interface GenerateAndSaveOptions {
  subject: SubjectType;
  taskNumber: number;
  batchLabel: string;
  /** Langfuse session ID for tracing (no PII). */
  sessionId?: string;
}

export interface GenerateAndSaveResult {
  taskId: string | null;
  status: "approved" | "rejected" | "error";
  reason?: string;
}

export async function generateAndSaveTask(
  opts: GenerateAndSaveOptions,
): Promise<GenerateAndSaveResult> {
  const { subject, taskNumber, batchLabel, sessionId } = opts;
  const db = getPrismaClient();
  if (!db) throw new Error("Database not configured");

  // ── 1. Fetch few-shot examples ──────────────────────────────────────────────
  const examples = await db.task.findMany({
    where: { subjectCode: subject, taskNumber, status: "approved" },
    select: { conditionMd: true, canonicalAnswer: true, sourceLabel: true },
    take: 2,
    orderBy: { createdAt: "asc" },
  });

  // ── 2. Generate task ────────────────────────────────────────────────────────
  const genMessages = buildGenerationMessages({
    subject,
    taskNumber,
    examples,
  });

  const genResult = await gatewayGenerate({
    role: "generator",
    messages: genMessages,
    sessionId,
    subject: String(subject),
    taskNumber: String(taskNumber),
  });

  // ── 3. Parse JSON ───────────────────────────────────────────────────────────
  let parsed;
  try {
    const raw = extractJson(genResult.text);
    parsed = GeneratedTaskSchema.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[generator] JSON parse failed (type=${taskNumber}): ${reason}`);
    return { taskId: null, status: "error", reason: `parse: ${reason}` };
  }

  const isExtended = EXTENDED_TASK_NUMBERS.has(taskNumber);

  // ── 4 & 5. Validate (short tasks only) ────────────────────────────────────
  let finalStatus: "approved" | "rejected" = "approved";
  let rejectionReason: string | undefined;

  if (!isExtended) {
    const valMessages = buildValidationMessages(parsed.conditionMd);

    const valResult = await gatewayGenerate({
      role: "grader",
      messages: valMessages,
      sessionId,
      subject: String(subject),
      taskNumber: String(taskNumber),
    });

    const validatorAnswer = valResult.text.split("\n")[0].trim();
    const matched = answersMatch(parsed.canonicalAnswer, validatorAnswer);

    if (!matched) {
      finalStatus = "rejected";
      rejectionReason =
        `validator="${validatorAnswer}" canonical="${parsed.canonicalAnswer}"`;
      console.warn(
        `[generator] validation mismatch (type=${taskNumber}): ${rejectionReason}`,
      );
    }
  }

  // ── 6. Upsert task ─────────────────────────────────────────────────────────
  const task = await db.task.create({
    data: {
      subjectCode: subject,
      taskNumber,
      sourceLabel: batchLabel,
      conditionMd: parsed.conditionMd,
      answerType: isExtended ? "extended" : "short",
      canonicalAnswer: parsed.canonicalAnswer,
      acceptedAnswers: parsed.acceptedAnswers,
      solutionHint: parsed.solutionHint,
      status: finalStatus,
    },
    select: { id: true },
  });

  return { taskId: task.id, status: finalStatus, reason: rejectionReason };
}
