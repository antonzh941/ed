"use client";

import Link from "next/link";
import { Config, ConfigAuthMode, ConfigResponseMode, OneTap, OneTapInternalEvents } from "@vkid/sdk";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useLearningStore } from "@/stores/learning-store";

type VkIdLoginPayload = {
  code?: string;
  device_id?: string;
  state?: string;
};

function toBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const binary = String.fromCharCode(...bytes);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createRandomState(minLength = 32) {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  const state = toBase64Url(bytes.buffer);
  if (state.length < minLength) {
    throw new Error("Не удалось сгенерировать корректный state.");
  }
  return state;
}

function createCodeVerifier() {
  // PKCE verifier must be 43..128 chars
  // 64 random bytes -> base64url ~86 chars, fits the range.
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  const verifier = toBase64Url(bytes.buffer);
  if (verifier.length < 43 || verifier.length > 128) {
    throw new Error("Не удалось сгенерировать корректный codeVerifier.");
  }
  return verifier;
}

async function createPkcePair() {
  const codeVerifier = createCodeVerifier();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));

  return {
    codeVerifier,
    codeChallenge: toBase64Url(digest),
  };
}

function isVkIdLoginPayload(payload: unknown): payload is Required<VkIdLoginPayload> {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as VkIdLoginPayload;

  return Boolean(candidate.code && candidate.device_id && candidate.state);
}

