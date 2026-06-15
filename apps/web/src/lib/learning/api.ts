import type {
  AuthSessionPublic,
  ChatMessage,
  DashboardSummary,
  ExplanationMode,
  ProgressSnapshot,
  ProgressSyncResponse,
  Profile,
  SystemStatus,
} from "@/lib/learning/contracts";
import type { Subject } from "@/lib/learning/contracts";
import type { CycleTariffId } from "@/lib/payment-plans";

const networkErrorMessage =
  "Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.";

function getResponseErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const error = "error" in data ? data.error : undefined;
    const message = "message" in data ? data.message : undefined;

    if (typeof error === "string" && error.trim()) {
      return error;
    }

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

/** Маркер в тексте ошибки — по нему клиент сбрасывает teaching conversation и предлагает повтор. */
export const DIFY_STALE_UPLOAD_ERROR_MARK = "Старый диалог в нейросервисе ссылался на удалённый файл";

export function isDifyStaleUploadConversationError(message: string): boolean {
  const m = message.trim();
  if (/upload file\s+[0-9a-f-]{36}\s+not found/i.test(m)) {
    return true;
  }
  if (/upload file.+not found/i.test(m)) {
    return true;
  }
  if (m.includes(DIFY_STALE_UPLOAD_ERROR_MARK)) {
    return true;
  }
  if (m.includes("битую ссылку на upload")) {
    return true;
  }
  return false;
}

/** Перевод типичных ответов Dify в текст для ученика (оригинал сохраняем, если шаблон не подошёл). */
function humanizeDifyClientMessage(raw: string): string {
  const t = raw.trim();
  if (!t) {
    return raw;
  }
  if (/upload file\s+[0-9a-f-]{36}\s+not found/i.test(t) || /upload file.+not found/i.test(t)) {
    return (
      `${DIFY_STALE_UPLOAD_ERROR_MARK}. Диалог разбора сброшен — нажмите «Сгенерировать объяснение» или отправьте сообщение ещё раз. ` +
      "Если ошибка не исчезнет, в Dify проверьте узлы с файлами и знаниями."
    );
  }
  return t;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(networkErrorMessage);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(getResponseErrorMessage(data, "Не удалось выполнить запрос."));
  }

  return (await response.json()) as T;
}

async function getJson<T>(url: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, { credentials: "include" });
  } catch {
    throw new Error(networkErrorMessage);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(getResponseErrorMessage(data, "Не удалось загрузить данные."));
  }

  return (await response.json()) as T;
}

export type DifyStreamResult = {
  content: string;
  conversationId?: string;
};

/** Строка SSE может содержать несколько `data: {...}` подряд (см. доки Dify). */
function processSseLineForDify(
  line: string,
  streamState: { content: string; conversationId?: string },
  onChunk?: (content: string) => void,
) {
  const trimmed = line.trimEnd();
  if (!trimmed) {
    return;
  }

  const segments = trimmed
    .split(/(?=data:)/g)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (!segment.startsWith("data:")) {
      continue;
    }

    const raw = segment.slice("data:".length).trimStart().trim();
    if (!raw || raw === "[DONE]") {
      continue;
    }

    try {
      applyDifyStreamPayload(JSON.parse(raw) as unknown, streamState, onChunk);
    } catch {
      // фрагмент JSON или мусор между чанками
    }
  }
}

function joinOutputStrings(outputs: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const value of Object.values(outputs)) {
    if (typeof value === "string" && value.trim()) {
      parts.push(value);
    } else if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      if (typeof nested.text === "string" && nested.text.trim()) {
        parts.push(nested.text.trim());
      }
    }
  }
  return parts.join("\n\n").trim();
}

function streamErrorMessage(obj: Record<string, unknown>): string {
  if (typeof obj.message === "string" && obj.message.trim()) {
    return obj.message.trim();
  }
  const data = obj.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.message === "string" && d.message.trim()) {
      return d.message.trim();
    }
  }
  return "";
}

/**
 * Dify chat-messages streaming mixes formats:
 * - Chatbot / agent: top-level `answer` deltas, `conversation_id`.
 * - Chatflow / workflow: `text_chunk` with `data.text`, final `workflow_finished` with `data.outputs`.
 */
function applyDifyStreamPayload(
  parsed: unknown,
  sink: { content: string; conversationId?: string },
  onChunk?: (content: string) => void,
) {
  if (!parsed || typeof parsed !== "object") {
    return;
  }

  const obj = parsed as Record<string, unknown>;
  const event = typeof obj.event === "string" ? obj.event : "";
  const dataPayload =
    obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : null;

  if (event === "ping") {
    return;
  }

  if (event === "error") {
    const msg = streamErrorMessage(obj);
    if (msg) {
      throw new Error(humanizeDifyClientMessage(msg));
    }
    throw new Error("Dify вернул ошибку в потоке ответа.");
  }

  if (typeof obj.conversation_id === "string" && obj.conversation_id) {
    sink.conversationId = obj.conversation_id;
  }
  if (dataPayload && typeof dataPayload.conversation_id === "string" && dataPayload.conversation_id) {
    sink.conversationId = dataPayload.conversation_id;
  }

  if (typeof obj.answer === "string" && obj.answer.length > 0) {
    sink.content += obj.answer;
    onChunk?.(sink.content);
    return;
  }

  if (dataPayload && typeof dataPayload.answer === "string" && dataPayload.answer.length > 0) {
    sink.content += dataPayload.answer;
    onChunk?.(sink.content);
    return;
  }

  if (typeof obj.delta === "string" && obj.delta.length > 0) {
    sink.content += obj.delta;
    onChunk?.(sink.content);
    return;
  }

  if (event === "text_chunk" && dataPayload) {
    if (typeof dataPayload.text === "string" && dataPayload.text.length > 0) {
      sink.content += dataPayload.text;
      onChunk?.(sink.content);
    }
    return;
  }

  if (event === "workflow_finished" && dataPayload) {
    const outputs = dataPayload.outputs;
    if (outputs && typeof outputs === "object" && !sink.content.trim()) {
      const text = joinOutputStrings(outputs as Record<string, unknown>);
      if (text) {
        sink.content += text;
        onChunk?.(sink.content);
      }
    }
  }
}

