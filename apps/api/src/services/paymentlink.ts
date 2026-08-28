import { razorpay } from "./razorpay";
import { prisma } from "../db/prisma";

type CreatePaymentLinkInput = {
  amount: number;
  customer: {
    name: string;
    email?: string;
    contact?: string;
  };
  description?: string;
  referenceId?: string;
  originalPaymentId?: string;
  failureReason?: string;
  recoveryProbability?: number;
  recommendedAction?: string;
};

export async function createPaymentLink(
  input: CreatePaymentLinkInput
) {
  const referenceId =
    input.referenceId ?? `RECOVERY-${Date.now()}`;

  // 1. Create Payment Link in Razorpay
  const paymentLink = await razorpay.paymentLink.create({
    amount: input.amount,
    currency: "INR",
    accept_partial: false,

    description:
      input.description ?? "RecoveryOS payment recovery",

    reference_id: referenceId,

    customer: {
      name: input.customer.name,
      email: input.customer.email,
      contact: input.customer.contact,
    },

    notify: {
      email: false,
      sms: false,
    },

    reminder_enable: false,

    expire_by:
      Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  });

  // 2. Store recovery opportunity in our database
  const recoveryOpportunity =
    await prisma.recoveryOpportunity.create({
      data: {
        customerName: input.customer.name,
        customerEmail: input.customer.email,
        customerContact: input.customer.contact,

        amount: input.amount,
        currency: "INR",

        originalPaymentId:
          input.originalPaymentId,

        failureReason:
          input.failureReason,

        recoveryProbability:
          input.recoveryProbability,

        recommendedAction:
          input.recommendedAction,

        status: "RECOVERY_INITIATED",

        paymentLinkId: paymentLink.id,
        paymentLinkUrl: paymentLink.short_url,
      },
    });

  return {
    paymentLink,
    recoveryOpportunity,
  };
}