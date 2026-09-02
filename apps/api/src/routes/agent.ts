import { Router } from "express";
import { prisma } from "../db/prisma";
import { createPaymentLink } from "../services/paymentlink";
import { analyzeRecovery } from "../services/recoveryEngine";
import {
  decideRecoveryAction,
} from "../services/recoveryDecisionEngine";
import {
  evaluateRecoveryGuardrails,
} from "../services/recoveryGuardrails";
import {
  recordRecoveryAuditEvent,
} from "../services/recoveryAudit";
import {
  evaluateRecoveryBatch,
} from "../services/recoveryBatchEngine";

const router = Router();

/**
 * POST /api/agent/opportunities/:id/execute
 *
 * RecoveryOS controlled agent execution.
 *
 * Flow:
 *
 * Detect
 *   ↓
 * Diagnose
 *   ↓
 * Next-best action
 *   ↓
 * Guardrails
 *   ↓
 * AUTO / HUMAN / SUPPRESS / STOP
 *   ↓
 * Execute only when safe
 */
router.post(
  "/opportunities/:id/execute",
  async (req, res) => {
    try {
      const { id } = req.params;

      /*
       * -------------------------------------------------------
       * 1. LOAD OPPORTUNITY
       * -------------------------------------------------------
       */

      const opportunity =
        await prisma.recoveryOpportunity.findUnique({
          where: {
            id,
          },
        });

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error:
            "Recovery opportunity not found",
        });
      }

      /*
       * -------------------------------------------------------
       * 2. AI DIAGNOSIS
       * -------------------------------------------------------
       */

      const decision =
        analyzeRecovery({
          amount:
            opportunity.amount,

          failureReason:
            opportunity.failureReason,

          customer: {
            name:
              opportunity.customerName,

            email:
              opportunity.customerEmail ??
              undefined,

            contact:
              opportunity.customerContact ??
              undefined,
          },
        });

      /*
       * -------------------------------------------------------
       * 3. NEXT-BEST ACTION
       * -------------------------------------------------------
       */

      const agentDecision =
        decideRecoveryAction({
          amount:
            opportunity.amount,

          status:
            opportunity.status,

          paymentLinkExists:
            Boolean(
              opportunity.paymentLinkId &&
              opportunity.paymentLinkUrl
            ),

          decision,
        });

      /*
       * -------------------------------------------------------
       * 4. GUARDRAILS
       * -------------------------------------------------------
       */

      const guardrailResult =
        await evaluateRecoveryGuardrails(
          opportunity.id
        );

      /*
       * -------------------------------------------------------
       * 5. AUDIT — GUARDRAILS CHECKED
       * -------------------------------------------------------
       */

      await recordRecoveryAuditEvent({
        opportunityId:
          opportunity.id,

        eventType:
          "GUARDRAILS_CHECKED",

        action:
          agentDecision.nextBestAction,

        executionMode:
          agentDecision.executionMode,

        reason:
          guardrailResult.reason,

        expectedAmount:
          agentDecision.expectedRecoveryAmount,

        metadata: {
          guardrailDecision:
            guardrailResult.decision,

          allowed:
            guardrailResult.allowed,

          attemptCount:
            guardrailResult.attemptCount,

          maxAttempts:
            guardrailResult.maxAttempts,

          checks:
            guardrailResult.checks,
        },
      });

      /*
       * -------------------------------------------------------
       * 6. STOP
       * -------------------------------------------------------
       */

      if (
        guardrailResult.decision ===
        "STOP"
      ) {
        await recordRecoveryAuditEvent({
          opportunityId:
            opportunity.id,

          eventType:
            "STOPPED",

          action:
            agentDecision.nextBestAction,

          executionMode:
            "BLOCKED",

          reason:
            guardrailResult.reason,

          expectedAmount:
            agentDecision.expectedRecoveryAmount,
        });

        return res.json({
          success: true,

          executed: false,

          stopped: true,

          message:
            guardrailResult.reason,

          guardrails:
            guardrailResult,

          agentDecision,
        });
      }

      /*
       * -------------------------------------------------------
       * 7. SUPPRESS
       * -------------------------------------------------------
       */

      if (
        guardrailResult.decision ===
        "SUPPRESS"
      ) {
        await recordRecoveryAuditEvent({
          opportunityId:
            opportunity.id,

          eventType:
            "SUPPRESSED",

          action:
            "SUPPRESS",

          executionMode:
            "BLOCKED",

          reason:
            guardrailResult.reason,

          expectedAmount:
            agentDecision.expectedRecoveryAmount,
        });

        return res.json({
          success: true,

          executed: false,

          suppressed: true,

          message:
            guardrailResult.reason,

          guardrails:
            guardrailResult,

          agentDecision,
        });
      }

      /*
       * -------------------------------------------------------
       * 8. HUMAN APPROVAL
       * -------------------------------------------------------
       */

      if (
        guardrailResult.decision ===
        "REQUIRE_HUMAN"
      ) {
        await recordRecoveryAuditEvent({
          opportunityId:
            opportunity.id,

          eventType:
            "APPROVAL_REQUIRED",

          action:
            agentDecision.nextBestAction,

          executionMode:
            "APPROVAL_REQUIRED",

          reason:
            guardrailResult.reason,

          expectedAmount:
            agentDecision.expectedRecoveryAmount,
        });

        return res.json({
          success: true,

          executed: false,

          approvalRequired: true,

          message:
            "Human approval required before recovery execution.",

          guardrails:
            guardrailResult,

          agentDecision,
        });
      }

      /*
       * -------------------------------------------------------
       * 9. AUTO EXECUTION
       * -------------------------------------------------------
       */

      if (
        guardrailResult.decision ===
        "ALLOW_AUTO"
      ) {
        /*
         * Existing payment link:
         *
         * Never create a duplicate.
         */
        if (
          opportunity.paymentLinkId &&
          opportunity.paymentLinkUrl
        ) {
          await recordRecoveryAuditEvent({
            opportunityId:
              opportunity.id,

            eventType:
              "EXECUTION_SKIPPED",

            action:
              agentDecision.nextBestAction,

            executionMode:
              "AUTO",

            reason:
              "An existing recovery payment link is already available. RecoveryOS reused the existing link instead of creating a duplicate.",

            expectedAmount:
              agentDecision.expectedRecoveryAmount,
          });

          return res.json({
            success: true,

            executed: false,

            reusedExistingLink:
              true,

            message:
              "Existing recovery payment link will be reused.",

            paymentLink: {
              id:
                opportunity.paymentLinkId,

              shortUrl:
                opportunity.paymentLinkUrl,
            },

            guardrails:
              guardrailResult,

            agentDecision,
          });
        }

        /*
         * ---------------------------------------------------
         * ACTUAL RAZORPAY EXECUTION
         * ---------------------------------------------------
         */

        const result =
          await createPaymentLink({
            amount:
              opportunity.amount,

            customer: {
              name:
                opportunity.customerName,

              email:
                opportunity.customerEmail ??
                undefined,

              contact:
                opportunity.customerContact ??
                undefined,
            },

            description:
              "RecoveryOS autonomous recovery",

            referenceId:
              `AGENT-${opportunity.id}`,

            originalPaymentId:
              opportunity.originalPaymentId ??
              undefined,

            failureReason:
              decision.diagnosis,

            recoveryProbability:
              decision.recoveryProbability,

            recommendedAction:
              decision.recommendedAction,
          });

        /*
         * ---------------------------------------------------
         * MOVE PAYMENT-LINK DATA TO ORIGINAL OPPORTUNITY
         * ---------------------------------------------------
         */

        await prisma.recoveryOpportunity.delete({
          where: {
            id:
              result.recoveryOpportunity.id,
          },
        });

        const updatedOpportunity =
          await prisma.recoveryOpportunity.update({
            where: {
              id:
                opportunity.id,
            },

            data: {
              failureReason:
                decision.diagnosis,

              recoveryProbability:
                decision.recoveryProbability,

              recommendedAction:
                decision.recommendedAction,

              priority:
                decision.priority,

              urgency:
                decision.urgency,

              recoveryStrategy:
                decision.recoveryStrategy,

              status:
                "RECOVERY_INITIATED",

              paymentLinkId:
                result.paymentLink.id,

              paymentLinkUrl:
                result.paymentLink.short_url,

              updatedAt:
                new Date(),
            },
          });

        /*
         * ---------------------------------------------------
         * AUDIT — EXECUTED
         * ---------------------------------------------------
         */

        await recordRecoveryAuditEvent({
          opportunityId:
            opportunity.id,

          eventType:
            "EXECUTED",

          action:
            agentDecision.nextBestAction,

          executionMode:
            "AUTO",

          reason:
            "RecoveryOS automatically executed the approved recovery action after all guardrails passed.",

          expectedAmount:
            agentDecision.expectedRecoveryAmount,

          metadata: {
            paymentLinkId:
              result.paymentLink.id,

            paymentLinkUrl:
              result.paymentLink.short_url,

            customerName:
              opportunity.customerName,

            amount:
              opportunity.amount,

            updatedOpportunityId:
              updatedOpportunity.id,
          },
        });

        return res.json({
          success: true,

          executed: true,

          executionMode:
            "AUTO",

          message:
            "Recovery action executed successfully.",

          guardrails:
            guardrailResult,

          agentDecision,

          recoveryOpportunity: {
            id:
              updatedOpportunity.id,

            status:
              updatedOpportunity.status,

            priority:
              updatedOpportunity.priority,

            urgency:
              updatedOpportunity.urgency,

            recoveryStrategy:
              updatedOpportunity
                .recoveryStrategy,
          },

          paymentLink: {
            id:
              result.paymentLink.id,

            shortUrl:
              result.paymentLink.short_url,

            amount:
              result.paymentLink.amount,

            currency:
              result.paymentLink.currency,
          },
        });
      }

      /*
       * -------------------------------------------------------
       * 10. SAFETY FALLBACK
       * -------------------------------------------------------
       */

      await recordRecoveryAuditEvent({
        opportunityId:
          opportunity.id,

        eventType:
          "STOPPED",

        action:
          agentDecision.nextBestAction,

        executionMode:
          "BLOCKED",

        reason:
          "RecoveryOS could not determine a safe execution path.",

        expectedAmount:
          agentDecision.expectedRecoveryAmount,
      });

      return res.json({
        success: true,

        executed: false,

        stopped: true,

        message:
          "RecoveryOS could not determine a safe execution path.",

        guardrails:
          guardrailResult,

        agentDecision,
      });
    } catch (error) {
      console.error(
        "Agent execution failed:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return res.status(500).json({
        success: false,
        error: message || "Unknown agent execution error",
      });
    }
  }
);


