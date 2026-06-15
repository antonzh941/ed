"use client";

import { useState } from "react";
import { CheckCircle2, CreditCard, LoaderCircle, WalletCards } from "lucide-react";

import { createYooKassaCheckout } from "@/lib/learning/api";
import { cycleTariffs, type CycleTariffId } from "@/lib/payment-plans";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SectionLabel } from "@/components/ui/section-label";

const LAST_PAYMENT_KEY = "sokratai-last-payment-id";

const featuredTariffId: CycleTariffId = "single-subject";

export function TariffCard({
  paymentsEnabled,
  cyclesBalance,
}: {
  paymentsEnabled: boolean;
  cyclesBalance: number;
}) {
  const [loadingTariffId, setLoadingTariffId] = useState<CycleTariffId | null>(null);
  const [error, setError] = useState("");
  const [grantedAdviceCount, setGrantedAdviceCount] = useState(0);
  const visibleAdviceBalance = cyclesBalance + grantedAdviceCount;

  async function handleCheckout(tariffId: CycleTariffId) {
    const tariff = cycleTariffs.find((item) => item.id === tariffId);
    if (!tariff) {
      setError("Неизвестный пакет советов Сократа.");
      return;
    }

    setLoadingTariffId(tariffId);
    setError("");

    try {
      const data = await createYooKassaCheckout({
        tariffId: tariff.id,
        amountRub: tariff.amountRub,
        cyclesCount: tariff.cyclesCount,
      });

      if (data.status === "succeeded" && !data.confirmationUrl) {
        if (data.applied) {
          setGrantedAdviceCount((value) => value + tariff.cyclesCount);
        }
        setError(
          data.already
            ? "Тест-драйв уже был активирован для этого кабинета."
            : "Тест-драйв активирован: 10 советов Сократа начислены на баланс.",
        );
        setLoadingTariffId(null);
        return;
      }

      if (!data.confirmationUrl) {
        throw new Error("ЮKassa не вернула ссылку на подтверждение платежа.");
      }

      window.sessionStorage.setItem(LAST_PAYMENT_KEY, data.paymentId);
      window.location.assign(data.confirmationUrl);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Не удалось перейти к оплате через ЮKassa.",
      );
      setLoadingTariffId(null);
    }
  }

  return (
    <Card elevated className="overflow-hidden p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionLabel>Оплата</SectionLabel>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            Пополните баланс советов Сократа
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--text-secondary)]">
            1 совет Сократа списывается за каждое сообщение нейросети: генерацию задачи,
            подсказку или объяснение.
          </p>
        </div>
        <Pill tone={visibleAdviceBalance > 0 ? "success" : "warm"}>
          <WalletCards className="h-3.5 w-3.5" />
          Доступно советов: {visibleAdviceBalance}
        </Pill>
      </div>
      <p className="mt-3 text-xs leading-6 text-[var(--text-muted)]">
        1 совет Сократа списывается за каждое сообщение нейросети (генерация задачи,
        подсказка или объяснение).
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cycleTariffs.map((tariff) => {
          const isLoading = loadingTariffId === tariff.id;
          const isFreeTariff = tariff.amountRub === 0;
          const isFeatured = tariff.id === featuredTariffId;

          return (
            <Card
              key={tariff.id}
              className={`relative flex h-full flex-col overflow-hidden p-5 transition duration-200 hover:-translate-y-1 ${
                isFeatured
                  ? "border-[var(--border-accent)] bg-[image:var(--gradient-primary)] text-white shadow-[var(--shadow-glow)]"
                  : "bg-white"
              }`}
            >
              {isFeatured ? (
                <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/15" />
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className={isFeatured ? "text-lg font-semibold text-white" : "text-lg font-semibold text-[var(--text-primary)]"}>
                    {tariff.title}
                  </h3>
                  <p className={isFeatured ? "mt-2 text-sm leading-6 text-white/80" : "mt-2 text-sm leading-6 text-[var(--text-secondary)]"}>
                    {tariff.description}
                  </p>
                </div>
                <Pill tone={isFreeTariff ? "success" : isFeatured ? "default" : "accent"} className={isFeatured ? "border-white/25 bg-white/20 text-white" : undefined}>
                  {isFreeTariff ? "Для новичков" : `${tariff.amountRub} ₽`}
                </Pill>
              </div>
              {isFreeTariff ? (
                <Pill tone="accent" className="mt-4 w-fit">
                  0 ₽
                </Pill>
              ) : null}

              <div className={isFeatured ? "mt-5 grid gap-3 text-sm text-white/85" : "mt-5 grid gap-3 text-sm text-[var(--text-secondary)]"}>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className={isFeatured ? "mt-0.5 h-4 w-4 shrink-0 text-white" : "mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-success)]"} />
                  <span className="leading-7">
                    Пакет: {tariff.cyclesCount} советов Сократа
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className={isFeatured ? "mt-0.5 h-4 w-4 shrink-0 text-white" : "mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-success)]"} />
                  <span className="leading-7">
                    ~{Math.round((tariff.amountRub / tariff.cyclesCount) * 10) / 10} ₽ за совет
                  </span>
                </div>
              </div>

              <div className="mt-auto pt-5">
                <Button
                  className={isFeatured ? "w-full bg-white text-[var(--accent-primary)] shadow-xl hover:shadow-xl" : "w-full"}
                  onClick={() => handleCheckout(tariff.id)}
                  disabled={(!paymentsEnabled && !isFreeTariff) || loadingTariffId !== null}
                >
                  {isLoading ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Перехожу к оплате
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      {isFreeTariff ? "Активировать бесплатно" : "Купить пакет"}
                    </>
                  )}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!paymentsEnabled ? (
          <Pill tone="warm">Добавьте `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY`</Pill>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-[var(--accent-warm)]">{error}</p> : null}
    </Card>
  );
}
