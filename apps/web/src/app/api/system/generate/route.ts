/**
 * POST /api/system/generate
 *
 * Admin endpoint: triggers low-water-mark check and enqueues generation jobs.
 * Protected by WORKER_SECRET bearer token.
 *
 * Body (optional):
 *   { subjects?: ("geography" | "math" | "russian" | "history")[] }
 *
 * Returns:
 *   { enqueued: number, details: LowWaterCheckResult[] }
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { logApiRouteException } from "@/lib/api-route-log";
import { isDatabaseConfigured } from "@/lib/env";
import { checkAndRefillBank } from "@/lib/ai/generator/low-water";
import type { SubjectType } from "@prisma/client";

const WORKER_SECRET = process.env.WORKER_SECRET ?? "";

const bodySchema = z.object({
  subjects: z
    .array(z.enum(["geography", "math", "russian", "history"]))
    .optional(),
});

function authError() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    // ── auth ────────────────────────────────────────────────────────────────
    if (!WORKER_SECRET) {
      return NextResponse.json(
        { error: "WORKER_SECRET not configured on server." },
        { status: 503 },
      );
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token !== WORKER_SECRET) return authError();

    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "Database not configured." }, { status: 503 });
    }

    // ── parse body ───────────────────────────────────────────────────────────
    let subjects: SubjectType[] | undefined;
    try {
      const raw = await request.json();
      const parsed = bodySchema.parse(raw);
      subjects = parsed.subjects;
    } catch {
      // Body is optional — proceed with defaults
    }

    // ── trigger check ────────────────────────────────────────────────────────
    const results = await checkAndRefillBank(subjects);
    const enqueued = results.reduce((s, r) => s + r.jobsEnqueued, 0);

    return NextResponse.json({ enqueued, details: results });
  } catch (err) {
    logApiRouteException("POST /api/system/generate failed", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

/** GET — bank stats (auth required). */
export async function GET(request: Request) {
  try {
    if (!WORKER_SECRET) return authError();
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token !== WORKER_SECRET) return authError();

    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "Database not configured." }, { status: 503 });
    }

    const { getPrismaClient } = await import("@/lib/prisma");
    const db = getPrismaClient()!;

    const counts = await db.task.groupBy({
      by: ["subjectCode", "taskNumber", "status"],
      _count: { id: true },
      orderBy: [{ subjectCode: "asc" }, { taskNumber: "asc" }],
    });

    return NextResponse.json({ counts });
  } catch (err) {
    logApiRouteException("GET /api/system/generate failed", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
