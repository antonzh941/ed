/**
 * BullMQ Worker — отдельный процесс, не входит в Next.js runtime.
 *
 * Запуск (из apps/web):
 *   node --env-file=.env -r tsconfig-paths/register -r ts-node/register src/worker/index.ts
 * Или через npm script:
 *   npm run worker
 *
 * Цикл работы:
 *   1. При старте — checkAndRefillBank() для активных предметов.
 *   2. Обрабатывает джобы из очереди "task-generation".
 *   3. После каждого джоба — re-check, если нужно.
 */

import { Worker } from "bullmq";

import { getRedisConnection } from "@/lib/queue/connection";
import { TASK_GENERATION_QUEUE } from "@/lib/queue/jobs";
import type { GenerateTaskJobData, GenerateTaskJobResult } from "@/lib/queue/jobs";
import { generateAndSaveTask } from "@/lib/ai/generator";
import { checkAndRefillBank } from "@/lib/ai/generator/low-water";

// ─── startup check ────────────────────────────────────────────────────────────

async function runStartupCheck() {
  console.log("[worker] Running low-water check on startup…");
  try {
    const results = await checkAndRefillBank(["geography"]);
    const total = results.reduce((s, r) => s + r.jobsEnqueued, 0);
    if (total > 0) {
      console.log(`[worker] Enqueued ${total} generation jobs:`);
      for (const r of results) {
        if (r.jobsEnqueued > 0) {
          console.log(
            `  ${r.subject} type-${r.taskNumber}: ${r.currentCount} → +${r.jobsEnqueued}`,
          );
        }
      }
    } else {
      console.log("[worker] Bank is sufficiently stocked. No jobs enqueued.");
    }
  } catch (err) {
    console.error("[worker] Low-water check failed:", err);
  }
}

// ─── worker ───────────────────────────────────────────────────────────────────

const worker = new Worker<GenerateTaskJobData, GenerateTaskJobResult>(
  TASK_GENERATION_QUEUE,
  async (job) => {
    const { subject, taskNumber, batchLabel } = job.data;
    console.log(
      `[worker] Processing job ${job.id}: ${subject} type-${taskNumber} batch=${batchLabel}`,
    );

    const result = await generateAndSaveTask({
      subject,
      taskNumber,
      batchLabel,
      sessionId: `gen-${job.id}`,
    });

    console.log(
      `[worker] Job ${job.id} → status=${result.status}` +
        (result.reason ? ` reason=${result.reason}` : "") +
        (result.taskId ? ` taskId=${result.taskId}` : ""),
    );

    return result;
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,          // max 2 parallel LLM calls
    limiter: {
      max: 10,
      duration: 60_000,      // max 10 jobs per minute (LLM rate limit guard)
    },
  },
);

worker.on("completed", (job, result) => {
  console.log(`[worker] ✓ ${job.id} completed (${result.status})`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] ✗ ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[worker] worker error:", err);
});

// ─── graceful shutdown ────────────────────────────────────────────────────────

async function shutdown() {
  console.log("[worker] Shutting down…");
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ─── boot ─────────────────────────────────────────────────────────────────────

console.log(`[worker] Starting. Queue: ${TASK_GENERATION_QUEUE}`);
runStartupCheck().catch(console.error);
