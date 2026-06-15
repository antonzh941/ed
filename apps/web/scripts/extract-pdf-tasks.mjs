/**
 * Extract task conditions from OGE PDFs in data/rag/ and save structured JSON
 * to data/rag/extracted/{subject}-examples.json.
 *
 * Output format:
 *   { "1": ["condition from variant 1", "condition from variant 2", ...], "2": [...], ... }
 *
 * Run from apps/web/:
 *   node --input-type=module scripts/extract-pdf-tasks.mjs
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const projectRoot = process.cwd();
const RAG_DIR = path.join(projectRoot, "data", "rag");
const OUT_DIR = path.join(projectRoot, "data", "rag", "extracted");

// Minimum text length to accept a task block
const MIN_BLOCK_LENGTH = 15;

/** Detect subject from filename prefix */
function detectSubject(filename) {
  const name = filename.toLowerCase();
  if (name.startsWith("math-")) return "math";
  if (name.startsWith("hist-")) return "history";
  if (name.startsWith("rus-")) return "russian";
  if (name.startsWith("geo-")) return "geo"; // skip — already imported
  return null;
}

/** Clean extracted text block */
function cleanBlock(text) {
  return text
    // Remove page separators like "-- 1 of 5 --"
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, "")
    // Remove URL lines (http/https)
    .replace(/https?:\/\/\S+/g, "")
    // Remove date/time stamps that appear in sdamgia printouts
    .replace(/\d{2}\.\d{2}\.\d{4},\s*\d{2}:\d{2}/g, "")
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parse task blocks from PDF text.
 *  Returns a Map<taskNumber, conditionText>
 */
function parseTaskBlocks(text) {
  const tasks = new Map();
  // Match: "N. Тип N № XXXXXX i\n[content until next task or end]"
  const pattern = /(\d+)\.\s+Тип\s+\d+\s+№\s+\d+\s+i\s*([\s\S]*?)(?=\d+\.\s+Тип\s+\d+|$)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const taskNum = parseInt(match[1], 10);
    const rawBlock = match[2];
    const cleaned = cleanBlock(rawBlock);
    if (cleaned.length >= MIN_BLOCK_LENGTH) {
      tasks.set(taskNum, cleaned);
    }
  }
  return tasks;
}

/** Extract text from a PDF file */
async function extractPdfText(filePath) {
  const buf = await readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buf), verbosity: 0 });
  await parser.load();
  const result = await parser.getText();
  return result.text;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const files = await readdir(RAG_DIR);
  const pdfFiles = files.filter((f) => f.endsWith(".pdf"));

  // Group files by subject
  /** @type {Map<string, string[]>} */
  const bySubject = new Map();

  for (const file of pdfFiles) {
    const subject = detectSubject(file);
    if (!subject || subject === "geo") {
      if (subject === "geo") {
        console.log(`  Skipping geo (already imported): ${file}`);
      } else {
        console.log(`  Unknown subject, skipping: ${file}`);
      }
      continue;
    }
    if (!bySubject.has(subject)) bySubject.set(subject, []);
    bySubject.get(subject).push(file);
  }

  for (const [subject, subjectFiles] of bySubject) {
    console.log(`\nProcessing subject: ${subject} (${subjectFiles.length} files)`);

    // Accumulate: taskNumber -> [condition from variant 1, condition from variant 2, ...]
    /** @type {Map<number, string[]>} */
    const accumulated = new Map();

    for (const file of subjectFiles) {
      const filePath = path.join(RAG_DIR, file);
      console.log(`  Parsing: ${file}`);
      try {
        const text = await extractPdfText(filePath);
        const tasks = parseTaskBlocks(text);
        console.log(`    Found ${tasks.size} task blocks`);
        for (const [taskNum, condition] of tasks) {
          if (!accumulated.has(taskNum)) accumulated.set(taskNum, []);
          accumulated.get(taskNum).push(condition);
        }
      } catch (err) {
        console.error(`  ERROR parsing ${file}:`, err.message);
      }
    }

    // Convert Map to plain object with string keys, sorted by task number
    const output = {};
    const sortedKeys = [...accumulated.keys()].sort((a, b) => a - b);
    for (const taskNum of sortedKeys) {
      output[String(taskNum)] = accumulated.get(taskNum);
    }

    const outFile = path.join(OUT_DIR, `${subject}-examples.json`);
    await writeFile(outFile, JSON.stringify(output, null, 2), "utf-8");
    console.log(`  Saved: ${outFile} (${sortedKeys.length} task types)`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
