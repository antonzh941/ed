/**
 * Shared ioredis connection for BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null` — without it the worker
 * throws on blocked commands (BRPOP, etc.).
 */

import IORedis from "ioredis";

let _connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (_connection) return _connection;

  const url = process.env.REDIS_URL || "redis://localhost:6379";

  _connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });

  _connection.on("error", (err) => {
    console.error("[redis] connection error:", err.message);
  });

  return _connection;
}
