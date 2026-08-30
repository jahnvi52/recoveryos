-- CreateTable
CREATE TABLE "RecoveryEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "predictedRecoveryAmount" INTEGER NOT NULL,
    "actualRecoveryAmount" INTEGER NOT NULL DEFAULT 0,
    "recoveryProbability" REAL NOT NULL,
    "outcome" TEXT NOT NULL,
    "predictionError" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecoveryEvaluation_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "RecoveryOpportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RecoveryEvaluation_opportunityId_idx" ON "RecoveryEvaluation"("opportunityId");

-- CreateIndex
CREATE INDEX "RecoveryEvaluation_batchId_idx" ON "RecoveryEvaluation"("batchId");

-- CreateIndex
CREATE INDEX "RecoveryEvaluation_outcome_idx" ON "RecoveryEvaluation"("outcome");

-- CreateIndex
CREATE INDEX "RecoveryEvaluation_createdAt_idx" ON "RecoveryEvaluation"("createdAt");
