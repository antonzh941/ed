import type { GatewayRole } from "./types";

export interface GenerationTrace {
  setUsage(promptTokens: number, completionTokens: number): void;
  setError(error: unknown): void;
  flush(): Promise<void>;
}

const noop: GenerationTrace = {
  setUsage: () => {},
  setError: () => {},
  flush: async () => {},
};

// Lazy singleton — инициализируется только если ключи заданы
let _lf: import("langfuse").Langfuse | null | undefined;

async function getLangfuse() {
  if (_lf !== undefined) return _lf;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  if (!secretKey || !publicKey) {
    _lf = null;
    return null;
  }
  try {
    const { Langfuse } = await import("langfuse");
    _lf = new Langfuse({
      secretKey,
      publicKey,
      baseUrl: process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com",
      flushAt: 1,
      flushInterval: 0,
    });
  } catch {
    _lf = null;
  }
  return _lf;
}

export async function startTrace(params: {
  role: GatewayRole;
  model: string;
  provider: "primary" | "fallback";
  sessionId?: string;
  subject?: string;
  taskNumber?: string;
}): Promise<GenerationTrace> {
  const lf = await getLangfuse();
  if (!lf) return noop;

  const trace = lf.trace({
    name: `gateway.${params.role}`,
    sessionId: params.sessionId,
    metadata: {
      role: params.role,
      model: params.model,
      provider: params.provider,
      subject: params.subject,
      taskNumber: params.taskNumber,
    },
  });

  const generation = trace.generation({
    name: `${params.role}.completion`,
    model: params.model,
    startTime: new Date(),
  });

  return {
    setUsage(promptTokens, completionTokens) {
      generation.update({
        endTime: new Date(),
        usage: { input: promptTokens, output: completionTokens },
      });
    },
    setError(error) {
      generation.update({
        endTime: new Date(),
        level: "ERROR",
        statusMessage: error instanceof Error ? error.message : String(error),
      });
    },
    async flush() {
      await lf.flushAsync();
    },
  };
}