/**
 * POST /api/agent/opportunities/:id/approve
 *
 * Human approval endpoint.
 *
 * This route is intentionally separate from the autonomous
 * execution route. It can execute only when the most recent
 * audit event proves that RecoveryOS previously requested
 * human approval for this opportunity.
 */
router.post(
  "/opportunities/:id/approve",
  async (req, res) => {
    try {
      const { id } = req.params;

      const opportunity =
        await prisma.recoveryOpportunity.findUnique({
          where: { id },
        });

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error: "Recovery opportunity not found",
        });
      }

      if (opportunity.status === "RECOVERED") {
        return res.status(400).json({
          success: false,
          error: "This recovery opportunity has already been recovered",
        });
      }

      /*
       * Verify that the opportunity is actually waiting
       * for human approval.
       */
      const latestAuditEvents =
        await prisma.recoveryAuditEvent.findMany({
          where: {
            opportunityId: opportunity.id,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        });

      const latestApprovalRequest =
        latestAuditEvents.find(
          (event) =>
            event.eventType === "APPROVAL_REQUIRED"
        );

      const latestEvent =
        latestAuditEvents[0];

      if (
        !latestApprovalRequest ||
        !latestEvent ||
        latestEvent.eventType !== "APPROVAL_REQUIRED"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "This opportunity is not currently waiting for human approval.",
        });
      }

      /*
       * Re-run the deterministic AI decision so the
       * approved action is captured in the execution audit.
       *
       * Human approval bypasses the automatic threshold
       * decision, but it does NOT bypass opportunity state
       * or duplicate-link protection.
       */
      const decision =
        analyzeRecovery({
          amount: opportunity.amount,
          failureReason: opportunity.failureReason,
          customer: {
            name: opportunity.customerName,
            email:
              opportunity.customerEmail ??
              undefined,
            contact:
              opportunity.customerContact ??
              undefined,
          },
        });

      const agentDecision =
        decideRecoveryAction({
          amount: opportunity.amount,
          status: opportunity.status,
          paymentLinkExists: Boolean(
            opportunity.paymentLinkId &&
              opportunity.paymentLinkUrl
          ),
          decision,
        });

      await recordRecoveryAuditEvent({
        opportunityId: opportunity.id,
        eventType: "APPROVED",
        action: agentDecision.nextBestAction,
        executionMode: "HUMAN_APPROVED",
        reason:
          "Human reviewer approved the RecoveryOS recommendation after the high-value guardrail required approval.",
        expectedAmount:
          agentDecision.expectedRecoveryAmount,
        metadata: {
          approvedBy:
            req.body?.approvedBy ||
            "human_reviewer",
          approvalRequestReason:
            latestApprovalRequest.reason,
        },
      });

      /*
       * Never create a duplicate recovery payment link.
       */
      if (
        opportunity.paymentLinkId &&
        opportunity.paymentLinkUrl
      ) {
        await recordRecoveryAuditEvent({
          opportunityId: opportunity.id,
          eventType: "EXECUTION_SKIPPED",
          action: agentDecision.nextBestAction,
          executionMode: "HUMAN_APPROVED",
          reason:
            "Human approval was recorded, but an existing recovery payment link is already available. RecoveryOS reused the existing link.",
          expectedAmount:
            agentDecision.expectedRecoveryAmount,
        });

        return res.json({
          success: true,
          approved: true,
          executed: false,
          reusedExistingLink: true,
          message:
            "Human approval recorded. Existing recovery payment link will be reused.",
          agentDecision,
          paymentLink: {
            id: opportunity.paymentLinkId,
            shortUrl: opportunity.paymentLinkUrl,
          },
        });
      }

      /*
       * ACTUAL RAZORPAY EXECUTION AFTER HUMAN APPROVAL
       */
      const result =
        await createPaymentLink({
          amount: opportunity.amount,
          customer: {
            name: opportunity.customerName,
            email:
              opportunity.customerEmail ??
              undefined,
            contact:
              opportunity.customerContact ??
              undefined,
          },
          description:
            "RecoveryOS human-approved recovery",
          referenceId:
            `HUMAN-APPROVED-${opportunity.id}`,
          originalPaymentId:
            opportunity.originalPaymentId ??
            undefined,
          failureReason:
            decision.diagnosis,
          recoveryProbability:
            decision.recoveryProbability,
          recommendedAction:
            decision.recommendedAction,
        });

      /*
       * Move payment-link data onto the original
       * recovery opportunity.
       */
      await prisma.recoveryOpportunity.delete({
        where: {
          id: result.recoveryOpportunity.id,
        },
      });

      const updatedOpportunity =
        await prisma.recoveryOpportunity.update({
          where: {
            id: opportunity.id,
          },
          data: {
            failureReason:
              decision.diagnosis,
            recoveryProbability:
              decision.recoveryProbability,
            recommendedAction:
              decision.recommendedAction,
            priority:
              decision.priority,
            urgency:
              decision.urgency,
            recoveryStrategy:
              decision.recoveryStrategy,
            status:
              "RECOVERY_INITIATED",
            paymentLinkId:
              result.paymentLink.id,
            paymentLinkUrl:
              result.paymentLink.short_url,
            updatedAt:
              new Date(),
          },
        });

      await recordRecoveryAuditEvent({
        opportunityId: opportunity.id,
        eventType: "EXECUTED",
        action: agentDecision.nextBestAction,
        executionMode: "HUMAN_APPROVED",
        reason:
          "RecoveryOS executed the recovery action after explicit human approval.",
        expectedAmount:
          agentDecision.expectedRecoveryAmount,
        metadata: {
          paymentLinkId:
            result.paymentLink.id,
          paymentLinkUrl:
            result.paymentLink.short_url,
          approvedBy:
            req.body?.approvedBy ||
            "human_reviewer",
          amount:
            opportunity.amount,
          updatedOpportunityId:
            updatedOpportunity.id,
        },
      });

      return res.json({
        success: true,
        approved: true,
        executed: true,
        executionMode: "HUMAN_APPROVED",
        message:
          "Human approval accepted and recovery action executed successfully.",
        agentDecision,
        recoveryOpportunity: {
          id: updatedOpportunity.id,
          status: updatedOpportunity.status,
          priority: updatedOpportunity.priority,
          urgency: updatedOpportunity.urgency,
          recoveryStrategy:
            updatedOpportunity.recoveryStrategy,
        },
        paymentLink: {
          id: result.paymentLink.id,
          shortUrl:
            result.paymentLink.short_url,
          amount:
            result.paymentLink.amount,
          currency:
            result.paymentLink.currency,
        },
      });
    } catch (error) {
      console.error(
        "Human-approved recovery failed:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return res.status(500).json({
        success: false,
        error: message || "Unknown human-approved recovery error",
      });
    }
  }
);

