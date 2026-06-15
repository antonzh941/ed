import { NextResponse } from "next/server";
import Redis from "ioredis";

const buckets = new Map<string, { count: number; windowStart: number }>();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

export const RATE_LIMIT_PRESETS = {
  ai: { maxRequests: 50, windowMs: 60_000 },
  auth: { maxRequests: 45, windowMs: 60_000 },
  payments: { maxRequests: 30, windowMs: 60_000 },
  progress: { maxRequests: 120, windowMs: 60_000 },
  dashboard: { maxRequests: 80, windowMs: 60_000 },
  /** Публичный `/api/system/status` */
  status: { maxRequests: 100, windowMs: 60_000 },
  /** Банк заданий и сессии */
  api: { maxRequests: 120, windowMs: 60_000 },
} as const;

export type RateLimitNamespace = keyof typeof RATE_LIMIT_PRESETS;

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function memoryRateLimit(
  compositeKey: string,
  now: number,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const b = buckets.get(compositeKey);
  if (!b || now - b.windowStart > windowMs) {
    buckets.set(compositeKey, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (b.count >= maxRequests) {
    const wait = Math.max(1, Math.ceil((windowMs - (now - b.windowStart)) / 1000));
    return { ok: false, retryAfterSec: wait };
  }
  b.count += 1;
  return { ok: true };
}

function redisUrl(): string | undefined {
  const u =
    process.env.REDIS_URL?.trim() ||
    process.env.RATE_LIMIT_REDIS_URL?.trim() ||
    process.env.AI_RATE_LIMIT_REDIS_URL?.trim();
  return u || undefined;
}

let redisSingleton: Redis | undefined;

function getRedis(): Redis | null {
  const url = redisUrl();
  if (!url) {
    return null;
  }
  if (!redisSingleton) {
    redisSingleton = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
    redisSingleton.on("error", (err) => {
      console.error("rate limit redis client error", err);
    });
  }
  return redisSingleton;
}

async function redisRateLimit(
  redisKey: string,
  now: number,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) {
    return memoryRateLimit(redisKey, now, maxRequests, windowMs);
  }
  const windowId = Math.floor(now / windowMs);
  const rkey = `${redisKey}:${windowId}`;
  try {
    const n = await redis.incr(rkey);
    if (n === 1) {
      await redis.pexpire(rkey, windowMs + 15_000);
    }
    if (n > maxRequests) {
      const windowEnd = (windowId + 1) * windowMs;
      const retryAfterSec = Math.max(1, Math.ceil((windowEnd - now) / 1000));
      return { ok: false, retryAfterSec };
    }
    return { ok: true };
  } catch (e) {
    console.error("rate limit redis failed, falling back to in-memory for this instance", e);
    return memoryRateLimit(redisKey, now, maxRequests, windowMs);
  }
}

function rateLimitDisabled() {
  return (
    process.env.DISABLE_RATE_LIMIT === "1" ||
    process.env.DISABLE_RATE_LIMIT === "true" ||
    process.env.DISABLE_AI_RATE_LIMIT === "1" ||
    process.env.DISABLE_AI_RATE_LIMIT === "true"
  );
}

/**
 * Скользящее минутное (или своё) окно по IP.
 * Несколько инстансов Next: задайте `REDIS_URL` или `RATE_LIMIT_REDIS_URL`.
 */
export async function checkRateLimit(
  request: Request,
  namespace: RateLimitNamespace,
): Promise<RateLimitResult> {
  if (rateLimitDisabled()) {
    return { ok: true };
  }
  const { maxRequests, windowMs } = RATE_LIMIT_PRESETS[namespace];
  const ip = clientKey(request);
  const now = Date.now();
  const safeIp = encodeURIComponent(ip).slice(0, 200);
  const compositeMemoryKey = `${namespace}:${ip}`;
  const redisLogicalKey = `rl:v2:${namespace}:${safeIp}`;

  if (redisUrl()) {
    return redisRateLimit(redisLogicalKey, now, maxRequests, windowMs);
  }
  return memoryRateLimit(compositeMemoryKey, now, maxRequests, windowMs);
}

export function getRateLimitBlockResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return NextResponse.json(
    { error: "Слишком много запросов. Подождите минуту и повторите." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSec) },
    },
  );
}

/** @deprecated Используйте `checkRateLimit(request, "ai")` */
export async function checkAiRateLimit(request: Request): Promise<RateLimitResult> {
  return checkRateLimit(request, "ai");
}

export function getAiRateLimitBlockResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return getRateLimitBlockResponse(result);
}
