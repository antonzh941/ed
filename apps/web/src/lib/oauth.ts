import crypto from "node:crypto";

import { cookies } from "next/headers";

import type { AuthSessionPublic } from "@/lib/learning/contracts";
import { getServerEnv } from "@/lib/env";
import { getPrismaClient } from "@/lib/prisma";

export type AuthProvider = "vk" | "yandex";

export type AuthSession = {
  appUserKey: string;
  provider: AuthProvider;
  displayName: string | null;
  email: string | null;
};

export function authSessionToPublic(session: AuthSession): AuthSessionPublic {
  return { provider: session.provider, displayName: session.displayName };
}

type ProviderProfile = {
  provider: AuthProvider;
  providerUserId: string;
  email: string | null;
  displayName: string | null;
};

type SignedSessionPayload = AuthSession & {
  exp: number;
};

export const AUTH_SESSION_COOKIE = "sokrat-auth-session";
export const AUTH_STATE_COOKIE = "sokrat-auth-state";
export const AUTH_GUEST_KEY_COOKIE = "sokrat-auth-guest-key";

const DEFAULT_EXAM = "OGE" as const;
const DEFAULT_SUBJECT = "russian" as const;

function authSessionTtlSeconds() {
  const raw = process.env.AUTH_SESSION_TTL_DAYS?.trim();
  const days = raw ? Number(raw) : NaN;
  if (Number.isFinite(days) && days > 0 && days <= 365) {
    return Math.floor(days * 24 * 60 * 60);
  }
  return 60 * 60 * 24 * 30;
}

export function getAuthSessionMaxAgeSeconds() {
  return authSessionTtlSeconds();
}
const DEFAULT_VK_CLIENT_ID = "54572048";
const AUTH_COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

const MIN_AUTH_COOKIE_SECRET_LENGTH = 32;

function getAuthSecret() {
  const secret = getServerEnv().authCookieSecret.trim();

  if (process.env.NODE_ENV === "production") {
    if (secret.length < MIN_AUTH_COOKIE_SECRET_LENGTH) {
      throw new Error(
        `AUTH_COOKIE_SECRET is required in production (min ${MIN_AUTH_COOKIE_SECRET_LENGTH} characters, use a random string).`,
      );
    }
    return secret;
  }

  return secret || "dev-auth-cookie-secret";
}

/** Предыдущий секрет при ротации: куки, подписанные старым ключом, ещё принимаются. */
function getAuthCookieSecretPrevious() {
  const s = process.env.AUTH_COOKIE_SECRET_PREVIOUS?.trim();
  if (!s) {
    return null;
  }
  if (process.env.NODE_ENV === "production" && s.length < MIN_AUTH_COOKIE_SECRET_LENGTH) {
    return null;
  }
  return s;
}