export function fetchSystemStatus() {
  return getJson<SystemStatus>("/api/system/status");
}

export function fetchAuthSession() {
  return getJson<{
    ok: boolean;
    authenticated: boolean;
    session: AuthSessionPublic | null;
  }>("/api/auth/session");
}

export function logoutAuthSession() {
  return postJson<{ ok: boolean }>("/api/auth/logout", {});
}

export async function fetchDashboardSummary() {
  return getJson<{
    ok: boolean;
    database: boolean;
    summary: DashboardSummary | null;
  }>("/api/dashboard/summary");
}

export function generateTask(input: {
  exam: "OGE";
  subject: Subject;
  taskNumber: string;
  conversationId?: string;
}, options?: { onChunk?: (content: string) => void }) {
  return postDifyStream("/api/ai/generate-task", {
    action: "generate_task",
    ...input,
  }, options);
}

async function postDifyStream(
  url: string,
  payload: unknown,
  options?: { onChunk?: (content: string) => void },
): Promise<DifyStreamResult> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(networkErrorMessage);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const raw = getResponseErrorMessage(data, "AI-сервис временно недоступен.");
    throw new Error(humanizeDifyClientMessage(raw));
  }

  if (!response.body) {
    throw new Error("AI-сервис не вернул поток ответа. Попробуйте ещё раз.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const streamState = {
    content: "",
    conversationId: undefined as string | undefined,
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        processSseLineForDify(line, streamState, options?.onChunk);
      }

      if (done) {
        break;
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Соединение с AI-сервисом прервалось. Попробуйте повторить запрос.");
  }

  if (buffer.trim()) {
    processSseLineForDify(buffer, streamState, options?.onChunk);
  }

  return {
    content: streamState.content.trim(),
    conversationId: streamState.conversationId,
  };
}

export function explainTask(input: {
  exam: "OGE";
  subject: Subject;
  taskNumber: string;
  taskText: string;
  mode: ExplanationMode;
  conversationId?: string | null;
}, options?: { onChunk?: (content: string) => void }) {
  return postDifyStream("/api/ai/generate-task", {
    action: "explain_task",
    ...input,
    conversationId: input.conversationId ?? undefined,
  }, options);
}

export function requestSocraticStep(input: {
  exam: "OGE";
  subject: Subject;
  taskNumber: string;
  taskText: string;
  studentMessage: string;
  history: ChatMessage[];
  conversationId?: string | null;
}, options?: { onChunk?: (content: string) => void }) {
  return postDifyStream("/api/ai/generate-task", {
    action: "socratic_step",
    ...input,
    conversationId: input.conversationId ?? undefined,
  }, options);
}

export function syncProgressToApi(input: {
  telegramUserId: string | null;
  profile: Profile;
  progress: ProgressSnapshot;
  studySession?: {
    sessionId?: string;
    taskNumber: string;
    taskText?: string;
    explanation?: string;
    difyConversationId?: string;
    appendMessages?: ChatMessage[];
  };
}) {
  return postJson<ProgressSyncResponse>("/api/progress/update", {
    telegramUserId: input.telegramUserId ?? undefined,
    profile: input.profile,
    progress: input.progress,
    studySession: input.studySession,
  });
}

export function authenticateTelegram(initData: string) {
  return postJson<{
    ok: boolean;
    user?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    } | null;
    message?: string;
  }>("/api/auth/telegram", {
    initData,
  });
}

export function createYooKassaCheckout(input: {
  studentName?: string;
  tariffId: CycleTariffId;
  amountRub: number;
  cyclesCount: number;
}) {
  return postJson<{
    ok: boolean;
    paymentId: string;
    confirmationUrl: string | null;
    status: string;
    applied?: boolean;
    already?: boolean;
    tariff: {
      id: CycleTariffId;
      title: string;
      amountRub: number;
      cyclesCount: number;
      description: string;
    };
  }>("/api/payments/yookassa/create", input);
}

export function fetchYooKassaPayment(paymentId: string) {
  return getJson<{
    ok: boolean;
    payment: {
      id: string;
      status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
      paid: boolean;
      amount: {
        value: string;
        currency: string;
      };
      description?: string;
      created_at: string;
    };
  }>(`/api/payments/yookassa/${encodeURIComponent(paymentId)}`);
}

export function syncYooKassaPayment(input: { paymentId: string }) {
  return postJson<{
    ok: boolean;
    applied?: boolean;
    already?: boolean;
    reason?: string;
  }>("/api/payments/yookassa/sync", input);
}
