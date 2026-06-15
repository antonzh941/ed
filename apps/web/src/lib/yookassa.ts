import { getServerEnv } from "@/lib/env";

const YOOKASSA_API_BASE = "https://api.yookassa.ru/v3";

type YooKassaPaymentStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";

export type YooKassaPayment = {
  id: string;
  status: YooKassaPaymentStatus;
  paid: boolean;
  amount: {
    value: string;
    currency: string;
  };
  description?: string;
  confirmation?: {
    type: string;
    confirmation_url?: string;
  };
  created_at: string;
  /** В metadata создания: `app_user_key`, опционально `internal_user_id`, тариф и суммы (без имён). */
  metadata?: Record<string, string> | null;
};

function getAuthHeader() {
  const env = getServerEnv();
  const credentials = Buffer.from(
    `${env.yooKassaShopId}:${env.yooKassaSecretKey}`,
    "utf8",
  ).toString("base64");

  return `Basic ${credentials}`;
}

async function parseYooKassaError(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | {
        description?: string;
      }
    | null;

  throw new Error(payload?.description || "YooKassa request failed");
}

export async function createYooKassaPayment(input: {
  amountRub: number;
  returnUrl: string;
  tariffId: string;
  tariffTitle: string;
  cyclesCount: number;
  appUserKey: string;
  /** Внутренний id пользователя в БД (cuid), без ПДн — для сопоставления вне appUserKey. */
  internalUserId?: string | null;
}) {
  const amountValue = input.amountRub.toFixed(2);

  const metadata: Record<string, string> = {
    tariff: input.tariffId,
    tariff_title: input.tariffTitle,
    amount_rub: String(input.amountRub),
    cycles_count: String(input.cyclesCount),
    app_user_key: input.appUserKey,
  };
  const internalId = input.internalUserId?.trim();
  if (internalId) {
    metadata.internal_user_id = internalId;
  }

  const response = await fetch(`${YOOKASSA_API_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      amount: {
        value: amountValue,
        currency: "RUB",
      },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: input.returnUrl,
      },
      description: `${input.tariffTitle} — ${input.amountRub} ₽`,
      metadata,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    await parseYooKassaError(response);
  }

  return (await response.json()) as YooKassaPayment;
}

/** Ключ пользователя из metadata создания платежа (без доверия к клиенту). */
/** Поля для клиента без лишних данных от ЮKassa. */
export function toYooKassaPaymentPublic(payment: YooKassaPayment) {
  return {
    id: payment.id,
    status: payment.status,
    paid: payment.paid,
    amount: payment.amount,
    description: payment.description,
    created_at: payment.created_at,
  };
}

export function getYooKassaPaymentMetadataAppUserKey(payment: YooKassaPayment): string | null {
  const metadata = payment.metadata ?? undefined;
  const fromMeta = metadata?.app_user_key?.trim() || metadata?.appUserKey?.trim() || "";
  if (fromMeta && fromMeta !== "anonymous") {
    return fromMeta;
  }
  return null;
}

export async function getYooKassaPayment(paymentId: string) {
  const response = await fetch(`${YOOKASSA_API_BASE}/payments/${paymentId}`, {
    headers: {
      Authorization: getAuthHeader(),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    await parseYooKassaError(response);
  }

  return (await response.json()) as YooKassaPayment;
}
