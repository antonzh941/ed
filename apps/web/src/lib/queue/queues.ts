import { Queue } from "bullmq";

import { getRedisConnection } from "./connection";
import { TASK_GENERATION_QUEUE } from "./jobs";
import type { GenerateTaskJobData } from "./jobs";

let _generationQueue: Queue<GenerateTaskJobData> | null = null;

export function getGenerationQueue(): Queue<GenerateTaskJobData> {
  if (!_generationQueue) {
    _generationQueue = new Queue<GenerateTaskJobData>(TASK_GENERATION_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: { age: 60 * 60 * 24 }, // keep 24 h
        removeOnFail: { age: 60 * 60 * 24 * 7 },  // keep 7 days
      },
    });
  }
  return _generationQueue;
}
