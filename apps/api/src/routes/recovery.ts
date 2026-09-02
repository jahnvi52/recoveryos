import { Router } from "express";
import { createPaymentLink } from "../services/paymentlink";
import { prisma } from "../db/prisma";
import { analyzeRecovery } from "../services/recoveryEngine";

const router = Router();

/**
 * GET /api/recovery/opportunities
 *
 * Returns all recovery opportunities.
 */
router.get("/opportunities", async (_req, res) => {
  try {
    const opportunities =
      await prisma.recoveryOpportunity.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });

    return res.json({
      success: true,
      opportunities,
    });
  } catch (error) {
    console.error(
      "Failed to fetch recovery opportunities:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Failed to fetch recovery opportunities",
    });
  }
});

/**
 * GET /api/recovery/metrics
 *
 * Returns revenue recovery metrics for the dashboard.
 */
router.get("/metrics", async (_req, res) => {
  try {
    /*
     * RecoveryOS keeps two different recovery-rate concepts:
     *
     * 1. caseRecoveryRate
     *    recovered opportunities / all opportunities
     *
     * 2. revenueRecoveryRate
     *    confirmed recovered revenue /
     *    (confirmed recovered revenue + open revenue at risk)
     *
     * The second metric is the revenue metric used by Analytics.
     *
     * IMPORTANT:
     * recoveredRevenue is sourced from RECOVERED audit events'
     * actualAmount. The webhook writes actualAmount from the
     * Razorpay payment payload, so this does not pretend that the
     * original opportunity amount was necessarily recovered.
     */
    const opportunities =
      await prisma.recoveryOpportunity.findMany({
        select: {
          id: true,
          amount: true,
          status: true,
        },
      });

    const recoveredOpportunities =
      opportunities.filter(
        (opportunity) =>
          opportunity.status === "RECOVERED"
      );

    const openOpportunities =
      opportunities.filter(
        (opportunity) =>
          opportunity.status !== "RECOVERED"
      );

    /*
     * Read the actual amounts captured by the recovery webhook.
     *
     * A successful payment_link.paid webhook records a RECOVERED
     * audit event with actualAmount. Using the audit trail here
     * keeps analytics aligned with confirmed payment outcomes.
     */
    const recoveredEvents =
      await prisma.recoveryAuditEvent.findMany({
        where: {
          eventType: "RECOVERED",
          opportunityId: {
            in: recoveredOpportunities.map(
              (opportunity) => opportunity.id
            ),
          },
        },
        select: {
          opportunityId: true,
          actualAmount: true,
        },
      });

    const recoveredRevenue =
      recoveredEvents.reduce(
        (total, event) =>
          total + (event.actualAmount ?? 0),
        0
      );

    const revenueAtRisk =
      openOpportunities.reduce(
        (total, opportunity) =>
          total + opportunity.amount,
        0
      );

    const totalOpportunities =
      opportunities.length;

    const caseRecoveryRate =
      totalOpportunities > 0
        ? (recoveredOpportunities.length /
            totalOpportunities) *
          100
        : 0;

    const revenueRecoveryDenominator =
      recoveredRevenue + revenueAtRisk;

    const revenueRecoveryRate =
      revenueRecoveryDenominator > 0
        ? (recoveredRevenue /
            revenueRecoveryDenominator) *
          100
        : 0;

    return res.json({
      success: true,

      metrics: {
        totalOpportunities,

        recoveredOpportunities:
          recoveredOpportunities.length,

        pendingOpportunities:
          openOpportunities.length,

        /*
         * Confirmed recovered money from webhook/audit
         * actualAmount values.
         */
        recoveredRevenue,

        /*
         * Current unresolved opportunity value.
         */
        revenueAtRisk,

        /*
         * Backward-compatible case-count recovery rate.
         */
        recoveryRate: Number(
          caseRecoveryRate.toFixed(2)
        ),

        /*
         * Revenue-based recovery rate used by Analytics.
         */
        caseRecoveryRate: Number(
          caseRecoveryRate.toFixed(2)
        ),

        revenueRecoveryRate: Number(
          revenueRecoveryRate.toFixed(2)
        ),
      },
    });
  } catch (error) {
    console.error(
      "Failed to calculate recovery metrics:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Failed to calculate recovery metrics",
    });
  }
});

/**
 * POST /api/recovery/payment-link
 *
 * Creates a new Razorpay recovery payment link
 * and creates a RecoveryOpportunity.
 *
 * RecoveryOS AI automatically:
 * - diagnoses the failure
 * - calculates recovery probability
 * - estimates expected recovery
 * - assigns priority
 * - assigns urgency
 * - recommends a recovery strategy
 */
