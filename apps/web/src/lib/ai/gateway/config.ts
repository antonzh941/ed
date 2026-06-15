import type { GatewayRole, ProviderConfig } from "./types";

interface RoleConfig {
  primaryModelEnvKey: string;
  primaryModelDefault: string;
  fallbackModelEnvKey: string;
  fallbackModelDefault: string;
  temperature: number;
  maxTokens: number;
}

const ROLE_CONFIG: Record<GatewayRole, RoleConfig> = {
  tutor: {
    primaryModelEnvKey: "GATEWAY_MODEL_TUTOR",
    primaryModelDefault: "deepseek-chat",
    fallbackModelEnvKey: "GATEWAY_FALLBACK_MODEL_FAST",
    fallbackModelDefault: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 1024,
  },
  generator: {
    primaryModelEnvKey: "GATEWAY_MODEL_GENERATOR",
    primaryModelDefault: "deepseek-reasoner",
    fallbackModelEnvKey: "GATEWAY_FALLBACK_MODEL_CAPABLE",
    fallbackModelDefault: "gpt-4o",
    temperature: 0.8,
    maxTokens: 2048,
  },
  grader: {
    primaryModelEnvKey: "GATEWAY_MODEL_GRADER",
    primaryModelDefault: "deepseek-reasoner",
    fallbackModelEnvKey: "GATEWAY_FALLBACK_MODEL_CAPABLE",
    fallbackModelDefault: "gpt-4o",
    temperature: 0.1,
    maxTokens: 2048,
  },
  explainer: {
    primaryModelEnvKey: "GATEWAY_MODEL_EXPLAINER",
    primaryModelDefault: "deepseek-chat",
    fallbackModelEnvKey: "GATEWAY_FALLBACK_MODEL_FAST",
    fallbackModelDefault: "gpt-4o-mini",
    temperature: 0.5,
    maxTokens: 2048,
  },
};

export function getRoleConfig(role: GatewayRole) {
  return ROLE_CONFIG[role];
}

/** Docker --env-file не убирает кавычки из значений, убираем сами. */
function stripEnvQuotes(value: string | undefined): string {
  return (value ?? "").replace(/^["']|["']$/g, "");
}

export function getPrimaryProviderConfig(role: GatewayRole): ProviderConfig {
  const cfg = ROLE_CONFIG[role];
  return {
    baseURL: stripEnvQuotes(process.env.DEEPSEEK_BASE_URL) || "https://api.deepseek.com/v1",
    apiKey: stripEnvQuotes(process.env.DEEPSEEK_API_KEY),
    model: stripEnvQuotes(process.env[cfg.primaryModelEnvKey]) || cfg.primaryModelDefault,
  };
}

export function getFallbackProviderConfig(role: GatewayRole): ProviderConfig {
  const cfg = ROLE_CONFIG[role];
  return {
    baseURL: stripEnvQuotes(process.env.GATEWAY_FALLBACK_BASE_URL) || "https://api.openai.com/v1",
    apiKey: stripEnvQuotes(process.env.GATEWAY_FALLBACK_API_KEY),
    model: stripEnvQuotes(process.env[cfg.fallbackModelEnvKey]) || cfg.fallbackModelDefault,
  };
}

export function isProviderReady(cfg: ProviderConfig): boolean {
  return cfg.apiKey.length > 0;
}
