import fs from "node:fs";
import path from "node:path";

import type { SubjectType } from "@prisma/client";

import type { GatewayMessage } from "@/lib/ai/gateway";
import type { SubjectCode } from "@/lib/task-blueprints";
import { getGeographyFormat } from "./geography-formats";

// ─── template loader ──────────────────────────────────────────────────────────

let _generatorTemplate: string | null = null;

function getGeneratorTemplate(): string {
  if (!_generatorTemplate) {
    const file = path.join(process.cwd(), "prompts", "generator-system.md");
    _generatorTemplate = fs.readFileSync(file, "utf-8");
  }
  return _generatorTemplate;
}

// ─── format instruction resolver ─────────────────────────────────────────────

function resolveFormatInstruction(subject: SubjectType, taskNumber: number): string {
  if (subject === "geography") {
    const fmt = getGeographyFormat(taskNumber);
    if (fmt) {
      return [
        `**Что проверяет задание:** ${fmt.tests}`,
        `**Формат ответа:** ${fmt.answerFormat}`,
        "",
        fmt.instruction,
      ].join("\n");
    }
  }
  // Fallback for other subjects
  return `Задание типа ${taskNumber} по предмету ${subject}. Следуй формату ОГЭ ФИПИ.`;
}

// ─── example formatter ────────────────────────────────────────────────────────

export interface FewShotExample {
  conditionMd: string;
  canonicalAnswer: string | null;
  sourceLabel: string | null;
}

function formatExamples(examples: FewShotExample[]): string {
  if (examples.length === 0) return "Примеры недоступны — создай задание самостоятельно.";
  return examples
    .map((ex, i) =>
      [
        `### Пример ${i + 1}${ex.sourceLabel ? ` (вариант ${ex.sourceLabel})` : ""}`,
        `**Условие:**`,
        ex.conditionMd,
        `**Ответ:** ${ex.canonicalAnswer ?? "(нет данных)"}`,
      ].join("\n\n"),
    )
    .join("\n\n---\n\n");
}

// ─── generation prompt ────────────────────────────────────────────────────────

export interface GenerationPromptParams {
  subject: SubjectType;
  taskNumber: number;
  examples: FewShotExample[];
}

export function buildGenerationMessages(
  params: GenerationPromptParams,
): GatewayMessage[] {
  const { subject, taskNumber, examples } = params;

  const formatInstruction = resolveFormatInstruction(subject, taskNumber);
  const exampleText = formatExamples(examples);

  const systemPrompt = getGeneratorTemplate()
    .replace("{{FORMAT_INSTRUCTION}}", formatInstruction)
    .replace("{{EXAMPLES}}", exampleText);

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Сгенерируй ОДНО новое задание ОГЭ по географии, тип ${taskNumber}. Ответь только JSON.`,
    },
  ];
}

// ─── validation prompt ────────────────────────────────────────────────────────

export function buildValidationMessages(conditionMd: string): GatewayMessage[] {
  return [
    {
      role: "system",
      content: [
        "Ты решаешь задание ОГЭ по географии.",
        "Ответь ОДНОЙ строкой — только ответ, без объяснений и рассуждений.",
        "Формат ответа должен точно совпадать с тем, что ожидает задание (цифра, слово, последовательность цифр и т.д.).",
      ].join("\n"),
    },
    {
      role: "user",
      content: conditionMd,
    },
  ];
}
