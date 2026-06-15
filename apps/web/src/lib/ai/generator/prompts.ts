import fs from "node:fs";
import path from "node:path";

import type { SubjectType } from "@prisma/client";

import type { GatewayMessage } from "@/lib/ai/gateway";
import { getTaskBlueprintSummary } from "@/lib/task-blueprints";
import type { ExamCode, SubjectCode } from "@/lib/task-blueprints";

// ─── template loader ──────────────────────────────────────────────────────────

let _generatorTemplate: string | null = null;

function getGeneratorTemplate(): string {
  if (!_generatorTemplate) {
    const file = path.join(process.cwd(), "prompts", "generator-system.md");
    _generatorTemplate = fs.readFileSync(file, "utf-8");
  }
  return _generatorTemplate;
}

// ─── example formatter ────────────────────────────────────────────────────────

export interface FewShotExample {
  conditionMd: string;
  canonicalAnswer: string | null;
  sourceLabel: string | null;
}

function formatExamples(examples: FewShotExample[]): string {
  if (examples.length === 0) return "Примеры не предоставлены.";
  return examples
    .map((ex, i) =>
      [
        `## Пример ${i + 1}${ex.sourceLabel ? ` (вариант ${ex.sourceLabel})` : ""}`,
        `**Условие:**\n${ex.conditionMd}`,
        `**Правильный ответ:** ${ex.canonicalAnswer ?? "(нет данных)"}`,
      ].join("\n\n"),
    )
    .join("\n\n---\n\n");
}

// ─── generation prompt builder ────────────────────────────────────────────────

export interface GenerationPromptParams {
  subject: SubjectType;
  taskNumber: number;
  examples: FewShotExample[];
}

export function buildGenerationMessages(
  params: GenerationPromptParams,
): GatewayMessage[] {
  const blueprint = getTaskBlueprintSummary("OGE", params.subject as SubjectCode, String(params.taskNumber));
  const examples = formatExamples(params.examples);

  const systemPrompt = getGeneratorTemplate()
    .replace("{{BLUEPRINT}}", blueprint)
    .replace("{{EXAMPLES}}", examples);

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Сгенерируй ОДНО новое задание ОГЭ по географии, тип ${params.taskNumber}.`,
    },
  ];
}

// ─── validation prompt builder ────────────────────────────────────────────────

/**
 * Messages for the validator (grader role).
 * The validator receives the task WITHOUT the answer and must solve it.
 */
export function buildValidationMessages(conditionMd: string): GatewayMessage[] {
  return [
    {
      role: "system",
      content: [
        "Ты решаешь задание ОГЭ по географии.",
        "Ответь ОДНОЙ строкой — только ответ, без объяснений и рассуждений.",
        "Формат: точно такой же, как предполагает задание (цифра, слово, последовательность цифр и т.д.).",
      ].join("\n"),
    },
    {
      role: "user",
      content: conditionMd,
    },
  ];
}
