import { prisma } from "../db/prisma";

export type RecoveryAuditEventInput = {
  opportunityId: string;

  eventType: string;

  action?: string;

  executionMode?: string;

  reason?: string;

  expectedAmount?: number;

  actualAmount?: number;

  metadata?: Record<
    string,
    unknown
  >;
};

export async function recordRecoveryAuditEvent(
  input: RecoveryAuditEventInput
) {
  return prisma.recoveryAuditEvent.create({
    data: {
      opportunityId:
        input.opportunityId,

      eventType:
        input.eventType,

      action:
        input.action,

      executionMode:
        input.executionMode,

      reason:
        input.reason,

      expectedAmount:
        input.expectedAmount,

      actualAmount:
        input.actualAmount,

      metadata:
        input.metadata
          ? JSON.stringify(
              input.metadata
            )
          : undefined,
    },
  });
}

export async function getRecoveryAuditEvents(
  opportunityId: string
) {
  return prisma.recoveryAuditEvent.findMany({
    where: {
      opportunityId,
    },

    orderBy: {
      createdAt: "asc",
    },
  });
}