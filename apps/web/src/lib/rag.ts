import { promises as fs } from "node:fs";
import path from "node:path";

import type { ExamCode, SubjectCode } from "@/lib/task-blueprints";

type RagChunk = {
  id: string;
  source: string;
  subject: SubjectCode | "unknown";
  exam: ExamCode | "unknown";
  year: string | null;
  docType: "demo" | "method" | "codifier" | "spec" | "unknown";
  topic: string;
  taskNumbers: string[];
  text: string;
};

const ragIndexPath = path.join(process.cwd(), "data", "rag", "rag-index.json");

async function readRagIndex(): Promise<RagChunk[]> {
  try {
    const file = await fs.readFile(ragIndexPath, "utf8");
    return JSON.parse(file) as RagChunk[];
  } catch {
    return [];
  }
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-zA-Zа-яА-Я0-9]+/)
    .filter(Boolean);
}

function normalizeTaskFamily(taskNumber: string) {
  return taskNumber.split(".")[0] ?? taskNumber;
}

function docTypeScore(docType: RagChunk["docType"]) {
  switch (docType) {
    case "method":
      return 14;
    case "demo":
      return 10;
    case "spec":
      return 6;
    case "codifier":
      return 4;
    default:
      return 0;
  }
}

function scoreChunk(
  chunk: RagChunk,
  options: {
    taskNumber: string;
    query: string;
  },
) {
  const queryTerms = tokenize(options.query);

  const haystack = `${chunk.topic} ${chunk.text}`.toLowerCase();
  let score = queryTerms.reduce((sum, term) => {
    return haystack.includes(term) ? sum + 2 : sum;
  }, 0);

  if (chunk.taskNumbers.includes(options.taskNumber)) {
    score += 40;
  } else if (
    chunk.taskNumbers.some(
      (taskNumber) => normalizeTaskFamily(taskNumber) === normalizeTaskFamily(options.taskNumber),
    )
  ) {
    score += 18;
  }

  score += docTypeScore(chunk.docType);

  if (chunk.year === "2025") {
    score += 3;
  } else if (chunk.year === "2024") {
    score += 2;
  }

  if (chunk.taskNumbers.length > 6) {
    score -= 12;
  }

  if (haystack.includes("инструкция по выполнению работы")) {
    score -= 20;
  }

  return score;
}

export async function getRagContext(options: {
  exam: ExamCode;
  subject: SubjectCode;
  taskNumber: string;
  taskLabel?: string;
  taskFocus?: string;
  ragHints?: string[];
  query: string;
}) {
  const chunks = await readRagIndex();
  const extendedQuery = [
    `номер ${options.taskNumber}`,
    options.taskLabel ?? "",
    options.taskFocus ?? "",
    options.ragHints?.join(" ") ?? "",
    options.query,
  ]
    .filter(Boolean)
    .join(" ");

  const ranked = chunks
    .filter((chunk) => {
      const sameExam = chunk.exam === options.exam || chunk.exam === "unknown";
      const sameSubject =
        chunk.subject === options.subject || chunk.subject === "unknown";

      return sameExam && sameSubject;
    })
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, {
        taskNumber: options.taskNumber,
        query: extendedQuery,
      }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);

  if (ranked.length === 0) {
    return "";
  }

  return ranked
    .map(
      ({ chunk }, index) =>
        [
          `Источник ${index + 1}: ${chunk.source}`,
          `Тип документа: ${chunk.docType}`,
          chunk.taskNumbers.length
            ? `Связанные номера: ${chunk.taskNumbers.join(", ")}`
            : null,
          chunk.text,
        ]
          .filter(Boolean)
          .join("\n"),
    )
    .join("\n\n");
}

export async function getRagStats() {
  const chunks = await readRagIndex();
  const sources = new Set(chunks.map((chunk) => chunk.source));

  return {
    chunks: chunks.length,
    sources: sources.size,
  };
}
