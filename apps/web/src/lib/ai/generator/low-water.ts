/**
 * Low-water-mark check for the task bank.
 *
 * When approved tasks of a given (subject, taskNumber) fall below
 * LOW_WATER_MARK, we enqueue generation jobs to refill the bank.
 */

import type { SubjectType } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { getGenerationQueue } from "@/lib/queue/queues";

// ─── config ───────────────────────────────────────────────────────────────────

/** Minimum approved tasks per (subject, taskNumber) before we generate more. */
const LOW_WATER_MARK = parseInt(process.env.TASK_LOW_WATER_MARK ?? "20", 10);

/**
 * How many new tasks to generate per under-stocked (subject, taskNumber).
 * Each task = 1 BullMQ job.
 */
const BATCH_SIZE = parseInt(process.env.TASK_BATCH_SIZE ?? "3", 10);

/** Subjects + task-number ranges to monitor. */
const MONITORED: Record<SubjectType, { min: number; max: number }> = {
  geography: { min: 1, max: 30 },
  math:      { min: 1, max: 25 },
  russian:   { min: 1, max: 13 },
  history:   { min: 1, max: 24 },
};

// ─── helper ───────────────────────────────────────────────────────────────────

function makeBatchLabel(): string {
  const d = new Date();
  const date = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `AI-${date}-${rand}`;
}

// ─── main export ──────────────────────────────────────────────────────────────

export interface LowWaterCheckResult {
  subject: SubjectType;
  taskNumber: number;
  currentCount: number;
  jobsEnqueued: number;
}

/**
 * Check the task bank and enqueue generation jobs for under-stocked slots.
 *
 * @param subjects  Which subjects to check. Defaults to all monitored subjects.
 */
export async function checkAndRefillBank(
  subjects: SubjectType[] = Object.keys(MONITORED) as SubjectType[],
): Promise<LowWaterCheckResult[]> {
  const db = getPrismaClient();
  if (!db) throw new Error("Database not configured");

  const queue = getGenerationQueue();
  const results: LowWaterCheckResult[] = [];

  for (const subject of subjects) {
    const range = MONITORED[subject];
    if (!range) continue;

    // Count approved tasks per taskNumber for this subject
    const counts = await db.task.groupBy({
      by: ["taskNumber"],
      where: { subjectCode: subject, status: "approved" },
      _count: { id: true },
    });

    const countMap = new Map<number, number>(
      counts.map((r) => [r.taskNumber, r._count.id]),
    );

    const batchLabel = makeBatchLabel();

    for (let num = range.min; num <= range.max; num++) {
      const current = countMap.get(num) ?? 0;
      if (current >= LOW_WATER_MARK) continue;

      const needed = Math.min(BATCH_SIZE, LOW_WATER_MARK - current);
      let enqueued = 0;

      for (let i = 0; i < needed; i++) {
        await queue.add(
          `gen:${subject}:${num}`,
          { subject, taskNumber: num, batchLabel },
          // Spread jobs 10 s apart to avoid thundering herd on the LLM API
          { delay: i * 10_000 },
        );
        enqueued++;
      }

      results.push({ subject, taskNumber: num, currentCount: current, jobsEnqueued: enqueued });
    }
  }

  return results;
}
