import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, SubjectType, AnswerType, TaskStatus } from "@prisma/client";
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SUBJECTS: Array<{
  code: SubjectType;
  labelRu: string;
  displayOrder: number;
}> = [
  { code: "russian", labelRu: "Русский язык", displayOrder: 1 },
  { code: "math", labelRu: "Математика", displayOrder: 2 },
  { code: "geography", labelRu: "География", displayOrder: 3 },
  { code: "history", labelRu: "История", displayOrder: 4 },
];

const FILE_SUBJECT_MAP: Record<string, SubjectType> = {
  "МА-9": "math",
  "РУ-9": "russian",
  "ГГ-9": "geography",
  "ИС-9": "history",
};

const SOURCE_LABEL_DEFAULT = "ДЕМО-2025";

// Keywords that indicate an extended (essay/free-response) answer
const EXTENDED_KEYWORDS =
  /сочинение|напишите|объясните|докажите|обоснуйте|изложение|диктант|опишите|охарактеризуйте|бланк|обоснованный/i;

/** Derivе source label from the markdown filename.
 *  e.g. "ГГ-9_ОГЭ_4132922.md" → "4132922"
 *       "МА-9_ОГЭ_2025_ДЕМО.md" → "ДЕМО-2025" (fallback)
 */
function sourceLabelFromFilename(filename: string): string {
  const numericMatch = filename.replace(/\.md$/i, "").match(/(\d{6,})$/);
  if (numericMatch) return numericMatch[1];
  return SOURCE_LABEL_DEFAULT;
}

interface ParsedTask {
  taskNumber: number;
  conditionMd: string;
  answerType: AnswerType;
  canonicalAnswer: string | null;
  acceptedAnswers: string[];
}

function detectSubjectFromFilename(filename: string): SubjectType | null {
  for (const [prefix, subject] of Object.entries(FILE_SUBJECT_MAP)) {
    if (filename.startsWith(prefix)) return subject;
  }
  return null;
}

/**
 * Parse `| N | answer |` table from the "Система оценивания" / answer key section.
 * Returns a map of taskNumber → canonical answer string.
 */
function parseAnswerKey(content: string): Map<number, string> {
  const answers = new Map<number, string>();
  // Match answer key table rows: | number | answer |
  const tableRowRe = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|/gm;
  let m: RegExpExecArray | null;
  while ((m = tableRowRe.exec(content)) !== null) {
    const num = parseInt(m[1], 10);
    const raw = m[2].trim();
    // Skip header-like rows
    if (raw && raw !== "Правильный ответ" && raw !== "---") {
      answers.set(num, raw);
    }
  }
  return answers;
}

/**
 * Split the document into per-task blocks using `**Задание N**` markers.
 * Returns array of { taskNumber, rawBlock } where rawBlock is everything
 * up to the next task or end of "task section" (before answer key).
 */
function splitIntoTaskBlocks(
  content: string
): Array<{ taskNumber: number; rawBlock: string }> {
  // Stop before the answer key / grading section
  const stopMarkers = [
    "# Система оценивания",
    "## Система оценивания",
    "## Критерии оценивания",
    "# Критерии оценивания",
    "## Часть 2\n\n> *При выполнении заданий",
  ];
  let truncated = content;
  for (const marker of stopMarkers) {
    const idx = truncated.indexOf(marker);
    if (idx !== -1) {
      truncated = truncated.slice(0, idx);
      break;
    }
  }

  const taskRe = /\*\*Задание\s+(\d+)\*\*/g;
  const positions: Array<{ num: number; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = taskRe.exec(truncated)) !== null) {
    positions.push({ num: parseInt(m[1], 10), start: m.index });
  }

  const blocks: Array<{ taskNumber: number; rawBlock: string }> = [];
  for (let i = 0; i < positions.length; i++) {
    const { num, start } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : truncated.length;
    blocks.push({ taskNumber: num, rawBlock: truncated.slice(start, end).trim() });
  }
  return blocks;
}

