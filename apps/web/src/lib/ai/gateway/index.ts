/**
 * AI Gateway — единая точка входа для всех LLM-вызовов.
 *
 * Контракт: OpenAI-совместимый API.
 * Провайдер и модель определяются ролью через конфиг.
 * При ошибке основного провайдера — автоматический переход на fallback.
 * Каждый вызов трейсится в Langfuse.
 *
 * Использование:
 *   import { gatewayStream, gatewayGenerate } from "@/lib/ai/gateway";
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText, type CoreMessage } from "ai";

import {
  getRoleConfig,
  getPrimaryProviderConfig,
  getFallbackProviderConfig,
  isProviderReady,
} from "./config";
import { startTrace } from "./tracing";
import type { GatewayRequest, GatewayTextResult, ProviderConfig } from "./types";

export type { GatewayRole, GatewayRequest, GatewayTextResult, GatewayMessage } from "./types";

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildProvider(cfg: ProviderConfig) {
  const factory = createOpenAI({
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey,
    compatibility: "compatible",
  });
  return factory(cfg.model);
}

function toCoreMessages(msgs: GatewayRequest["messages"]): CoreMessage[] {
  return msgs as CoreMessage[];
}

function resolveProviders(req: GatewayRequest): {
  primary: ProviderConfig;
  fallback: ProviderConfig;
} {
  return {
    primary: getPrimaryProviderConfig(req.role),
    fallback: getFallbackProviderConfig(req.role),
  };
}

function noProviderError(): never {
  throw new Error(
    "AI gateway: нет доступного провайдера. Задайте DEEPSEEK_API_KEY или GATEWAY_FALLBACK_API_KEY.",
  );
}

// ─── gatewayGenerate ──────────────────────────────────────────────────────────

/** Полный ответ (не стриминг). Используется для Generator и Grader. */
export async function gatewayGenerate(req: GatewayRequest): Promise<GatewayTextResult> {
  const cfg = getRoleConfig(req.role);
  const { primary, fallback } = resolveProviders(req);
  const msgs = toCoreMessages(req.messages);
  const traceBase = { role: req.role, sessionId: req.sessionId, subject: req.subject, taskNumber: req.taskNumber };

  if (isProviderReady(primary)) {
    const trace = await startTrace({ ...traceBase, model: primary.model, provider: "primary" });
    try {
      const result = await generateText({
        model: buildProvider(primary),
        messages: msgs,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
      });
      trace.setUsage(result.usage.promptTokens, result.usage.completionTokens);
      await trace.flush();
      return { text: result.text, usage: result.usage };
    } catch (err) {
      trace.setError(err);
      await trace.flush();
      // fall through to fallback
    }
  }

  if (!isProviderReady(fallback)) noProviderError();

  const trace = await startTrace({ ...traceBase, model: fallback.model, provider: "fallback" });
  try {
    const result = await generateText({
      model: buildProvider(fallback),
      messages: msgs,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
    });
    trace.setUsage(result.usage.promptTokens, result.usage.completionTokens);
    await trace.flush();
    return { text: result.text, usage: result.usage };
  } catch (err) {
    trace.setError(err);
    await trace.flush();
    throw err;
  }
}

// ─── gatewayStream ────────────────────────────────────────────────────────────

/**
 * Стриминговый ответ. Используется для Tutor и Explainer.
 * Возвращает `ReadableStream<string>` — текстовые дельты.
 * Трейсинг завершается в onFinish-колбэке после закрытия потока.
 */
export async function gatewayStream(req: GatewayRequest): Promise<ReadableStream<string>> {
  const cfg = getRoleConfig(req.role);
  const { primary, fallback } = resolveProviders(req);
  const msgs = toCoreMessages(req.messages);
  const traceBase = { role: req.role, sessionId: req.sessionId, subject: req.subject, taskNumber: req.taskNumber };

  const tryStream = async (
    provCfg: ProviderConfig,
    providerLabel: "primary" | "fallback",
  ): Promise<ReadableStream<string>> => {
    const trace = await startTrace({ ...traceBase, model: provCfg.model, provider: providerLabel });

    const result = streamText({
      model: buildProvider(provCfg),
      messages: msgs,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      onFinish: async ({ usage }) => {
        trace.setUsage(usage.promptTokens, usage.completionTokens);
        await trace.flush();
      },
    });

    return result.textStream;
  };

  if (isProviderReady(primary)) {
    try {
      return await tryStream(primary, "primary");
    } catch {
      // fall through
    }
  }

  if (!isProviderReady(fallback)) noProviderError();
  return tryStream(fallback, "fallback");
}