/**
 * POST /api/agent/opportunities/:id/reject
 *
 * Records a human rejection and permanently blocks
 * the currently pending approval request.
 */
router.post(
  "/opportunities/:id/reject",
  async (req, res) => {
    try {
      const { id } = req.params;

      const opportunity =
        await prisma.recoveryOpportunity.findUnique({
          where: { id },
        });

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error: "Recovery opportunity not found",
        });
      }

      const latestAuditEvents =
        await prisma.recoveryAuditEvent.findMany({
          where: {
            opportunityId: opportunity.id,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        });

      const latestEvent =
        latestAuditEvents[0];

      if (
        !latestEvent ||
        latestEvent.eventType !==
          "APPROVAL_REQUIRED"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "This opportunity is not currently waiting for human approval.",
        });
      }

      await recordRecoveryAuditEvent({
        opportunityId: opportunity.id,
        eventType: "REJECTED",
        action: "REJECT",
        executionMode: "HUMAN_REVIEW",
        reason:
          req.body?.reason ||
          "Human reviewer rejected the recovery action.",
        expectedAmount:
          opportunity.amount,
        metadata: {
          rejectedBy:
            req.body?.rejectedBy ||
            "human_reviewer",
        },
      });

      return res.json({
        success: true,
        rejected: true,
        executed: false,
        message:
          "Recovery action rejected by human reviewer.",
      });
    } catch (error) {
      console.error(
        "Human rejection failed:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return res.status(500).json({
        success: false,
        error: message || "Unknown rejection error",
      });
    }
  }
);


