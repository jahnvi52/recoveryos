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
      error: "Failed to fetch recovery opportunities",
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
    const opportunities =
      await prisma.recoveryOpportunity.findMany({
        select: {
          amount: true,
          status: true,
        },
      });

    const totalOpportunities = opportunities.length;

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

    const recoveredRevenue =
      recoveredOpportunities.reduce(
        (total, opportunity) =>
          total + opportunity.amount,
        0
      );

    const revenueAtRisk =
      openOpportunities.reduce(
        (total, opportunity) =>
          total + opportunity.amount,
        0
      );

    const recoveryRate =
      totalOpportunities > 0
        ? (recoveredOpportunities.length /
            totalOpportunities) *
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

        recoveredRevenue,

        revenueAtRisk,

        recoveryRate: Number(
          recoveryRate.toFixed(2)
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
      error: "Failed to calculate recovery metrics",
    });
  }
});

/**
 * POST /api/recovery/payment-link
 *
 * Creates a new Razorpay recovery payment link
 * and creates a RecoveryOpportunity.
 *
 * The RecoveryOS AI Engine automatically:
 * - diagnoses the failure
 * - calculates recovery probability
 * - recommends an action
 * - estimates expected recovery
 */
router.post("/payment-link", async (req, res) => {
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

    const decision = analyzeRecovery({
      amount,
      failureReason,
      customer,
    });

    console.log(
      "🤖 RecoveryOS AI Decision:",
      decision
    );

    const result = await createPaymentLink({
      amount,
      customer,
      description,
      referenceId,
      originalPaymentId,
      failureReason: decision.diagnosis,
      recoveryProbability:
        decision.recoveryProbability,
      recommendedAction:
        decision.recommendedAction,
    });

    return res.status(201).json({
      success: true,

      aiDecision: {
        diagnosis: decision.diagnosis,

        recoveryProbability:
          decision.recoveryProbability,

        recommendedAction:
          decision.recommendedAction,

        rationale: decision.rationale,

        expectedRecoveryAmount:
          decision.expectedRecoveryAmount,
      },

      recoveryOpportunity: {
        id: result.recoveryOpportunity.id,
        status: result.recoveryOpportunity.status,
      },

      paymentLink: {
        id: result.paymentLink.id,
        shortUrl:
          result.paymentLink.short_url,
        status: result.paymentLink.status,
        amount: result.paymentLink.amount,
        currency: result.paymentLink.currency,
      },
    });
  } catch (error) {
    console.error(
      "Payment Link creation failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Failed to create payment link",
    });
  }
});

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

      if (
        opportunity.status === "RECOVERED"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "This recovery opportunity has already been recovered",
        });
      }

      /**
       * If a recovery payment link already exists,
       * do not create another one.
       */
      if (
        opportunity.paymentLinkId &&
        opportunity.paymentLinkUrl
      ) {
        return res.json({
          success: true,
          message:
            "Recovery payment link already exists",

          recoveryOpportunity: {
            id: opportunity.id,
            status: opportunity.status,
          },

          paymentLink: {
            id: opportunity.paymentLinkId,
            shortUrl:
              opportunity.paymentLinkUrl,
          },
        });
      }

      /**
       * Re-run the RecoveryOS decision engine
       * for the existing opportunity.
       */
      const decision = analyzeRecovery({
        amount: opportunity.amount,

        failureReason:
          opportunity.failureReason,

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

      console.log(
        "🤖 RecoveryOS Recovery Action:",
        decision
      );

      /**
       * Create the Razorpay recovery payment link.
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

      /**
       * createPaymentLink creates a new opportunity.
       *
       * We don't want a duplicate opportunity,
       * so remove the temporary one.
       */
      await prisma.recoveryOpportunity.delete({
        where: {
          id: result.recoveryOpportunity.id,
        },
      });

      /**
       * Update the original opportunity with
       * the new recovery information.
       */
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

            status: "RECOVERY_INITIATED",

            paymentLinkId:
              result.paymentLink.id,

            paymentLinkUrl:
              result.paymentLink.short_url,

            updatedAt: new Date(),
          },
        });

      return res.json({
        success: true,

        aiDecision: {
          diagnosis: decision.diagnosis,

          recoveryProbability:
            decision.recoveryProbability,

          recommendedAction:
            decision.recommendedAction,

          rationale: decision.rationale,

          expectedRecoveryAmount:
            decision.expectedRecoveryAmount,
        },

        recoveryOpportunity: {
          id: updatedOpportunity.id,
          status: updatedOpportunity.status,
        },

        paymentLink: {
          id: result.paymentLink.id,

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