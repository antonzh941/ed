import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const projectRoot = process.cwd();
const workspaceRoot = path.resolve(projectRoot, "..", "..");
const sourceRoot = path.join(workspaceRoot, "docs", "rag-sources");
const outputDir = path.join(projectRoot, "data", "rag");
const outputFile = path.join(outputDir, "rag-index.json");

function inferMeta(filePath) {
  const normalized = filePath.toLowerCase().replaceAll("\\", "/");
  const fileName = path.basename(normalized, ".pdf");

  const subject = fileName.includes("-math-")
    ? "math"
    : fileName.includes("-russian-")
      ? "russian"
      : fileName.includes("-geo-")
        ? "geography"
        : fileName.includes("-hist-")
          ? "history"
          : "unknown";

  const exam = fileName.includes("-oge-") || normalized.includes("огэ") ? "OGE" : "unknown";
  const yearMatch = fileName.match(/20\d{2}/);

  const docType = fileName.includes("-demo")
    ? "demo"
    : fileName.includes("-method")
      ? "method"
      : fileName.includes("-codifier")
        ? "codifier"
        : fileName.includes("-spec")
          ? "spec"
          : "unknown";

  return {
    subject,
    exam,
    year: yearMatch?.[0] ?? null,
    docType,
  };
}

function normalizeText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/\u0000/g, " ")
    .replace(/\t+/g, " ")
    .replace(/--\s+\d+\s+of\s+\d+\s+--/gi, "\n")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLargeSection(text, chunkSize = 2200) {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    if (end < text.length) {
      const boundary = text.lastIndexOf("\n", end);
      if (boundary > start + 400) {
        end = boundary;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end;
  }

  return chunks.filter(Boolean);
}

function splitIntoSections(text) {
  const normalized = normalizeText(text);
  const markerRegex =
    /(?:^|\n)(Задани(?:е|я)\s+[0-9.,\s–—\-и]+\S*[^\n]*|ЧАСТЬ\s+\d[^\n]*|Часть\s+\d[^\n]*|Инструкция по выполнению работы[^\n]*)/g;
  const markers = [...normalized.matchAll(markerRegex)];

  if (markers.length < 2) {
    return splitLargeSection(normalized);
  }

  const sections = [];

  for (let index = 0; index < markers.length; index += 1) {
    const start = markers[index].index ?? 0;
    const end = markers[index + 1]?.index ?? normalized.length;
    const chunk = normalized.slice(start, end).trim();
    sections.push(...splitLargeSection(chunk));
  }

  return sections.filter(Boolean);
}

function expandNumericRange(start, end) {
  const startNumber = Number.parseInt(start, 10);
  const endNumber = Number.parseInt(end, 10);

  if (!Number.isFinite(startNumber) || !Number.isFinite(endNumber) || endNumber < startNumber) {
    return [start];
  }

  if (endNumber - startNumber > 30) {
    return [start, end];
  }

  return Array.from({ length: endNumber - startNumber + 1 }, (_, offset) =>
    String(startNumber + offset),
  );
}

function extractTaskNumbers(text) {
  const taskNumbers = new Set();
  const referenceRegex = /Задани(?:е|я)\s+([0-9.,\s–—\-и]+)/gi;

  for (const match of text.matchAll(referenceRegex)) {
    const raw = match[1]?.trim() ?? "";

    for (const range of raw.matchAll(/(\d+)\s*[–—-]\s*(\d+)/g)) {
      for (const value of expandNumericRange(range[1], range[2])) {
        taskNumbers.add(value);
      }
    }

    for (const dotted of raw.matchAll(/\d+\.\d+/g)) {
      taskNumbers.add(dotted[0]);
    }

    for (const single of raw.matchAll(/\d+/g)) {
      taskNumbers.add(single[0]);
    }
  }

  return [...taskNumbers].sort((left, right) =>
    left.localeCompare(right, "ru", { numeric: true }),
  );
}

async function collectPdfFiles(targetDirectory) {
  const entries = await readdir(targetDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(targetDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectPdfFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function parsePdf(filePath) {
  const data = await readFile(filePath);
  const parser = new PDFParse({ data });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  let pdfFiles = [];

  try {
    pdfFiles = await collectPdfFiles(sourceRoot);
  } catch {
    pdfFiles = [];
  }

  if (pdfFiles.length === 0) {
    try {
      await readFile(outputFile, "utf8");
      console.log("RAG ingest: PDF файлы не найдены. Существующий индекс оставлен без изменений.");
    } catch {
      await writeFile(outputFile, "[]\n", "utf8");
      console.log("RAG ingest: PDF файлы не найдены. Создан пустой индекс.");
    }
    return;
  }

  const index = [];

  for (const filePath of pdfFiles) {
    const text = await parsePdf(filePath);
    const relativeSource = path.relative(workspaceRoot, filePath).replaceAll("\\", "/");
    const { exam, subject, year, docType } = inferMeta(relativeSource);
    const sections = splitIntoSections(text);

    sections.forEach((chunk, chunkIndex) => {
      index.push({
        id: `${relativeSource}-${chunkIndex + 1}`,
        source: relativeSource,
        subject,
        exam,
        year,
        docType,
        topic: path.basename(filePath, ".pdf"),
        taskNumbers: extractTaskNumbers(chunk),
        text: chunk,
      });
    });

    console.log(`Indexed: ${relativeSource} (${sections.length} chunks)`);
  }

  await writeFile(outputFile, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(`RAG ingest complete. Total chunks: ${index.length}`);
}

main().catch((error) => {
  console.error("RAG ingest failed");
  console.error(error);
  process.exitCode = 1;
});
