/**
 * Import OGE geography variants from DeepSeek-generated markdown files.
 *
 * Format expected:
 *   # Вариант № XXXXXXX
 *   ## N. Тип N № FIPI_NUM
 *   <task text>
 *   **Ответ:** <answer>
 *
 * Usage (from apps/web):
 *   node --env-file-if-exists=.env scripts/import-oge-variants.mjs [file1.md file2.md ...]
 * If no files given, defaults to the 5 Desktop files produced on 2026-06-15.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- env fallback ----------
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ---------- DB ----------
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------- constants ----------
const SUBJECT_CODE = "geography";

/**
 * Task numbers for extended (free-response) answers.
 * In OGE geography:
 *   12 → choice of land plot with two written arguments
 *   28,29,30 → open-ended questions about a geography text
 */
const EXTENDED_TASKS = new Set([12, 28, 29, 30]);

// ---------- default file list ----------
const DEFAULT_FILES = [
  "C:\\Users\\a\\Desktop\\deepseek_markdown_20260615_3d2b0c.md",
  "C:\\Users\\a\\Desktop\\deepseek_markdown_20260615_41be7f.md",
  "C:\\Users\\a\\Desktop\\deepseek_markdown_20260615_43a02b.md",
  "C:\\Users\\a\\Desktop\\deepseek_markdown_20260615_7000cf.md",
  "C:\\Users\\a\\Desktop\\deepseek_markdown_20260615_943422.md",
];

// ---------- parser ----------

/**
 * Parse a single markdown file.
 * Returns { sourceLabel, tasks[] }
 */
function parseVariantFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");

  // Extract variant number from "# Вариант № XXXXXXX"
  const variantMatch = content.match(/# Вариант №\s*(\d+)/);
  if (!variantMatch) {
    throw new Error(`No variant number found in ${filePath}`);
  }
  const sourceLabel = variantMatch[1];

  // Split content into per-task blocks.
  // Heading format: ## N. Тип N [№ FIPI_NUM]
  // (some tasks generated without FIPI number — still capture them)
  const sectionRe = /^## (\d+)\. Тип \d+/gm;
  const positions = [];
  let m;
  while ((m = sectionRe.exec(content)) !== null) {
    positions.push({ num: parseInt(m[1], 10), start: m.index });
  }

  if (positions.length === 0) {
    throw new Error(`No task sections found in ${filePath}`);
  }

  const tasks = [];

  for (let i = 0; i < positions.length; i++) {
    const { num, start } = positions[i];
    const end =
      i + 1 < positions.length ? positions[i + 1].start : content.length;
    const block = content.slice(start, end).trim();

    // Strip the heading line (## N. Тип ...)
    const firstNewline = block.indexOf("\n");
    const body =
      firstNewline !== -1 ? block.slice(firstNewline + 1).trim() : "";

    // Skip placeholder tasks (text absent from PDF)
    if (
      /текст задания.*отсутствует/i.test(body) ||
      body.startsWith("*(Текст")
    ) {
      console.log(
        `  Skipping task ${num} in variant ${sourceLabel} (missing text)`
      );
      continue;
    }

    // Split body into condition and answer on "**Ответ:**"
    const answerMarker = "**Ответ:**";
    const answerIdx = body.indexOf(answerMarker);

    let conditionMd, rawAnswer;
    if (answerIdx !== -1) {
      conditionMd = body.slice(0, answerIdx).trim();
      rawAnswer = body.slice(answerIdx + answerMarker.length).trim();
    } else {
      conditionMd = body.trim();
      rawAnswer = null;
    }

    const isExtended = EXTENDED_TASKS.has(num);
    const answerType = isExtended ? "extended" : "short";

    let canonicalAnswer = null;
    const acceptedAnswers = [];

    if (rawAnswer) {
      if (isExtended) {
        // Store full model answer as canonical for grading reference
        canonicalAnswer = rawAnswer.trim();
      } else {
        // Take first line only; skip "(Для определения необходимо видеть...)" placeholders
        const firstLine = rawAnswer.split("\n")[0].trim();
        if (firstLine && !firstLine.startsWith("(")) {
          // Handle "<или>" separator: "трактам <или> тракт" → canonical + accepted
          const parts = firstLine
            .split(/\s*<или>\s*/i)
            .map((s) => s.trim())
            .filter(Boolean);
          canonicalAnswer = parts[0] ?? null;
          if (parts.length > 1) {
            acceptedAnswers.push(...parts.slice(1));
          }
        }
      }
    }

    tasks.push({
      taskNumber: num,
      conditionMd,
      answerType,
      canonicalAnswer,
      acceptedAnswers,
    });
  }

  return { sourceLabel, tasks };
}

// ---------- main ----------

async function importFile(filePath) {
  console.log(`\nParsing ${path.basename(filePath)}…`);

  const { sourceLabel, tasks } = parseVariantFile(filePath);
  console.log(
    `  Variant ${sourceLabel}: ${tasks.length} tasks parsed`
  );

  let upserted = 0;
  let skipped = 0;

  for (const t of tasks) {
    await prisma.task.upsert({
      where: {
        subjectCode_taskNumber_sourceLabel: {
          subjectCode: SUBJECT_CODE,
          taskNumber: t.taskNumber,
          sourceLabel,
        },
      },
      update: {
        conditionMd: t.conditionMd,
        answerType: t.answerType,
        canonicalAnswer: t.canonicalAnswer,
        acceptedAnswers: t.acceptedAnswers,
        status: "approved",
      },
      create: {
        subjectCode: SUBJECT_CODE,
        taskNumber: t.taskNumber,
        sourceLabel,
        conditionMd: t.conditionMd,
        answerType: t.answerType,
        canonicalAnswer: t.canonicalAnswer,
        acceptedAnswers: t.acceptedAnswers,
        status: "approved",
      },
    });
    upserted++;
  }

  console.log(`  ✓ ${upserted} upserted, ${skipped} skipped`);
}

async function main() {
  const files =
    process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_FILES;

  console.log(`Importing ${files.length} variant file(s) into geography tasks…`);

  for (const f of files) {
    await importFile(f);
  }

  // Summary
  const total = await prisma.task.count({
    where: { subjectCode: SUBJECT_CODE, status: "approved" },
  });
  console.log(`\nDone. Total approved geography tasks in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
