import { razorpay } from "./razorpay";
import { prisma } from "../db/prisma";
import { analyzeRecovery } from "./recoveryEngine";

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

  // Optional overrides from an existing caller.
  recoveryProbability?: number;
  recommendedAction?: string;
};

export async function createPaymentLink(
  input: CreatePaymentLinkInput
) {
  const referenceId =
    input.referenceId ??
    `RECOVERY-${Date.now()}`;

  /*
   * -------------------------------------------------------
   * 1. RUN RECOVERY INTELLIGENCE
   * -------------------------------------------------------
   */

  const recoveryDecision = analyzeRecovery({
    amount: input.amount,
    failureReason: input.failureReason,
    customer: input.customer,
  });

  /*
   * Allow explicitly supplied values to override the
   * engine's probability/action, while using the AI
   * engine as the default source of truth.
   */

  const recoveryProbability =
    input.recoveryProbability ??
    recoveryDecision.recoveryProbability;

  const recommendedAction =
    input.recommendedAction ??
    recoveryDecision.recommendedAction;

  const expectedRecoveryAmount =
    Math.round(
      input.amount *
        (recoveryProbability / 100)
    );

  /*
   * -------------------------------------------------------
   * 2. CREATE PAYMENT LINK IN RAZORPAY
   * -------------------------------------------------------
   */

  const paymentLink =
    await razorpay.paymentLink.create({
      amount: input.amount,

      currency: "INR",

      accept_partial: false,

      description:
        input.description ??
        "RecoveryOS payment recovery",

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
        Math.floor(Date.now() / 1000) +
        24 * 60 * 60,
    });

  /*
   * -------------------------------------------------------
   * 3. STORE RECOVERY OPPORTUNITY
   * -------------------------------------------------------
   */

  const recoveryOpportunity =
    await prisma.recoveryOpportunity.create({
      data: {
        customerName:
          input.customer.name,

        customerEmail:
          input.customer.email,

        customerContact:
          input.customer.contact,

        amount: input.amount,

        currency: "INR",

        originalPaymentId:
          input.originalPaymentId,

        failureReason:
          input.failureReason,

        recoveryProbability,

        recommendedAction,

        /*
         * AI intelligence
         */

        priority:
          recoveryDecision.priority,

        urgency:
          recoveryDecision.urgency,

        recoveryStrategy:
          recoveryDecision.recoveryStrategy,

        status:
          "RECOVERY_INITIATED",

        paymentLinkId:
          paymentLink.id,

        paymentLinkUrl:
          paymentLink.short_url,
      },
    });

  /*
   * -------------------------------------------------------
   * 4. RETURN EVERYTHING THE API NEEDS
   * -------------------------------------------------------
   */

  return {
    paymentLink,

    recoveryOpportunity,

    recoveryDecision: {
      diagnosis:
        recoveryDecision.diagnosis,

      recoveryProbability,

      recommendedAction,

      rationale:
        recoveryDecision.rationale,

      expectedRecoveryAmount,

      priority:
        recoveryDecision.priority,

      urgency:
        recoveryDecision.urgency,

      recoveryStrategy:
        recoveryDecision.recoveryStrategy,
    },
  };
}