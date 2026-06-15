export type GatewayRole = "tutor" | "generator" | "grader" | "explainer";

export interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GatewayRequest {
  role: GatewayRole;
  messages: GatewayMessage[];
  /** Псевдонимизированный ID сессии для Langfuse — без PII. */
  sessionId?: string;
  /** Учебный контент для Langfuse-метаданных. */
  subject?: string;
  taskNumber?: string;
}

export interface GatewayTextResult {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
}

export interface ProviderConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}
