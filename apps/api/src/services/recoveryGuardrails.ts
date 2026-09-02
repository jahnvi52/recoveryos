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

/*
 * IMPORTANT
 * ---------------------------------------------------------
 * RecoveryOS stores money in PAISE.
 *
 * ₹1 = 100 paise
 *
 * Therefore:
 *
 * ₹500       = 50,000 paise
 * ₹1,00,000  = 10,000,000 paise
 * ---------------------------------------------------------
 */

const MIN_RECOVERY_PROBABILITY = 60;

/*
 * ₹500 minimum expected recovery.
 */
const MIN_EXPECTED_RECOVERY = 50_000;

/*
 * ₹1,00,000 human approval threshold.
 */
const HUMAN_APPROVAL_AMOUNT = 10_000_000;

/*
 * Maximum number of recovery execution attempts.
 */
const MAX_ATTEMPTS = 2;

export async function evaluateRecoveryGuardrails(
  opportunityId: string
): Promise<GuardrailResult> {
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

  const attemptCount = attemptEvents;

  /*
   * -------------------------------------------------------
   * RECOVERY VALUE
   * -------------------------------------------------------
   */

  const recoveryProbability =
    opportunity.recoveryProbability ?? 0;

  /*
   * Amount is stored in paise.
   */
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
    name: "Recovery still open",

    passed: recoveryStillOpen,

    reason: recoveryStillOpen
      ? "The opportunity is still eligible for recovery."
      : "The opportunity has already been recovered.",
  });

  /*
   * 2. MAXIMUM ATTEMPTS
   */

  const attemptsAvailable =
    attemptCount < MAX_ATTEMPTS;

  checks.push({
    name: "Maximum recovery attempts",

    passed: attemptsAvailable,

    reason: attemptsAvailable
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
   *
   * ₹500 = 50,000 paise.
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
        ? `₹${(
            expectedRecoveryAmount / 100
          ).toLocaleString(
            "en-IN"
          )} expected recovery clears the ₹500 minimum.`
        : `₹${(
            expectedRecoveryAmount / 100
          ).toLocaleString(
            "en-IN"
          )} expected recovery is below the ₹500 minimum.`,
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

    /*
     * This check is informational.
     *
     * Existing links are handled by the recovery route.
     */
    passed: true,

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
      decision: "STOP",

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
      decision: "STOP",

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
      decision: "SUPPRESS",

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
      decision: "SUPPRESS",

      allowed: false,

      reason:
        `Expected recovery of ₹${(
          expectedRecoveryAmount / 100
        ).toLocaleString(
          "en-IN"
        )} is below the ₹500 minimum. RecoveryOS suppresses the opportunity.`,

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
   *
   * IMPORTANT:
   *
   * ₹1,00,000 = 10,000,000 paise.
   *
   * Any opportunity at or above this amount MUST NOT
   * automatically create a recovery payment link.
   */

  if (
    opportunity.amount >=
    HUMAN_APPROVAL_AMOUNT
  ) {
    const amountInRupees =
      opportunity.amount / 100;

    return {
      decision:
        "REQUIRE_HUMAN",

      allowed: true,

      reason:
        `Opportunity value of ₹${amountInRupees.toLocaleString(
          "en-IN"
        )} exceeds the ₹1,00,000 human-approval threshold. RecoveryOS pauses execution and requires human approval.`,

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
      "ALLOW_AUTO",

    allowed: true,

    reason:
      "All recovery guardrails passed. The opportunity is eligible for bounded automatic execution.",

    checks,

    attemptCount,

    maxAttempts:
      MAX_ATTEMPTS,
  };
}