/** Читает подписанную сессию из httpOnly cookie (App Router). */
export async function readAuthSessionFromCookies(): Promise<AuthSession | null> {
  // Dev-bypass: задай DEV_AUTH_BYPASS=1 в .env для работы без входа.
  const devBypass = process.env.DEV_AUTH_BYPASS?.replace(/['"]/g, "");
  if (devBypass === "1" || devBypass === "true") {
    const userKey = (process.env.DEV_AUTH_USER_KEY ?? "dev-local-user").replace(/['"]/g, "");
    return {
      appUserKey: userKey,
      provider: "vk",
      displayName: "Dev User",
      email: null,
    };
  }

  const cookieStore = await cookies();
  return parseAuthSessionCookie(cookieStore.get(AUTH_SESSION_COOKIE)?.value);
}

function sign(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function isAuthProvider(value: unknown): value is AuthProvider {
  return value === "vk" || value === "yandex";
}

function signatureMatches(value: string, signature: string, secret: string) {
  const expected = sign(value, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function createAuthSessionCookie(session: AuthSession) {
  const ttl = authSessionTtlSeconds();
  const payload: SignedSessionPayload = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + ttl,
  };
  const encodedPayload = base64url(JSON.stringify(payload));

  return `${encodedPayload}.${sign(encodedPayload, getAuthSecret())}`;
}

export function getAuthCookieOptions(maxAge: number) {
  return {
    ...AUTH_COOKIE_BASE_OPTIONS,
    maxAge,
  };
}

export function getExpiredAuthCookieOptions() {
  return {
    ...AUTH_COOKIE_BASE_OPTIONS,
    expires: new Date(0),
    maxAge: 0,
  };
}

export function parseAuthSessionCookie(value: string | undefined): AuthSession | null {
  if (!value) {
    return null;
  }

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }
  const primary = getAuthSecret();
  const previous = getAuthCookieSecretPrevious();
  const sigOk =
    signatureMatches(encodedPayload, signature, primary) ||
    (previous ? signatureMatches(encodedPayload, signature, previous) : false);
  if (!sigOk) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as SignedSessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (
      typeof payload.appUserKey !== "string" ||
      !payload.appUserKey.trim() ||
      !isAuthProvider(payload.provider) ||
      (payload.displayName !== null && typeof payload.displayName !== "string") ||
      (payload.email !== null && typeof payload.email !== "string")
    ) {
      return null;
    }

    return {
      appUserKey: payload.appUserKey,
      provider: payload.provider,
      displayName: payload.displayName,
      email: payload.email,
    };
  } catch {
    return null;
  }
}

export function getOAuthRedirectUri(provider: AuthProvider) {
  const env = getServerEnv();
  const explicit = provider === "vk" ? env.vkRedirectUri : env.yandexRedirectUri;

  return explicit || `${env.appBaseUrl}/api/auth/oauth/callback/${provider}`;
}

export function getVkIdClientId() {
  return getServerEnv().vkClientId || DEFAULT_VK_CLIENT_ID;
}

export function getVkIdRedirectUri() {
  const env = getServerEnv();

  return env.vkRedirectUri || `${env.appBaseUrl}/`;
}

export function getOAuthAuthorizationUrl(input: {
  provider: AuthProvider;
  state: string;
}) {
  const env = getServerEnv();
  const redirectUri = getOAuthRedirectUri(input.provider);

  if (input.provider === "vk") {
    if (!env.vkClientId || !env.vkClientSecret) {
      throw new Error("VK ID не настроен. Добавьте VK_CLIENT_ID и VK_CLIENT_SECRET.");
    }

    const url = new URL("https://oauth.vk.com/authorize");
    url.searchParams.set("client_id", env.vkClientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "email");
    url.searchParams.set("state", input.state);
    url.searchParams.set("v", "5.199");
    return url;
  }

  if (!env.yandexClientId || !env.yandexClientSecret) {
    throw new Error("Yandex ID не настроен. Добавьте YANDEX_CLIENT_ID и YANDEX_CLIENT_SECRET.");
  }

  const url = new URL("https://oauth.yandex.ru/authorize");
  url.searchParams.set("client_id", env.yandexClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  return url;
}

async function exchangeYandexCode(code: string): Promise<ProviderProfile> {
  const env = getServerEnv();
  const response = await fetch("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env.yandexClientId,
      client_secret: env.yandexClientSecret,
      redirect_uri: getOAuthRedirectUri("yandex"),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Yandex ID не вернул access token.");
  }

  const token = (await response.json()) as { access_token?: string };
  if (!token.access_token) {
    throw new Error("Yandex ID не вернул access token.");
  }

  const profileResponse = await fetch("https://login.yandex.ru/info?format=json", {
    headers: {
      Authorization: `OAuth ${token.access_token}`,
    },
    cache: "no-store",
  });
  if (!profileResponse.ok) {
    throw new Error("Не удалось получить профиль Yandex ID.");
  }

  const profile = (await profileResponse.json()) as {
    id?: string;
    default_email?: string;
    display_name?: string;
    real_name?: string;
    login?: string;
  };
  if (!profile.id) {
    throw new Error("Yandex ID не вернул id пользователя.");
  }

  return {
    provider: "yandex",
    providerUserId: profile.id,
    email: profile.default_email ?? null,
    displayName: profile.display_name || profile.real_name || profile.login || null,
  };
}

async function exchangeVkCode(code: string): Promise<ProviderProfile> {
  const env = getServerEnv();
  const tokenUrl = new URL("https://oauth.vk.com/access_token");
  tokenUrl.searchParams.set("client_id", env.vkClientId);
  tokenUrl.searchParams.set("client_secret", env.vkClientSecret);
  tokenUrl.searchParams.set("redirect_uri", getOAuthRedirectUri("vk"));
  tokenUrl.searchParams.set("code", code);

  const response = await fetch(tokenUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("VK ID не вернул access token.");
  }

  const token = (await response.json()) as {
    access_token?: string;
    user_id?: number;
    email?: string;
  };
  if (!token.access_token || !token.user_id) {
    throw new Error("VK ID не вернул id пользователя.");
  }

  const profileUrl = new URL("https://api.vk.com/method/users.get");
  profileUrl.searchParams.set("access_token", token.access_token);
  profileUrl.searchParams.set("user_ids", String(token.user_id));
  profileUrl.searchParams.set("fields", "first_name,last_name");
  profileUrl.searchParams.set("v", "5.199");

  const profileResponse = await fetch(profileUrl, { cache: "no-store" });
  const profilePayload = (await profileResponse.json().catch(() => null)) as
    | {
        response?: Array<{
          first_name?: string;
          last_name?: string;
        }>;
      }
    | null;
  const profile = profilePayload?.response?.[0];
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();

  return {
    provider: "vk",
    providerUserId: String(token.user_id),
    email: token.email ?? null,
    displayName: displayName || null,
  };
}

export async function exchangeVkIdCode(input: {
  code: string;
  deviceId: string;
  codeVerifier: string;
  state: string;
}): Promise<ProviderProfile> {
  const clientId = getVkIdClientId();
  const response = await fetch("https://id.vk.ru/oauth2/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: getVkIdRedirectUri(),
      client_id: clientId,
      device_id: input.deviceId,
      state: input.state,
    }),
    cache: "no-store",
  });

  const token = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        user_id?: string | number;
        state?: string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!response.ok || !token?.access_token || !token.user_id) {
    throw new Error(token?.error_description || "VK ID не вернул access token.");
  }
  if (token.state && token.state !== input.state) {
    throw new Error("VK ID вернул неверный state.");
  }

  const profileResponse = await fetch("https://id.vk.ru/oauth2/user_info", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      access_token: token.access_token,
    }),
    cache: "no-store",
  });
  const profilePayload = (await profileResponse.json().catch(() => null)) as
    | {
        user?: {
          user_id?: string | number;
          first_name?: string;
          last_name?: string;
          email?: string;
        };
      }
    | null;
  const user = profilePayload?.user;
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || null;

  return {
    provider: "vk",
    providerUserId: String(user?.user_id ?? token.user_id),
    email: user?.email ?? null,
    displayName,
  };
}

