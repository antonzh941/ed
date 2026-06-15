import fs from "node:fs";
import path from "node:path";

import type { SubjectType } from "@prisma/client";

import type { GatewayMessage } from "@/lib/ai/gateway";
import type { SubjectCode } from "@/lib/task-blueprints";
import { getGeographyFormat } from "./geography-formats";
import { getHistoryFormat } from "./history-formats";
import { getMathFormat } from "./math-formats";
import { getRussianFormat } from "./russian-formats";

// ─── template loader ──────────────────────────────────────────────────────────

let _generatorTemplate: string | null = null;

function getGeneratorTemplate(): string {
  if (!_generatorTemplate) {
    const file = path.join(process.cwd(), "prompts", "generator-system.md");
    _generatorTemplate = fs.readFileSync(file, "utf-8");
  }
  return _generatorTemplate;
}

// ─── PDF examples loader (lazy, cached per subject) ──────────────────────────

type PdfExamplesMap = Record<string, string[]>;

const _pdfExamplesCache = new Map<string, PdfExamplesMap>();

/**
 * Load up to `limit` PDF-extracted example conditions for a given subject and
 * task number. Returns an empty array if the file doesn't exist or the task
 * number has no entries.
 *
 * File location: data/rag/extracted/{subject}-examples.json
 * (subject key uses Prisma SubjectType, mapped to filename prefix below)
 */
export function loadPdfExamples(
  subject: SubjectType,
  taskNumber: number,
  limit = 2,
): string[] {
  // Map Prisma SubjectType to file prefix
  const subjectToFile: Record<string, string> = {
    math: "math",
    history: "history",
    russian: "russian",
    geography: "geo", // geography is already imported separately; kept for completeness
  };
  const fileKey = subjectToFile[subject] ?? subject;

  if (!_pdfExamplesCache.has(fileKey)) {
    const filePath = path.join(
      process.cwd(),
      "data",
      "rag",
      "extracted",
      `${fileKey}-examples.json`,
    );
    if (!fs.existsSync(filePath)) {
      _pdfExamplesCache.set(fileKey, {});
    } else {
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        _pdfExamplesCache.set(fileKey, JSON.parse(raw) as PdfExamplesMap);
      } catch {
        _pdfExamplesCache.set(fileKey, {});
      }
    }
  }

  const map = _pdfExamplesCache.get(fileKey) ?? {};
  const examples = map[String(taskNumber)] ?? [];
  return examples.slice(0, limit);
}

// ─── format instruction resolver ─────────────────────────────────────────────

function resolveFormatInstruction(subject: SubjectType, taskNumber: number): string {
  // Try subject-specific format registries
  let fmt: { tests: string; answerFormat: string; instruction: string } | null = null;

  if (subject === "geography") {
    fmt = getGeographyFormat(taskNumber);
  } else if (subject === "math") {
    fmt = getMathFormat(taskNumber);
  } else if (subject === "history") {
    fmt = getHistoryFormat(taskNumber);
  } else if (subject === "russian") {
    fmt = getRussianFormat(taskNumber);
  }

  if (fmt) {
    return [
      `**Что проверяет задание:** ${fmt.tests}`,
      `**Формат ответа:** ${fmt.answerFormat}`,
      "",
      fmt.instruction,
    ].join("\n");
  }

  // Fallback for unrecognised subjects or task numbers
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

const SUBJECT_NAMES_RU: Record<string, string> = {
  geography: "географии",
  math: "математике",
  history: "истории",
  russian: "русскому языку",
};

export function buildGenerationMessages(
  params: GenerationPromptParams,
): GatewayMessage[] {
  const { subject, taskNumber, examples } = params;

  // Merge DB examples with PDF-extracted examples (DB examples take priority)
  const pdfExampleTexts = loadPdfExamples(subject, taskNumber, 2);
  const pdfFewShot: FewShotExample[] = pdfExampleTexts.map((conditionMd, i) => ({
    conditionMd,
    canonicalAnswer: null,
    sourceLabel: `pdf-${i + 1}`,
  }));

  // Combine: DB examples first (they have answers), then PDF examples
  const allExamples = [...examples, ...pdfFewShot];

  const formatInstruction = resolveFormatInstruction(subject, taskNumber);
  const exampleText = formatExamples(allExamples);

  const systemPrompt = getGeneratorTemplate()
    .replace("{{FORMAT_INSTRUCTION}}", formatInstruction)
    .replace("{{EXAMPLES}}", exampleText);

  const subjectRu = SUBJECT_NAMES_RU[subject] ?? subject;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Сгенерируй ОДНО новое задание ОГЭ по ${subjectRu}, тип ${taskNumber}. Ответь только JSON.`,
    },
  ];
}

// ─── validation prompt ────────────────────────────────────────────────────────

export function buildValidationMessages(
  conditionMd: string,
  subject?: SubjectType,
): GatewayMessage[] {
  const subjectRu = SUBJECT_NAMES_RU[subject ?? "geography"] ?? "географии";
  return [
    {
      role: "system",
      content: [
        `Ты решаешь задание ОГЭ по ${subjectRu}.`,
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