/**
 * GET /api/agent/approvals
 *
 * Returns only opportunities whose latest audit event is
 * APPROVAL_REQUIRED. This keeps the Human Approval Center
 * synchronized with the actual agent state.
 */
router.get(
  "/approvals",
  async (_req, res) => {
    try {
      const opportunities =
        await prisma.recoveryOpportunity.findMany({
          where: {
            status: {
              not: "RECOVERED",
            },
          },
          orderBy: {
            amount: "desc",
          },
        });

      const auditEvents =
        await prisma.recoveryAuditEvent.findMany({
          orderBy: {
            createdAt: "desc",
          },
        });

      const latestEventByOpportunity =
        new Map<string, (typeof auditEvents)[number]>();

      for (const event of auditEvents) {
        if (
          !latestEventByOpportunity.has(
            event.opportunityId
          )
        ) {
          latestEventByOpportunity.set(
            event.opportunityId,
            event
          );
        }
      }

      const pendingApprovals =
        opportunities.filter((opportunity) => {
          const latestEvent =
            latestEventByOpportunity.get(
              opportunity.id
            );

          return (
            latestEvent?.eventType ===
            "APPROVAL_REQUIRED"
          );
        });

      return res.json({
        success: true,
        count: pendingApprovals.length,
        opportunities: pendingApprovals,
      });
    } catch (error) {
      console.error(
        "Failed to fetch pending approvals:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return res.status(500).json({
        success: false,
        error: message || "Unknown approval-fetch error",
      });
    }
  }
);

