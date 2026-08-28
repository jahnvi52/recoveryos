import { Router } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const rawBody = req.body as Buffer;

    const signature = req.header("X-Razorpay-Signature");
    const eventId = req.header("x-razorpay-event-id");

    if (!signature) {
      console.error("❌ Missing Razorpay webhook signature");

      return res.status(400).json({
        success: false,
        error: "Missing Razorpay webhook signature",
      });
    }

    if (!eventId) {
      console.error("❌ Missing Razorpay event ID");

      return res.status(400).json({
        success: false,
        error: "Missing Razorpay event ID",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", env.razorpay.webhookSecret)
      .update(rawBody)
      .digest("hex");

    const signaturesMatch =
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      );

    if (!signaturesMatch) {
      console.error("❌ Invalid Razorpay webhook signature");

      return res.status(400).json({
        success: false,
        error: "Invalid webhook signature",
      });
    }

    console.log("✅ Webhook signature verified");
    console.log("📩 Event ID:", eventId);

    const existingEvent =
      await prisma.recoveryOpportunity.findUnique({
        where: {
          webhookEventId: eventId,
        },
      });

    if (existingEvent) {
      console.log("♻️ Duplicate webhook ignored");

      return res.status(200).json({
        success: true,
        message: "Webhook already processed",
      });
    }

    const payload = JSON.parse(rawBody.toString("utf8"));

    console.log("Razorpay webhook:", payload.event);

    if (payload.event !== "payment_link.paid") {
      console.log("ℹ️ Event ignored:", payload.event);

      return res.status(200).json({
        success: true,
        message: "Event ignored",
      });
    }

    const paymentLink =
      payload.payload?.payment_link?.entity;

    const payment =
      payload.payload?.payment?.entity;

    console.log("🔗 Payment Link ID:", paymentLink?.id);
    console.log("💳 Payment ID:", payment?.id);

    if (!paymentLink?.id) {
      console.error("❌ Payment Link ID missing");

      return res.status(400).json({
        success: false,
        error: "Payment Link ID missing from webhook",
      });
    }

    const recoveryOpportunity =
      await prisma.recoveryOpportunity.findFirst({
        where: {
          paymentLinkId: paymentLink.id,
        },
      });

    console.log(
      "🔎 Recovery Opportunity:",
      recoveryOpportunity?.id ?? "NOT FOUND"
    );

    if (!recoveryOpportunity) {
      console.error(
        "❌ No RecoveryOpportunity found for Payment Link:",
        paymentLink.id
      );

      return res.status(404).json({
        success: false,
        error: "Recovery opportunity not found",
      });
    }

    const updated =
      await prisma.recoveryOpportunity.update({
        where: {
          id: recoveryOpportunity.id,
        },
        data: {
          status: "RECOVERED",
          recoveredAt: new Date(),
          razorpayPaymentId: payment?.id ?? null,
          webhookEventId: eventId,
        },
      });

    console.log(
      `💰 Recovery completed: ₹${(
        paymentLink.amount_paid / 100
      ).toFixed(2)}`
    );

    console.log(
      "✅ Recovery Opportunity updated:",
      updated.id
    );

    return res.status(200).json({
      success: true,
      message: "Recovery marked as recovered",
      recoveryOpportunityId: updated.id,
      amountRecovered: paymentLink.amount_paid,
      razorpayPaymentId: payment?.id ?? null,
    });
  } catch (error) {
    console.error("❌ Webhook processing failed:", error);

    return res.status(500).json({
      success: false,
      error: "Webhook processing failed",
    });
  }
});

export default router;