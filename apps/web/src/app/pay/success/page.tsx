"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, CreditCard, XCircle } from "lucide-react";

import { fetchYooKassaPayment, syncYooKassaPayment } from "@/lib/learning/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SectionLabel } from "@/components/ui/section-label";

const LAST_PAYMENT_KEY = "sokratai-last-payment-id";

type PaymentStatus = "idle" | "loading" | "succeeded" | "pending" | "canceled" | "error";

function getInitialPaymentState(): {
  paymentId: string | null;
  status: PaymentStatus;
  message: string;
} {
  if (typeof window === "undefined") {
    return {
      paymentId: null,
      status: "idle",
      message: "Проверяем статус последнего платежа.",
    };
  }

  const storedPaymentId = window.sessionStorage.getItem(LAST_PAYMENT_KEY);

  if (!storedPaymentId) {
    return {
      paymentId: null,
      status: "error",
      message: "Не удалось найти ID последнего платежа. Попробуйте начать оплату из продукта ещё раз.",
    };
  }

  return {
    paymentId: storedPaymentId,
    status: "loading",
    message: "Проверяем статус последнего платежа.",
  };
}

export default function PaymentSuccessPage() {
  const [initialState] = useState(getInitialPaymentState);
  const [status, setStatus] = useState<PaymentStatus>(initialState.status);
  const [paymentId] = useState<string | null>(initialState.paymentId);
  const [message, setMessage] = useState(initialState.message);

  useEffect(() => {
    if (!paymentId) {
      return;
    }

    void Promise.all([
      fetchYooKassaPayment(paymentId),
      syncYooKassaPayment({ paymentId }).catch(() => null),
    ])
      .then(([data]) => {
        if (data.payment.status === "succeeded" && data.payment.paid) {
          setStatus("succeeded");
          setMessage(
            "Оплата прошла успешно. Купленные советы Сократа будут зачислены на баланс кабинета.",
          );
          return;
        }

        if (data.payment.status === "canceled") {
          setStatus("canceled");
          setMessage("Платёж был отменён или не завершён. Можно попробовать ещё раз.");
          return;
        }

        setStatus("pending");
        setMessage("Платёж ещё обрабатывается. Если статус не обновится, вернитесь чуть позже.");
      })
      .catch((error) => {
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Не удалось получить статус платежа из ЮKassa.",
        );
      });
  }, [paymentId]);

  const tone = useMemo(() => {
    switch (status) {
      case "succeeded":
        return "success";
      case "canceled":
      case "error":
        return "warm";
      default:
        return "default";
    }
  }, [status]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-12 md:px-8">
      <Card className="w-full p-8">
        <SectionLabel>ЮKassa</SectionLabel>
        <div className="mt-4 flex items-center gap-3">
          {status === "succeeded" ? (
            <CheckCircle2 className="h-6 w-6 text-[var(--accent-success)]" />
          ) : status === "pending" || status === "loading" ? (
            <Clock3 className="h-6 w-6 text-[var(--accent-primary)]" />
          ) : status === "canceled" ? (
            <XCircle className="h-6 w-6 text-[var(--accent-warm)]" />
          ) : (
            <CreditCard className="h-6 w-6 text-[var(--text-primary)]" />
          )}
          <h1 className="font-serif text-4xl leading-tight tracking-[-0.03em] text-[var(--text-primary)]">
            Результат оплаты
          </h1>
        </div>

        <div className="mt-5">
          <Pill tone={tone}>{status === "loading" ? "проверяем" : status}</Pill>
        </div>

        <p className="mt-5 text-sm leading-7 text-[var(--text-secondary)]">{message}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/app">
            <Button>Вернуться в продукт</Button>
          </Link>
          <Link href="/">
            <Button variant="secondary">На главную</Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
