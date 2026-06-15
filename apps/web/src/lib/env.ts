const requiredServerEnv = [
  "DEEPSEEK_API_KEY",
] as const;

export type RequiredServerEnvKey = (typeof requiredServerEnv)[number];

export function getServerEnv() {
  return {
    databaseUrl: process.env.DATABASE_URL ?? "",
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    workerSecret: process.env.WORKER_SECRET ?? "",
    // AI gateway
    deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    gatewayFallbackApiKey: process.env.GATEWAY_FALLBACK_API_KEY ?? "",
    gatewayFallbackBaseUrl: process.env.GATEWAY_FALLBACK_BASE_URL ?? "https://api.openai.com/v1",
    langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY ?? "",
    langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY ?? "",
    langfuseBaseUrl: process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com",
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
    authCookieSecret: process.env.AUTH_COOKIE_SECRET ?? "",
    vkClientId: process.env.VK_CLIENT_ID ?? "",
    vkClientSecret: process.env.VK_CLIENT_SECRET ?? "",
    vkRedirectUri: process.env.VK_REDIRECT_URI ?? "",
    yandexClientId: process.env.YANDEX_CLIENT_ID ?? "",
    yandexClientSecret: process.env.YANDEX_CLIENT_SECRET ?? "",
    yandexRedirectUri: process.env.YANDEX_REDIRECT_URI ?? "",
    yooKassaShopId: process.env.YOOKASSA_SHOP_ID ?? "",
    yooKassaSecretKey: process.env.YOOKASSA_SECRET_KEY ?? "",
    yooKassaReturnUrl: process.env.YOOKASSA_RETURN_URL ?? "",
    yooKassaWebhookToken: process.env.YOOKASSA_WEBHOOK_TOKEN ?? "",
    yooKassaWebhookBasicUser: process.env.YOOKASSA_WEBHOOK_BASIC_USER ?? "",
    yooKassaWebhookBasicPassword: process.env.YOOKASSA_WEBHOOK_BASIC_PASSWORD ?? "",
    yooKassaWebhookIpAllowlistDisabled:
      process.env.YOOKASSA_WEBHOOK_IP_ALLOWLIST_DISABLED ?? "",
  };
}

export function getMissingServerEnv(): RequiredServerEnvKey[] {
  return requiredServerEnv.filter((key) => !process.env[key]);
}

export function isAiEnabled() {
  return getMissingServerEnv().length === 0;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getYooKassaReturnUrl() {
  const env = getServerEnv();

  return env.yooKassaReturnUrl || `${env.appBaseUrl}/pay/success`;
}

export function isYooKassaConfigured() {
  const env = getServerEnv();

  return Boolean(env.yooKassaShopId && env.yooKassaSecretKey);
}

export function isYooKassaWebhookIpAllowlistDisabled() {
  const v = getServerEnv().yooKassaWebhookIpAllowlistDisabled;

  return v === "1" || v === "true" || v === "yes";
}

/** Если `true`, AI-доступ доступен только при положительном балансе советов Сократа в БД. */
export function requireStarterEntitlementForAi() {
  const v = process.env.REQUIRE_STARTER_ENTITLEMENT_FOR_AI;
  return v === "1" || v === "true" || v === "yes";
}