export function exchangeOAuthCode(provider: AuthProvider, code: string) {
  return provider === "vk" ? exchangeVkCode(code) : exchangeYandexCode(code);
}

async function mergeGuestUserIntoAuthUser(input: {
  guestAppUserKey: string | null;
  authUserId: string;
  authAppUserKey: string;
}) {
  if (!input.guestAppUserKey || input.guestAppUserKey === input.authAppUserKey) {
    return;
  }
  const guestAppUserKey = input.guestAppUserKey;

  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const guest = await tx.user.findUnique({
      where: { appUserKey: guestAppUserKey },
      select: {
        id: true,
        cyclesBalance: true,
      },
    });
    if (!guest || guest.id === input.authUserId) {
      return;
    }

    await tx.user.update({
      where: { id: input.authUserId },
      data: {
        cyclesBalance: {
          increment: guest.cyclesBalance,
        },
      },
    });
    await tx.studySession.updateMany({
      where: { userId: guest.id },
      data: { userId: input.authUserId },
    });
    await tx.paymentEvent.updateMany({
      where: { appUserKey: guestAppUserKey },
      data: { appUserKey: input.authAppUserKey },
    });
    await tx.user.delete({
      where: { id: guest.id },
    });
  });
}

export async function upsertOAuthUser(input: {
  profile: ProviderProfile;
  guestAppUserKey: string | null;
}) {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("DATABASE_URL не настроен.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.authAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: input.profile.provider,
          providerUserId: input.profile.providerUserId,
        },
      },
      include: { user: true },
    });

    if (existing) {
      const account = await tx.authAccount.update({
        where: { id: existing.id },
        data: {
          email: input.profile.email,
          displayName: input.profile.displayName,
        },
        include: { user: true },
      });
      await tx.user.update({
        where: { id: account.userId },
        data: {
          displayName: input.profile.displayName ?? undefined,
        },
      });

      return account;
    }

    return tx.authAccount.create({
      data: {
        provider: input.profile.provider,
        providerUserId: input.profile.providerUserId,
        email: input.profile.email,
        displayName: input.profile.displayName,
        user: {
          create: {
            appUserKey: `auth-${crypto.randomUUID()}`,
            displayName: input.profile.displayName,
            exam: DEFAULT_EXAM,
            subject: DEFAULT_SUBJECT,
          },
        },
      },
      include: { user: true },
    });
  });

  await mergeGuestUserIntoAuthUser({
    guestAppUserKey: input.guestAppUserKey,
    authUserId: result.userId,
    authAppUserKey: result.user.appUserKey,
  });

  return {
    appUserKey: result.user.appUserKey,
    provider: input.profile.provider,
    displayName: input.profile.displayName,
    email: input.profile.email,
  } satisfies AuthSession;
}
