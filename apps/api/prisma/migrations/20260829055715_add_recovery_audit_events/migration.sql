-- CreateTable
CREATE TABLE "RecoveryAuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "action" TEXT,
    "executionMode" TEXT,
    "reason" TEXT,
    "expectedAmount" INTEGER,
    "actualAmount" INTEGER,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecoveryAuditEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "RecoveryOpportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RecoveryAuditEvent_opportunityId_idx" ON "RecoveryAuditEvent"("opportunityId");

-- CreateIndex
CREATE INDEX "RecoveryAuditEvent_createdAt_idx" ON "RecoveryAuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "RecoveryAuditEvent_eventType_idx" ON "RecoveryAuditEvent"("eventType");
