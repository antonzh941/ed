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
 * Normalise an answer string for fuzzy comparison.
 * Handles:
 *   "4) Мехико" → "мехико"          (multiple-choice: strip number prefix)
 *   "3, 2, 1"   → "3 2 1"           (sequence: normalise separators)
 *   "А-2, Б-3"  → "а 2 б 3"        (correspondence)
 *   "Финляндия" → "финляндия"       (free text)
 */
function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^\d+[.)]\s*/, "")        // strip leading "4) " or "4. "
    .replace(/[,;\-–— ]+/g, " ")       // normalise separators to single space
    .replace(/[^а-яёa-z0-9\s]/gi, "")  // keep letters, digits, spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract just the leading digit(s) from a multiple-choice answer.
 * "4) Мехико" → "4", "2" → "2"
 */
function extractChoiceNumber(raw: string): string | null {
  const m = raw.trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

/**
 * Returns true if the validator's answer is close enough to the canonical one.
 *
 * Strategy (in order):
 *  1. Exact match after normalisation.
 *  2. Containment: one normalised string contains the other.
 *  3. For multiple-choice: compare just the choice numbers.
 */
function answersMatch(canonical: string, validatorAnswer: string): boolean {
  const a = normalise(canonical);
  const b = normalise(validatorAnswer);

  if (a === b) return true;

  // Compare without internal spaces: "в а б" == "ваб" (sequence of letters)
  const aNoSpace = a.replace(/\s+/g, "");
  const bNoSpace = b.replace(/\s+/g, "");
  if (aNoSpace === bNoSpace) return true;

  // Containment (handles "финляндия" inside "финляндия и эстония")
  if (a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a))) return true;

  // Multiple-choice fallback: "2) Байкал" vs "2"
  const numA = extractChoiceNumber(canonical);
  const numB = extractChoiceNumber(validatorAnswer);
  if (numA && numB && numA === numB) return true;

  return false;
}

// ─── JSON extractor ───────────────────────────────────────────────────────────

/**
 * Extract the first JSON object from an LLM response.
 * Handles: raw JSON, ```json ... ```, ``` ... ```, prose before/after.
 */
function extractJson(text: string): unknown {
  // 1. Try direct parse (model returned clean JSON)
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through */ }

  // 2. Strip markdown code fence: ```json\n{...}\n```
  const fenceMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch { /* fall through */ }
  }

  // 3. Find the outermost {...} in the text (greedy)
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch { /* fall through */ }
  }

  throw new SyntaxError(`No valid JSON object found in LLM response (length=${text.length})`);
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

  // ── 6. Upsert task (safe on retry) ────────────────────────────────────────
  const task = await db.task.upsert({
    where: {
      subjectCode_taskNumber_sourceLabel: {
        subjectCode: subject,
        taskNumber,
        sourceLabel: batchLabel,
      },
    },
    update: {
      conditionMd: parsed.conditionMd,
      answerType: isExtended ? "extended" : "short",
      canonicalAnswer: parsed.canonicalAnswer,
      acceptedAnswers: parsed.acceptedAnswers,
      solutionHint: parsed.solutionHint,
      status: finalStatus,
    },
    create: {
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
