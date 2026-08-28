import { Router } from "express";
import { createPaymentLink } from "../services/paymentlink";

const router = Router();

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
        error: "amount and customer.name are required",
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