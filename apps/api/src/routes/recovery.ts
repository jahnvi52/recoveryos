import { Router } from "express";
import { createPaymentLink } from "../services/paymentlink";
import { prisma } from "../db/prisma";

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

    const pendingOpportunities =
      opportunities.filter(
        (opportunity) =>
          opportunity.status === "PENDING"
      );

    const recoveredRevenue =
      recoveredOpportunities.reduce(
        (total, opportunity) =>
          total + opportunity.amount,
        0
      );

    const revenueAtRisk =
      pendingOpportunities.reduce(
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
          pendingOpportunities.length,

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
 * Creates a Razorpay Payment Link and
 * records a RecoveryOpportunity.
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
      recoveryProbability,
      recommendedAction,
    } = req.body;

    if (!amount || !customer?.name) {
      return res.status(400).json({
        success: false,
        error:
          "amount and customer.name are required",
      });
    }

    const result = await createPaymentLink({
      amount,
      customer,
      description,
      referenceId,
      originalPaymentId,
      failureReason,
      recoveryProbability,
      recommendedAction,
    });

    return res.status(201).json({
      success: true,

      recoveryOpportunity: {
        id: result.recoveryOpportunity.id,
        status: result.recoveryOpportunity.status,
      },

      paymentLink: {
        id: result.paymentLink.id,
        shortUrl: result.paymentLink.short_url,
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

export default router;