-- AlterTable
ALTER TABLE "User" ADD COLUMN "starterPaidAt" TIMESTAMP(3),
ADD COLUMN "lastYooKassaPaymentId" VARCHAR(64);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "yooKassaPaymentId" VARCHAR(64) NOT NULL,
    "appUserKey" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "amountValue" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("yooKassaPaymentId")
);

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_appUserKey_fkey" FOREIGN KEY ("appUserKey") REFERENCES "User"("appUserKey") ON DELETE CASCADE ON UPDATE CASCADE;
