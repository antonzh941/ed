"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

import { createYooKassaCheckout } from "@/lib/learning/api";
import { cycleTariffs, type CycleTariff, type CycleTariffId } from "@/lib/payment-plans";
import { useLearningAppController } from "@/components/learning/use-learning-app-controller";

const LAST_PAYMENT_KEY = "sokratai-last-payment-id";

const planVisuals: Record<CycleTariffId, {
  features: string[];
  buttonLabel: string;
}> = {
  "test-drive": {
    features: ["Бесплатная проба", "Метод Сократа", "Базовая статистика"],
    buttonLabel: "Попробовать",
  },
  trial: {
    features: ["Короткий пакет", "Проверка формата", "ИИ-репетитор"],
    buttonLabel: "Выбрать",
  },
  "single-subject": {
    features: ["Регулярная подготовка", "Один предмет", "Приоритетная поддержка"],
    buttonLabel: "Выбрать",
  },
  "may-marathon": {
    features: ["Интенсивная подготовка", "Перед экзаменом", "Персональный куратор"],
    buttonLabel: "Выбрать",
  },
};

export function PricingPage() {
  const controller = useLearningAppController();
  const [loadingTariffId, setLoadingTariffId] = useState<CycleTariffId | null>(null);
  const [message, setMessage] = useState("");

  async function handleCheckout(tariff: CycleTariff) {
    if (!controller.authSession) {
      setMessage("Войдите через VK ID или Яндекс, чтобы пакет был привязан к вашему аккаунту.");
      window.location.assign("/login");
      return;
    }

    setLoadingTariffId(tariff.id);
    setMessage("");

    try {
      const data = await createYooKassaCheckout({
        tariffId: tariff.id,
        amountRub: tariff.amountRub,
        cyclesCount: tariff.cyclesCount,
      });

      if (data.status === "succeeded" && !data.confirmationUrl) {
        setMessage(
          data.already
            ? "Тест-драйв уже был активирован для этого кабинета."
            : "Тест-драйв активирован: советы Сократа начислены на баланс.",
        );
        setLoadingTariffId(null);
        return;
      }

      if (!data.confirmationUrl) {
        throw new Error("ЮKassa не вернула ссылку на подтверждение платежа.");
      }

      window.sessionStorage.setItem(LAST_PAYMENT_KEY, data.paymentId);
      window.location.assign(data.confirmationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось перейти к оплате.");
      setLoadingTariffId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-semibold text-[#111111]">ИзиОГЭ</span>
            </Link>
            <Link
              href="/login"
              className="rounded-2xl bg-[#6D5DF6] px-6 py-2.5 text-white transition-all hover:scale-105 hover:bg-[#5D4DE6]"
            >
              Войти
            </Link>
          </div>
        </div>
      </header>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {message ? (
            <div className="mb-6 rounded-2xl border border-[#6D5DF6]/20 bg-white px-5 py-4 text-center text-sm text-[#6B7280]">
              {message}
            </div>
          ) : null}
          <div className="mb-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {cycleTariffs.map((tariff) => {
              const visual = planVisuals[tariff.id];
              const isPopular = tariff.id === "single-subject";
              const isMarathon = tariff.id === "may-marathon";
              const isLoading = loadingTariffId === tariff.id;
              const isDisabled = tariff.amountRub > 0 && !(controller.status?.paymentsEnabled ?? false);
              const requiresAuth = !controller.authSession;
              const buttonLabel = requiresAuth
                ? tariff.amountRub === 0
                  ? "Войти для тест-драйва"
                  : "Войти для покупки"
                : visual.buttonLabel;

              if (isMarathon) {
                return (
                  <div key={tariff.id} className="rounded-[28px] bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6] p-8 shadow-2xl shadow-purple-500/20 transition-all hover:scale-105">
                    <div className="mb-6">
                      <h3 className="mb-2 text-2xl font-semibold text-white">{tariff.title}</h3>
                      <div className="mb-1 flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-white">{tariff.amountRub}₽</span>
                      </div>
                      <p className="text-white/80">{tariff.cyclesCount} советов</p>
                    </div>

                    <ul className="mb-8 space-y-3">
                      {visual.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/30 backdrop-blur-sm">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                          <span className="font-medium text-white">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleCheckout(tariff)}
                      disabled={isLoading || isDisabled}
                      className="w-full rounded-2xl bg-white px-6 py-4 font-semibold text-[#6D5DF6] shadow-xl transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                    >
                      {isLoading ? "Перехожу к оплате..." : buttonLabel}
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={tariff.id}
                  className={`relative rounded-[28px] border p-8 transition-all hover:scale-105 ${
                    isPopular
                      ? "border-2 border-[#6D5DF6] bg-white shadow-2xl shadow-purple-500/20"
                      : "border-black/5 bg-white shadow-lg shadow-black/5"
                  }`}
                >
                  {isPopular ? (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#6D5DF6] to-[#8B5CF6] px-4 py-1.5 text-sm font-medium text-white shadow-lg">
                      Популярный
                    </div>
                  ) : null}

                  <div className={isPopular ? "mb-6 mt-2" : "mb-6"}>
                    <h3 className="mb-2 text-2xl font-semibold text-[#111111]">{tariff.title}</h3>
                    <div className="mb-1 flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-[#111111]">{tariff.amountRub}₽</span>
                    </div>
                    <p className="text-[#6B7280]">{tariff.cyclesCount} советов</p>
                  </div>

                  <ul className="mb-8 space-y-3">
                    {visual.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#6D5DF6]/20">
                          <Check className="h-3 w-3 text-[#6D5DF6]" />
                        </div>
                        <span className={isPopular ? "font-medium text-[#111111]" : "text-[#6B7280]"}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleCheckout(tariff)}
                    disabled={isLoading || isDisabled}
                    className={`w-full rounded-2xl px-6 py-4 font-medium transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 ${
                      isPopular
                        ? "bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6] font-semibold text-white shadow-xl shadow-purple-500/30"
                        : tariff.amountRub === 0
                          ? "border-2 border-black/10 bg-white text-[#111111] hover:border-[#6D5DF6]"
                          : "bg-gradient-to-br from-[#8B5CF6] to-[#6D5DF6] text-white shadow-lg shadow-purple-500/20"
                    }`}
                  >
                    {isLoading ? "Перехожу к оплате..." : buttonLabel}
                  </button>

                  {tariff.amountRub === 0 ? (
                    <p className="mt-4 text-center text-xs text-[#6B7280]">
                      {requiresAuth ? "Нужен вход, карта не нужна" : "Без карты"}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p className="mt-12 text-center text-sm text-[#6B7280]">
            Вопросы по оплате и доступу —{" "}
            <Link href="/support" className="font-medium text-[#6D5DF6] hover:text-[#5D4DE6]">
              поддержка
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
