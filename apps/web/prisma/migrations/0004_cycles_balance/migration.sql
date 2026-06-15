-- AlterTable
ALTER TABLE "User" ADD COLUMN "cyclesBalance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PaymentEvent" ADD COLUMN "tariff" VARCHAR(64),
ADD COLUMN "cyclesCount" INTEGER;
