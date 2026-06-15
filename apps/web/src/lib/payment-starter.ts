import { getYooKassaPaymentMetadataAppUserKey, type YooKassaPayment } from "@/lib/yookassa";
import { getPrismaClient } from "@/lib/prisma";
import { isDatabaseConfigured } from "@/lib/env";
import type { CycleTariff } from "@/lib/payment-plans";

const DEFAULT_EXAM = "OGE" as const;
const DEFAULT_SUBJECT = "russian" as const;

function resolveAppUserKeyFromPayment(payment: YooKassaPayment) {
  return getYooKassaPaymentMetadataAppUserKey(payment);
}

function parseCyclesCountFromMetadata(payment: YooKassaPayment) {
  const raw = payment.metadata?.cycles_count ?? payment.metadata?.cyclesCount;
  const cyclesCount = raw ? Number.parseInt(raw, 10) : 0;

  return Number.isFinite(cyclesCount) && cyclesCount > 0 ? cyclesCount : null;
}

function parseTariffFromMetadata(payment: YooKassaPayment) {
  return payment.metadata?.tariff?.trim() || null;
}

async function applyCyclesCredit(input: {
  paymentEventId: string;
  appUserKey: string;
  displayName: string | null;
  tariff: string | null;
  cyclesCount: number;
  amountValue: string | null;
  event: string;
}): Promise<"inserted" | "already"> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("Database is not available.");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.paymentEvent.findUnique({
      where: { yooKassaPaymentId: input.paymentEventId },
    });
    if (existing) {
      return "already" as const;
    }

    await tx.user.upsert({
      where: { appUserKey: input.appUserKey },
      create: {
        appUserKey: input.appUserKey,
        exam: DEFAULT_EXAM,
        subject: DEFAULT_SUBJECT,
        displayName: input.displayName,
        cyclesBalance: input.cyclesCount,
        lastYooKassaPaymentId: input.paymentEventId,
      },
      update: {
        displayName: input.displayName ?? undefined,
        cyclesBalance: {
          increment: input.cyclesCount,
        },
        lastYooKassaPaymentId: input.paymentEventId,
      },
    });

    await tx.paymentEvent.create({
      data: {
        yooKassaPaymentId: input.paymentEventId,
        appUserKey: input.appUserKey,
        event: input.event,
        tariff: input.tariff,
        cyclesCount: input.cyclesCount,
        amountValue: input.amountValue,
      },
    });
    return "inserted" as const;
  });
}

/**
 * Начисляет купленные советы Сократа после проверки платежа через API ЮKassa.
 * Идемпотентна по `payment.id`.
 */
export async function applyCyclesPurchaseFromPayment(
  payment: YooKassaPayment,
  options?: { expectedAppUserKey?: string },
): Promise<
  | { status: "applied" }
  | { status: "already_recorded" }
  | { status: "skipped"; reason: string }
> {
  if (!isDatabaseConfigured()) {
    return { status: "skipped", reason: "database" };
  }

  if (payment.status !== "succeeded" || !payment.paid) {
    return { status: "skipped", reason: "not_succeeded" };
  }

  const appUserKey = resolveAppUserKeyFromPayment(payment);
  if (!appUserKey) {
    return { status: "skipped", reason: "no_app_user_key" };
  }
  if (options?.expectedAppUserKey && appUserKey !== options.expectedAppUserKey) {
    return { status: "skipped", reason: "payment_owner_mismatch" };
  }
  const cyclesCount = parseCyclesCountFromMetadata(payment);
  if (!cyclesCount) {
    return { status: "skipped", reason: "no_cycles_count" };
  }

  if (!getPrismaClient()) {
    return { status: "skipped", reason: "database" };
  }

  const tariff = parseTariffFromMetadata(payment);

  const result = await applyCyclesCredit({
    paymentEventId: payment.id,
    appUserKey,
    displayName: null,
    tariff,
    cyclesCount,
    amountValue: payment.amount?.value ?? null,
    event: "payment.succeeded",
  });

  return result === "already" ? { status: "already_recorded" } : { status: "applied" };
}

export async function applyFreeCycleTariff(input: {
  appUserKey: string;
  studentName?: string;
  tariff: CycleTariff;
}): Promise<
  | { status: "applied"; paymentId: string }
  | { status: "already_recorded"; paymentId: string }
  | { status: "skipped"; reason: string }
> {
  if (!isDatabaseConfigured()) {
    return { status: "skipped", reason: "database" };
  }
  if (!input.appUserKey.trim()) {
    return { status: "skipped", reason: "no_app_user_key" };
  }
  if (input.tariff.amountRub !== 0) {
    return { status: "skipped", reason: "not_free_tariff" };
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    return { status: "skipped", reason: "database" };
  }

  const existingFreeGrant = await prisma.paymentEvent.findFirst({
    where: {
      appUserKey: input.appUserKey.trim(),
      tariff: input.tariff.id,
      event: "free.test_drive.granted",
    },
    select: {
      yooKassaPaymentId: true,
    },
  });
  if (existingFreeGrant) {
    return { status: "already_recorded", paymentId: existingFreeGrant.yooKassaPaymentId };
  }

  const paymentId = `free:${input.tariff.id}:${input.appUserKey.trim()}`;
  const result = await applyCyclesCredit({
    paymentEventId: paymentId,
    appUserKey: input.appUserKey.trim(),
    displayName: input.studentName?.trim() || null,
    tariff: input.tariff.id,
    cyclesCount: input.tariff.cyclesCount,
    amountValue: "0.00",
    event: "free.test_drive.granted",
  });

  return result === "already"
    ? { status: "already_recorded", paymentId }
    : { status: "applied", paymentId };
}

export async function userHasCyclesBalance(appUserKey: string): Promise<boolean> {
  if (!isDatabaseConfigured()) {
    return false;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    return false;
  }
  const user = await prisma.user.findUnique({
    where: { appUserKey },
    select: { cyclesBalance: true },
  });
  return (user?.cyclesBalance ?? 0) > 0;
}

export async function decrementUserCycleBalance(appUserKey: string): Promise<{
  consumed: boolean;
  userId?: string;
  remaining?: number;
}> {
  if (!isDatabaseConfigured()) {
    return { consumed: false };
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    return { consumed: false };
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { appUserKey },
      select: {
        id: true,
      },
    });

    if (!user) {
      return { consumed: false };
    }

    const result = await tx.user.updateMany({
      where: {
        id: user.id,
        cyclesBalance: {
          gt: 0,
        },
      },
      data: {
        cyclesBalance: {
          decrement: 1,
        },
      },
    });

    if (result.count === 0) {
      return { consumed: false };
    }

    const updated = await tx.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        id: true,
        cyclesBalance: true,
      },
    });

    if (!updated) {
      return { consumed: false };
    }

    return {
      consumed: true,
      userId: updated.id,
      remaining: updated.cyclesBalance,
    };
  });
}