router.post(
  "/payment-link",
  async (req, res) => {
    try {
      const {
        amount,
        customer,
        description,
        referenceId,
        originalPaymentId,
        failureReason,
      } = req.body;

      if (!amount || !customer?.name) {
        return res.status(400).json({
          success: false,
          error:
            "amount and customer.name are required",
        });
      }

      /*
       * Run the AI decision engine once.
       */
      const decision = analyzeRecovery({
        amount,
        failureReason,
        customer,
      });

      console.log(
        "🤖 RecoveryOS AI Decision:",
        decision
      );

      /*
       * createPaymentLink also runs the engine so that
       * direct service calls remain intelligent.
       *
       * We pass the already calculated decision values
       * explicitly to keep this request deterministic.
       */
      const result =
        await createPaymentLink({
          amount,
          customer,
          description,
          referenceId,
          originalPaymentId,

          failureReason:
            decision.diagnosis,

          recoveryProbability:
            decision.recoveryProbability,

          recommendedAction:
            decision.recommendedAction,
        });

      return res.status(201).json({
        success: true,

        aiDecision: {
          diagnosis:
            decision.diagnosis,

          recoveryProbability:
            decision.recoveryProbability,

          recommendedAction:
            decision.recommendedAction,

          rationale:
            decision.rationale,

          expectedRecoveryAmount:
            decision.expectedRecoveryAmount,

          priority:
            decision.priority,

          urgency:
            decision.urgency,

          recoveryStrategy:
            decision.recoveryStrategy,
        },

        recoveryOpportunity: {
          id:
            result.recoveryOpportunity.id,

          status:
            result.recoveryOpportunity.status,

          priority:
            result.recoveryOpportunity.priority,

          urgency:
            result.recoveryOpportunity.urgency,

          recoveryStrategy:
            result.recoveryOpportunity
              .recoveryStrategy,
        },

        paymentLink: {
          id:
            result.paymentLink.id,

          shortUrl:
            result.paymentLink.short_url,

          status:
            result.paymentLink.status,

          amount:
            result.paymentLink.amount,

          currency:
            result.paymentLink.currency,
        },
      });
    } catch (error) {
      console.error(
        "Payment Link creation failed:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to create payment link",
      });
    }
  }
);

/**
 * POST /api/recovery/opportunities/:id/recover
 *
 * Initiates recovery for an existing opportunity.
 *
 * If a payment link already exists, the existing
 * recovery link is returned instead of creating
 * another one.
 */
router.post(
  "/opportunities/:id/recover",
  async (req, res) => {
    try {
      const { id } = req.params;

      const opportunity =
        await prisma.recoveryOpportunity.findUnique(
          {
            where: {
              id,
            },
          }
        );

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error:
            "Recovery opportunity not found",
        });
      }

      if (
        opportunity.status ===
        "RECOVERED"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "This recovery opportunity has already been recovered",
        });
      }

      /*
       * Prevent duplicate payment links.
       */
      if (
  opportunity.paymentLinkId &&
  opportunity.paymentLinkUrl
) {
  /*
   * Existing recovery link found.
   *
   * Older opportunities may have been created before
   * priority, urgency and recoveryStrategy were persisted.
   *
   * Backfill the missing AI intelligence without creating
   * another Razorpay payment link.
   */

  const decision = analyzeRecovery({
    amount: opportunity.amount,

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

        updatedAt:
          new Date(),
      },
    });

  return res.json({
    success: true,

    message:
      "Recovery payment link already exists. AI intelligence refreshed.",

    aiDecision: {
      diagnosis:
        decision.diagnosis,

      recoveryProbability:
        decision.recoveryProbability,

      recommendedAction:
        decision.recommendedAction,

      rationale:
        decision.rationale,

      expectedRecoveryAmount:
        decision.expectedRecoveryAmount,

      priority:
        decision.priority,

      urgency:
        decision.urgency,

      recoveryStrategy:
        decision.recoveryStrategy,
    },

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
        updatedOpportunity.recoveryStrategy,
    },

    paymentLink: {
      id:
        updatedOpportunity.paymentLinkId,

      shortUrl:
        updatedOpportunity.paymentLinkUrl,
    },
  });
}

      /*
       * Re-run the RecoveryOS decision engine.
       */
      const decision = analyzeRecovery({
        amount: opportunity.amount,

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

      console.log(
        "🤖 RecoveryOS Recovery Action:",
        decision
      );

      /*
       * Create the Razorpay recovery payment link.
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
            "RecoveryOS payment recovery",

          referenceId:
            `RECOVERY-${opportunity.id}`,

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
       * createPaymentLink creates a new opportunity.
       *
       * We don't want a duplicate opportunity,
       * so remove the temporary one.
       */
      await prisma.recoveryOpportunity.delete(
        {
          where: {
            id:
              result.recoveryOpportunity.id,
          },
        }
      );

      /*
       * Update the ORIGINAL opportunity with
       * the complete AI recovery intelligence.
       */
      const updatedOpportunity =
        await prisma.recoveryOpportunity.update({
          where: {
            id,
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

      return res.json({
        success: true,

        aiDecision: {
          diagnosis:
            decision.diagnosis,

          recoveryProbability:
            decision.recoveryProbability,

          recommendedAction:
            decision.recommendedAction,

          rationale:
            decision.rationale,

          expectedRecoveryAmount:
            decision.expectedRecoveryAmount,

          priority:
            decision.priority,

          urgency:
            decision.urgency,

          recoveryStrategy:
            decision.recoveryStrategy,
        },

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

          status:
            result.paymentLink.status,

          amount:
            result.paymentLink.amount,

          currency:
            result.paymentLink.currency,
        },
      });
    } catch (error) {
      console.error(
        "Recovery action failed:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to initiate recovery",
      });
    }
  }
);

export default router;