export function LoginPage() {
  const appUserKey = useLearningStore((state) => state.appUserKey);
  const vkContainerRef = useRef<HTMLDivElement>(null);
  const vkRenderedRef = useRef(false);
  const vkOneTapRef = useRef<OneTap | null>(null);
  const vkCodeVerifierRef = useRef<string | null>(null);
  const vkStateRef = useRef<string | null>(null);
  const [vkError, setVkError] = useState("");
  const [isVkLoading, setIsVkLoading] = useState(false);
  const [hasPrivacyConsent, setHasPrivacyConsent] = useState(false);

  const renderVkId = useCallback(async () => {
    if (!hasPrivacyConsent || vkRenderedRef.current || !vkContainerRef.current) {
      return;
    }

    try {
      const state = createRandomState(32);
      vkStateRef.current = state;
      const configUrl = new URL("/api/auth/vk-id/config", window.location.origin);
      if (appUserKey) {
        configUrl.searchParams.set("guestAppUserKey", appUserKey);
      }
      configUrl.searchParams.set("state", state);

      const [configResponse, pkce] = await Promise.all([fetch(configUrl), createPkcePair()]);
      if (!configResponse.ok) {
        throw new Error("Не удалось подготовить вход через VK ID.");
      }
      const config = (await configResponse.json()) as {
        appId: number;
        redirectUrl: string;
        state: string;
      };

      vkCodeVerifierRef.current = pkce.codeVerifier;
      Config.init({
        app: config.appId,
        redirectUrl: config.redirectUrl,
        responseMode: ConfigResponseMode.Callback,
        mode: ConfigAuthMode.InNewWindow,
        scope: "email phone",
        state: config.state,
        codeVerifier: pkce.codeVerifier,
      });

      vkRenderedRef.current = true;
      vkContainerRef.current.innerHTML = "";

      const oneTap = new OneTap();
      vkOneTapRef.current = oneTap;
      oneTap.render({ container: vkContainerRef.current });

      oneTap.on(OneTapInternalEvents.LOGIN_SUCCESS, async (payload: unknown) => {
        if (!isVkIdLoginPayload(payload) || payload.state !== config.state) {
          setVkError("VK ID вернул некорректный ответ.");
          return;
        }

        setIsVkLoading(true);
        setVkError("");
        try {
          const response = await fetch("/api/auth/vk-id/callback", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              code: payload.code,
              deviceId: payload.device_id,
              codeVerifier: vkCodeVerifierRef.current,
              state: payload.state,
            }),
          });
          if (!response.ok) {
            const result = (await response.json().catch(() => null)) as { error?: string } | null;
            throw new Error(result?.error || "Не удалось войти через VK ID.");
          }

          window.location.assign("/app?auth=success");
        } catch (error) {
          setVkError(error instanceof Error ? error.message : "Не удалось войти через VK ID.");
        } finally {
          setIsVkLoading(false);
        }
      });
    } catch (error) {
      console.error("vk id init failed", error);
      setVkError(error instanceof Error ? error.message : "Не удалось загрузить VK ID.");
    }
  }, [appUserKey, hasPrivacyConsent]);

  useEffect(() => {
    if (!hasPrivacyConsent) {
      vkRenderedRef.current = false;
      vkOneTapRef.current?.close();
      vkOneTapRef.current = null;
      if (vkContainerRef.current) {
        vkContainerRef.current.innerHTML = "";
      }
      return;
    }

    void renderVkId();
  }, [hasPrivacyConsent, renderVkId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F4] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]">
            <Sparkles className="h-10 w-10 text-white" />
          </div>
          <span className="text-3xl font-bold text-[#111111]">ИзиОГЭ</span>
        </div>

        <div className="rounded-[28px] border border-black/5 bg-white p-8 shadow-2xl shadow-black/5">
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-3xl font-bold text-[#111111]">Добро пожаловать!</h1>
            <p className="text-[#6B7280]">Войди, чтобы продолжить подготовку к ОГЭ</p>
          </div>

          <div className="space-y-4">
            <label className="flex gap-3 rounded-2xl border border-black/10 bg-[#F8F7F4] p-4 text-left text-sm leading-relaxed text-[#6B7280]">
              <input
                type="checkbox"
                checked={hasPrivacyConsent}
                onChange={(event) => setHasPrivacyConsent(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-black/20 accent-[#6D5DF6]"
              />
              <span>
                Я согласен с политикой обработки персональных данных. Если мне нет 18 — я
                подтверждаю, что родитель ознакомлен и согласен.
              </span>
            </label>

            {!hasPrivacyConsent ? (
              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed items-center justify-center rounded-2xl bg-[#0077FF]/45 px-6 py-4 font-medium text-white shadow-lg opacity-60"
              >
                Войти через ВК
              </button>
            ) : null}
            {hasPrivacyConsent ? <div id="vkid-one-tap" ref={vkContainerRef} /> : null}
            {isVkLoading ? (
              <p className="text-center text-sm text-[#6B7280]">Входим через VK ID...</p>
            ) : null}
            {vkError ? <p className="text-center text-sm text-red-500">{vkError}</p> : null}
          </div>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-black/10" />
            <span className="text-sm text-[#6B7280]">или</span>
            <div className="h-px flex-1 bg-black/10" />
          </div>

          <Link
            href="/app"
            className="block w-full rounded-2xl border border-black/5 bg-[#F8F7F4] px-6 py-4 text-center font-medium text-[#6B7280] transition-all hover:bg-[#F8F7F4]/80"
          >
            Посмотреть демо без входа
          </Link>
        </div>

        <div className="mt-8 space-y-3 text-center">
          <p className="text-sm text-[#6B7280]">
            Нет аккаунта?{" "}
            <Link href="/" className="font-medium text-[#6D5DF6] hover:text-[#5D4DE6]">
              Попробовать бесплатно
            </Link>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-[#6B7280]">
            <Link href="/legal/privacy" className="transition-colors hover:text-[#111111]">
              Политика ПД
            </Link>
            <Link href="/legal/terms" className="transition-colors hover:text-[#111111]">
              Соглашение
            </Link>
            <Link href="/legal/offer" className="transition-colors hover:text-[#111111]">
              Оферта
            </Link>
            <Link
              href="/support"
              className="cursor-pointer text-[#6B7280] underline decoration-transparent underline-offset-4 transition-colors hover:text-[#111111] hover:decoration-black/20"
            >
              Поддержка
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
