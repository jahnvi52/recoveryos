/*
  Warnings:

  - A unique constraint covering the columns `[webhookEventId]` on the table `RecoveryOpportunity` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "RecoveryOpportunity" ADD COLUMN "razorpayPaymentId" TEXT;
ALTER TABLE "RecoveryOpportunity" ADD COLUMN "webhookEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryOpportunity_webhookEventId_key" ON "RecoveryOpportunity"("webhookEventId");
