-- CreateTable
CREATE TABLE "RecoveryOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerContact" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "originalPaymentId" TEXT,
    "failureReason" TEXT,
    "recoveryProbability" REAL,
    "recommendedAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AT_RISK',
    "paymentLinkId" TEXT,
    "paymentLinkUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "recoveredAt" DATETIME
);

-- CreateIndex
CREATE INDEX "RecoveryOpportunity_status_idx" ON "RecoveryOpportunity"("status");

-- CreateIndex
CREATE INDEX "RecoveryOpportunity_createdAt_idx" ON "RecoveryOpportunity"("createdAt");