function parseTasksFromMarkdown(content: string): ParsedTask[] {
  const answerKey = parseAnswerKey(content);
  const blocks = splitIntoTaskBlocks(content);

  return blocks.map(({ taskNumber, rawBlock }) => {
    // Remove the "**Задание N**" heading itself from the condition
    const conditionMd = rawBlock
      .replace(/^\*\*Задание\s+\d+\*\*\s*/, "")
      // Remove trailing "Ответ: ___" line
      .replace(/\n+Ответ:\s*[_]+\s*$/, "")
      // Remove trailing checkbox
      .replace(/\n+Ответ:\s*☐\s*$/, "")
      .trim();

    const isExtended = EXTENDED_KEYWORDS.test(conditionMd);
    const answerType: AnswerType = isExtended ? "extended" : "short";

    let canonicalAnswer: string | null = null;
    const acceptedAnswers: string[] = [];

    if (!isExtended && answerKey.has(taskNumber)) {
      const raw = answerKey.get(taskNumber)!;
      // Handle "<или>" separator for accepted variants
      const parts = raw.split(/\s*<или>\s*/i).map((s) => s.trim()).filter(Boolean);
      canonicalAnswer = parts[0] ?? null;
      if (parts.length > 1) {
        acceptedAnswers.push(...parts.slice(1));
      }
    }

    return { taskNumber, conditionMd, answerType, canonicalAnswer, acceptedAnswers };
  });
}

async function seedSubjects() {
  for (const s of SUBJECTS) {
    await prisma.subject.upsert({
      where: { code: s.code },
      update: { labelRu: s.labelRu, displayOrder: s.displayOrder },
      create: s,
    });
  }
  console.log("  Subjects upserted.");
}

async function seedTasksFromFile(filePath: string, subjectCode: SubjectType) {
  const sourceLabel = sourceLabelFromFilename(path.basename(filePath));
  const content = fs.readFileSync(filePath, "utf-8");
  const tasks = parseTasksFromMarkdown(content);

  let upserted = 0;
  for (const t of tasks) {
    await prisma.task.upsert({
      where: {
        subjectCode_taskNumber_sourceLabel: {
          subjectCode,
          taskNumber: t.taskNumber,
          sourceLabel: sourceLabel,
        },
      },
      update: {
        conditionMd: t.conditionMd,
        answerType: t.answerType,
        canonicalAnswer: t.canonicalAnswer,
        acceptedAnswers: t.acceptedAnswers,
      },
      create: {
        subjectCode,
        taskNumber: t.taskNumber,
        sourceLabel: sourceLabel,
        conditionMd: t.conditionMd,
        answerType: t.answerType,
        canonicalAnswer: t.canonicalAnswer,
        acceptedAnswers: t.acceptedAnswers,
        status: "approved" as TaskStatus,
      },
    });
    upserted++;
  }
  console.log(`  ${path.basename(filePath)}: ${upserted} tasks upserted.`);
}

async function main() {
  console.log("Seeding subjects...");
  await seedSubjects();

  console.log("Seeding tasks from RAG markdown files...");
  const ragDir = path.join(__dirname, "..", "data", "rag");
  const files = fs.readdirSync(ragDir).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const subject = detectSubjectFromFilename(file);
    if (!subject) {
      console.log(`  Skipping ${file} (no subject mapping).`);
      continue;
    }
    await seedTasksFromFile(path.join(ragDir, file), subject);
  }

  console.log("Seeding dev user...");
  await seedDevUser();

  console.log("Done.");
}

async function seedDevUser() {
  const devKey = process.env.DEV_AUTH_USER_KEY ?? "dev-local-user";
  await prisma.user.upsert({
    where: { appUserKey: devKey },
    update: {},
    create: {
      appUserKey: devKey,
      displayName: "Dev User",
      exam: "OGE",
      subject: "math",
      cyclesBalance: 9999,
    },
  });
  console.log(`  Dev user upserted (appUserKey: ${devKey}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
