/**
 * Резервная копия PostgreSQL через pg_dump.
 * Требуется `pg_dump` в PATH и переменная `DATABASE_URL`.
 *
 * Пример (Linux/macOS): node scripts/db-backup.mjs
 * Пример (Windows PowerShell): node scripts/db-backup.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) {
      continue;
    }
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFile();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL не задан.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = process.env.DB_BACKUP_DIR?.trim() || path.join(root, "data", "backups");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `backup-${stamp}.sql`);

const child = spawn("pg_dump", ["--no-owner", "--no-acl", "--dbname", databaseUrl], {
  stdio: ["ignore", "pipe", "inherit"],
});

const write = fs.createWriteStream(outFile);
child.stdout.pipe(write);

child.on("error", (err) => {
  console.error("Не удалось запустить pg_dump:", err.message);
  process.exit(1);
});

child.on("exit", (code) => {
  if (code !== 0) {
    console.error(`pg_dump завершился с кодом ${code}.`);
    process.exit(code ?? 1);
  }
  console.log(`Готово: ${outFile}`);
});
