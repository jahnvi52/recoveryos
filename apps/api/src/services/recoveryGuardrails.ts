import { prisma } from "../db/prisma";

export type GuardrailDecision =
  | "ALLOW_AUTO"
  | "REQUIRE_HUMAN"
  | "SUPPRESS"
  | "STOP";

export type GuardrailResult = {
  decision: GuardrailDecision;

  allowed: boolean;

  reason: string;

  checks: {
    name: string;
    passed: boolean;
    reason: string;
  }[];

  attemptCount: number;

  maxAttempts: number;
};

const MIN_RECOVERY_PROBABILITY = 60;

const MIN_EXPECTED_RECOVERY = 500;

const HUMAN_APPROVAL_AMOUNT = 100000;

const MAX_ATTEMPTS = 2;

export async function evaluateRecoveryGuardrails(
  opportunityId: string
) {
  const opportunity =
    await prisma.recoveryOpportunity.findUnique({
      where: {
        id: opportunityId,
      },
    });

  if (!opportunity) {
    throw new Error(
      "Recovery opportunity not found"
    );
  }

  /*
   * -------------------------------------------------------
   * COUNT PREVIOUS RECOVERY ATTEMPTS
   * -------------------------------------------------------
   */

  const attemptEvents =
    await prisma.recoveryAuditEvent.count({
      where: {
        opportunityId,

        eventType: {
          in: [
            "RECOVERY_ATTEMPTED",
            "EXECUTED",
          ],
        },
      },
    });

  const attemptCount =
    attemptEvents;

  /*
   * -------------------------------------------------------
   * RECOVERY VALUE
   * -------------------------------------------------------
   */

  const recoveryProbability =
    opportunity.recoveryProbability ?? 0;

  const expectedRecoveryAmount =
    Math.round(
      opportunity.amount *
        (recoveryProbability / 100)
    );

  /*
   * -------------------------------------------------------
   * GUARDRAIL CHECKS
   * -------------------------------------------------------
   */

  const checks: {
    name: string;
    passed: boolean;
    reason: string;
  }[] = [];

  /*
   * 1. RECOVERY STILL OPEN
   */

  const recoveryStillOpen =
    opportunity.status !== "RECOVERED";

  checks.push({
    name:
      "Recovery still open",

    passed:
      recoveryStillOpen,

    reason:
      recoveryStillOpen
        ? "The opportunity is still eligible for recovery."
        : "The opportunity has already been recovered.",
  });

  /*
   * 2. MAXIMUM ATTEMPTS
   */

  const attemptsAvailable =
    attemptCount < MAX_ATTEMPTS;

  checks.push({
    name:
      "Maximum recovery attempts",

    passed:
      attemptsAvailable,

    reason:
      attemptsAvailable
        ? `${attemptCount} of ${MAX_ATTEMPTS} recovery attempts used.`
        : `Maximum of ${MAX_ATTEMPTS} recovery attempts has been reached.`,
  });

  /*
   * 3. MINIMUM RECOVERY PROBABILITY
   */

  const probabilityPassed =
    recoveryProbability >=
    MIN_RECOVERY_PROBABILITY;

  checks.push({
    name:
      "Minimum recovery probability",

    passed:
      probabilityPassed,

    reason:
      probabilityPassed
        ? `${recoveryProbability}% is above the ${MIN_RECOVERY_PROBABILITY}% minimum.`
        : `${recoveryProbability}% is below the ${MIN_RECOVERY_PROBABILITY}% minimum.`,
  });

  /*
   * 4. MINIMUM EXPECTED RECOVERY
   */

  const expectedValuePassed =
    expectedRecoveryAmount >=
    MIN_EXPECTED_RECOVERY;

  checks.push({
    name:
      "Minimum expected recovery",

    passed:
      expectedValuePassed,

    reason:
      expectedValuePassed
        ? `₹${expectedRecoveryAmount.toLocaleString(
            "en-IN"
          )} expected recovery clears the ₹${MIN_EXPECTED_RECOVERY.toLocaleString(
            "en-IN"
          )} minimum.`
        : `₹${expectedRecoveryAmount.toLocaleString(
            "en-IN"
          )} expected recovery is below the ₹${MIN_EXPECTED_RECOVERY.toLocaleString(
            "en-IN"
          )} minimum.`,
  });

  /*
   * 5. DUPLICATE PAYMENT LINK
   */

  const duplicateLinkProtected =
    !(
      opportunity.paymentLinkId &&
      opportunity.paymentLinkUrl
    );

  checks.push({
    name:
      "Duplicate payment-link protection",

    passed:
      true,

    reason:
      duplicateLinkProtected
        ? "No existing recovery payment link is present."
        : "An existing recovery payment link is present, so RecoveryOS will not create another one.",
  });

  /*
   * -------------------------------------------------------
   * STOP CONDITIONS
   * -------------------------------------------------------
   */

  if (!recoveryStillOpen) {
    return {
      decision:
        "STOP" as GuardrailDecision,

      allowed: false,

      reason:
        "Recovery has already completed. RecoveryOS stops further action.",

      checks,

      attemptCount,

      maxAttempts:
        MAX_ATTEMPTS,
    };
  }

  if (!attemptsAvailable) {
    return {
      decision:
        "STOP" as GuardrailDecision,

      allowed: false,

      reason:
        `RecoveryOS reached the maximum of ${MAX_ATTEMPTS} recovery attempts and stopped further action.`,

      checks,

      attemptCount,

      maxAttempts:
        MAX_ATTEMPTS,
    };
  }

  /*
   * -------------------------------------------------------
   * SUPPRESSION CONDITIONS
   * -------------------------------------------------------
   */

  if (!probabilityPassed) {
    return {
      decision:
        "SUPPRESS" as GuardrailDecision,

      allowed: false,

      reason:
        `Recovery probability of ${recoveryProbability}% is below the ${MIN_RECOVERY_PROBABILITY}% minimum. RecoveryOS suppresses the opportunity.`,

      checks,

      attemptCount,

      maxAttempts:
        MAX_ATTEMPTS,
    };
  }

  if (!expectedValuePassed) {
    return {
      decision:
        "SUPPRESS" as GuardrailDecision,

      allowed: false,

      reason:
        `Expected recovery of ₹${expectedRecoveryAmount.toLocaleString(
          "en-IN"
        )} is below the ₹${MIN_EXPECTED_RECOVERY.toLocaleString(
          "en-IN"
        )} minimum. RecoveryOS suppresses the opportunity.`,

      checks,

      attemptCount,

      maxAttempts:
        MAX_ATTEMPTS,
    };
  }

  /*
   * -------------------------------------------------------
   * HUMAN APPROVAL
   * -------------------------------------------------------
   */

  if (
    opportunity.amount >=
    HUMAN_APPROVAL_AMOUNT
  ) {
    return {
      decision:
        "REQUIRE_HUMAN" as GuardrailDecision,

      allowed: true,

      reason:
        `Opportunity value of ₹${opportunity.amount.toLocaleString(
          "en-IN"
        )} exceeds the ₹${HUMAN_APPROVAL_AMOUNT.toLocaleString(
          "en-IN"
        )} human-approval threshold.`,

      checks,

      attemptCount,

      maxAttempts:
        MAX_ATTEMPTS,
    };
  }

  /*
   * -------------------------------------------------------
   * AUTO EXECUTION
   * -------------------------------------------------------
   */

  return {
    decision:
      "ALLOW_AUTO" as GuardrailDecision,

    allowed: true,

    reason:
      "All recovery guardrails passed. The opportunity is eligible for bounded automatic execution.",

    checks,

    attemptCount,

    maxAttempts:
      MAX_ATTEMPTS,
  };
}