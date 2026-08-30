-- AlterTable
ALTER TABLE "RecoveryOpportunity" ADD COLUMN "priority" TEXT;
ALTER TABLE "RecoveryOpportunity" ADD COLUMN "recoveryStrategy" TEXT;
ALTER TABLE "RecoveryOpportunity" ADD COLUMN "urgency" TEXT;

-- CreateIndex
CREATE INDEX "RecoveryOpportunity_priority_idx" ON "RecoveryOpportunity"("priority");

-- CreateIndex
CREATE INDEX "RecoveryOpportunity_urgency_idx" ON "RecoveryOpportunity"("urgency");