/**
 * POST /api/agent/batch/evaluate
 *
 * Evaluates up to 500 open revenue-risk
 * opportunities through the RecoveryOS
 * Agent Brain and Guardrail system.
 *
 * This endpoint DOES NOT execute recovery.
 */
router.post(
  "/batch/evaluate",
  async (req, res) => {
    try {
      const requestedLimit =
        Number(
          req.body?.limit ?? 500
        );

      const limit =
        Number.isFinite(
          requestedLimit
        )
          ? Math.min(
              Math.max(
                Math.floor(
                  requestedLimit
                ),
                1
              ),
              500
            )
          : 500;

      const batchResult =
        await evaluateRecoveryBatch(
          limit
        );

      return res.json({
        success: true,

    batch: {
  processed:
    batchResult.processed,

  recoverable:
    batchResult.recoverable,

  autoEligible:
    batchResult.autoEligible,

  humanApproval:
    batchResult.humanApproval,

  suppressed:
    batchResult.suppressed,

  stopped:
    batchResult.stopped,

  revenueAtRisk:
    batchResult.revenueAtRisk,

  predictedRecovery:
    batchResult.predictedRecovery,

  simulatedActualRecovery:
    batchResult.simulatedActualRecovery,

  recoveryRate:
    batchResult.recoveryRate,

  averageRecoveryProbability:
    batchResult.averageRecoveryProbability,
},

        opportunities:
          batchResult.opportunities,
      });
    } catch (error) {
      console.error(
        "Batch recovery evaluation failed:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return res.status(500).json({
        success: false,
        error: message || "Unknown batch evaluation error",
      });
    }
  }
);

export default router;