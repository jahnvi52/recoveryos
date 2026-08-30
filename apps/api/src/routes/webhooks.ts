import { Router } from "express";
import crypto from "crypto";

import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { recordRecoveryAuditEvent } from "../services/recoveryAudit";

const router = Router();

router.post("/", async (req, res) => {
  try {
    /*
     * ---------------------------------------------------------
     * 1. READ RAW WEBHOOK BODY
     * ---------------------------------------------------------
     */

    const rawBody = req.body as Buffer;

    if (!Buffer.isBuffer(rawBody)) {
      console.error(
        "❌ Webhook body is not a raw Buffer"
      );

      return res.status(400).json({
        success: false,
        error:
          "Webhook body must be received as raw bytes",
      });
    }

    /*
     * ---------------------------------------------------------
     * 2. READ RAZORPAY HEADERS
     * ---------------------------------------------------------
     */

    const signature = req.header(
      "X-Razorpay-Signature"
    );

    const eventId = req.header(
      "x-razorpay-event-id"
    );

    if (!signature) {
      console.error(
        "❌ Missing Razorpay webhook signature"
      );

      return res.status(400).json({
        success: false,
        error:
          "Missing Razorpay webhook signature",
      });
    }

    if (!eventId) {
      console.error(
        "❌ Missing Razorpay event ID"
      );

      return res.status(400).json({
        success: false,
        error:
          "Missing Razorpay event ID",
      });
    }

    /*
     * ---------------------------------------------------------
     * 3. VERIFY HMAC SIGNATURE
     * ---------------------------------------------------------
     */

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          env.razorpay.webhookSecret
        )
        .update(rawBody)
        .digest("hex");

    if (
      expectedSignature.length !==
      signature.length
    ) {
      console.error(
        "❌ Invalid Razorpay webhook signature"
      );

      return res.status(400).json({
        success: false,
        error:
          "Invalid webhook signature",
      });
    }

    const signaturesMatch =
      crypto.timingSafeEqual(
        Buffer.from(
          expectedSignature,
          "utf8"
        ),
        Buffer.from(
          signature,
          "utf8"
        )
      );

    if (!signaturesMatch) {
      console.error(
        "❌ Invalid Razorpay webhook signature"
      );

      return res.status(400).json({
        success: false,
        error:
          "Invalid webhook signature",
      });
    }

    console.log(
      "✅ Webhook signature verified"
    );

    console.log(
      "📩 Event ID:",
      eventId
    );

    /*
     * ---------------------------------------------------------
     * 4. PARSE PAYLOAD
     * ---------------------------------------------------------
     */

    let payload: any;

    try {
      payload = JSON.parse(
        rawBody.toString("utf8")
      );
    } catch {
      console.error(
        "❌ Invalid webhook JSON"
      );

      return res.status(400).json({
        success: false,
        error:
          "Invalid webhook JSON",
      });
    }

    const eventType =
      payload?.event;

    console.log(
      "📨 Razorpay webhook:",
      eventType
    );

    /*
     * ---------------------------------------------------------
     * 5. IDEMPOTENCY CHECK
     * ---------------------------------------------------------
     *
     * Razorpay can retry webhooks.
     *
     * If this event ID was already attached
     * to a recovery opportunity, do nothing.
     */

    const existingEvent =
      await prisma.recoveryOpportunity.findFirst(
        {
          where: {
            webhookEventId:
              eventId,
          },
        }
      );

    if (existingEvent) {
      console.log(
        "♻️ Duplicate webhook ignored:",
        eventId
      );

      return res.status(200).json({
        success: true,
        message:
          "Webhook already processed",
        recoveryOpportunityId:
          existingEvent.id,
      });
    }

    /*
     * ---------------------------------------------------------
     * 6. ONLY PROCESS payment_link.paid
     * ---------------------------------------------------------
     */

    if (
      eventType !==
      "payment_link.paid"
    ) {
      console.log(
        "ℹ️ Event ignored:",
        eventType
      );

      return res.status(200).json({
        success: true,
        message:
          "Event ignored",
      });
    }

    /*
     * ---------------------------------------------------------
     * 7. EXTRACT RAZORPAY ENTITIES
     * ---------------------------------------------------------
     */

    const paymentLink =
      payload?.payload
        ?.payment_link
        ?.entity;

    const payment =
      payload?.payload
        ?.payment
        ?.entity;

    const paymentLinkId =
      paymentLink?.id;

    const razorpayPaymentId =
      payment?.id ?? null;

    if (!paymentLinkId) {
      console.error(
        "❌ Payment Link ID missing"
      );

      return res.status(400).json({
        success: false,
        error:
          "Payment Link ID missing from webhook",
      });
    }

    console.log(
      "🔗 Payment Link ID:",
      paymentLinkId
    );

    console.log(
      "💳 Payment ID:",
      razorpayPaymentId
    );

    /*
     * ---------------------------------------------------------
     * 8. FIND RECOVERY OPPORTUNITY
     * ---------------------------------------------------------
     */

    const recoveryOpportunity =
      await prisma.recoveryOpportunity.findFirst(
        {
          where: {
            paymentLinkId,
          },
        }
      );

    console.log(
      "🔎 Recovery Opportunity:",
      recoveryOpportunity?.id ??
        "NOT FOUND"
    );

    if (!recoveryOpportunity) {
      console.error(
        "❌ No RecoveryOpportunity found for Payment Link:",
        paymentLinkId
      );

      return res.status(404).json({
        success: false,
        error:
          "Recovery opportunity not found",
      });
    }

    /*
     * ---------------------------------------------------------
     * 9. PREVENT REPROCESSING
     * ---------------------------------------------------------
     */

    if (
      recoveryOpportunity.status ===
        "RECOVERED" ||
      recoveryOpportunity.webhookEventId
    ) {
      console.log(
        "♻️ Opportunity already recovered:",
        recoveryOpportunity.id
      );

      return res.status(200).json({
        success: true,
        message:
          "Recovery already processed",
        recoveryOpportunityId:
          recoveryOpportunity.id,
      });
    }

    /*
     * ---------------------------------------------------------
     * 10. DETERMINE ACTUAL RECOVERED AMOUNT
     * ---------------------------------------------------------
     *
     * Prefer payment.amount because it represents
     * the actual captured payment.
     *
     * Fall back to payment_link.amount_paid
     * for the local test webhook.
     */

    const actualAmount =
      typeof payment?.amount ===
      "number"
        ? payment.amount
        : typeof paymentLink?.amount_paid ===
            "number"
          ? paymentLink.amount_paid
          : recoveryOpportunity.amount;

    /*
     * ---------------------------------------------------------
     * 11. UPDATE OPPORTUNITY
     * ---------------------------------------------------------
     */

    const updated =
      await prisma.recoveryOpportunity.update(
        {
          where: {
            id:
              recoveryOpportunity.id,
          },

          data: {
            status:
              "RECOVERED",

            recoveredAt:
              new Date(),

            razorpayPaymentId,

            webhookEventId:
              eventId,
          },
        }
      );

    /*
     * ---------------------------------------------------------
     * 12. RECORD RECOVERED AUDIT EVENT
     * ---------------------------------------------------------
     */

    await recordRecoveryAuditEvent({
      opportunityId:
        updated.id,

      eventType:
        "RECOVERED",

      action:
        "PAYMENT_CONFIRMED",

      executionMode:
        "WEBHOOK",

      reason:
        "Razorpay payment_link.paid webhook confirmed successful payment.",

      expectedAmount:
        recoveryOpportunity.amount,

      actualAmount,

      metadata: {
        razorpayEvent:
          eventType,

        webhookEventId:
          eventId,

        paymentLinkId,

        razorpayPaymentId,

        currency:
          payment?.currency ??
          "INR",

        paymentStatus:
          payment?.status ??
          null,

        customerName:
          recoveryOpportunity.customerName,

        recoveryOpportunityId:
          updated.id,

        recoveredAt:
          updated.recoveredAt
            ?.toISOString() ??
          null,
      },
    });

    /*
     * ---------------------------------------------------------
     * 13. LOG SUCCESS
     * ---------------------------------------------------------
     */

    console.log(
      `💰 Recovery completed: ₹${(
        actualAmount / 100
      ).toFixed(2)}`
    );

    console.log(
      "✅ Recovery Opportunity updated:",
      updated.id
    );

    console.log(
      "🧾 RECOVERED audit event recorded"
    );

    /*
     * ---------------------------------------------------------
     * 14. RESPONSE
     * ---------------------------------------------------------
     */

    return res.status(200).json({
      success: true,

      message:
        "Recovery marked as recovered",

      recoveryOpportunityId:
        updated.id,

      amountRecovered:
        actualAmount,

      razorpayPaymentId,

      webhookEventId:
        eventId,

      status:
        updated.status,
    });
  } catch (error) {
    console.error(
      "❌ Webhook processing failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Webhook processing failed",
    });
  }
});

export default router;