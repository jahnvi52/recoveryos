export type RecoveryInput = {
  amount: number;

  failureReason?: string | null;

  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
};

export type RecoveryPriority =
  | "HIGH"
  | "MEDIUM"
  | "LOW";

export type RecoveryUrgency =
  | "URGENT"
  | "TODAY"
  | "FRESH";

export type RecoveryDecision = {
  diagnosis: string;

  recoveryProbability: number;

  recommendedAction: string;

  rationale: string;

  expectedRecoveryAmount: number;

  priority: RecoveryPriority;

  urgency: RecoveryUrgency;

  recoveryStrategy: string;
};

export function analyzeRecovery(
  input: RecoveryInput
): RecoveryDecision {
  const amount = Math.max(
    0,
    Number(input.amount) || 0
  );

  const reason = (
    input.failureReason ||
    "unknown payment failure"
  ).toLowerCase();

  /*
   * -------------------------------------------------------
   * BASE DECISION
   * -------------------------------------------------------
   */

  let diagnosis =
    "Unclassified payment failure";

  let recoveryProbability = 55;

  let recommendedAction =
    "Send a recovery payment link";

  let rationale =
    "A recovery payment link gives the customer another opportunity to complete the payment.";

  let recoveryStrategy =
    "Create a fresh payment attempt and give the customer another opportunity to complete the transaction.";

  /*
   * -------------------------------------------------------
   * FAILURE CLASSIFICATION
   * -------------------------------------------------------
   */

  if (
    reason.includes("insufficient") ||
    reason.includes("fund") ||
    reason.includes("balance")
  ) {
    diagnosis = "Insufficient funds";

    recoveryProbability = 78;

    recommendedAction =
      "Send a recovery payment link";

    rationale =
      "The payment appears to have failed because the customer did not have sufficient funds. A new payment attempt gives the customer an opportunity to complete the purchase later.";

    recoveryStrategy =
      "Wait for a better payment opportunity and send a fresh payment link so the customer can retry the transaction.";
  } else if (
    reason.includes("card") ||
    reason.includes("declined") ||
    reason.includes("issuer")
  ) {
    diagnosis =
      "Card payment was declined";

    recoveryProbability = 64;

    recommendedAction =
      "Send a recovery payment link";

    rationale =
      "The customer's card payment was declined. A fresh payment attempt may allow the customer to retry with the same or another payment method.";

    recoveryStrategy =
      "Provide a fresh payment link that allows the customer to retry or choose another available payment method.";
  } else if (
    reason.includes("network") ||
    reason.includes("timeout") ||
    reason.includes("technical") ||
    reason.includes("server")
  ) {
    diagnosis =
      "Temporary payment processing failure";

    recoveryProbability = 86;

    recommendedAction =
      "Retry payment and send a recovery link if needed";

    rationale =
      "The failure appears technical or temporary rather than customer-driven, making another payment attempt highly recoverable.";

    recoveryStrategy =
      "Retry the transaction quickly. If the retry does not complete, provide a recovery payment link.";
  } else if (
    reason.includes("authentication") ||
    reason.includes("otp") ||
    reason.includes("3d secure") ||
    reason.includes("3ds")
  ) {
    diagnosis =
      "Payment authentication failed";

    recoveryProbability = 71;

    recommendedAction =
      "Send a recovery payment link";

    rationale =
      "The payment could not complete its authentication step. A fresh payment attempt can allow the customer to complete authentication successfully.";

    recoveryStrategy =
      "Create a fresh payment attempt and allow the customer to complete the authentication flow again.";
  } else if (
    reason.includes("expired") ||
    reason.includes("expiry")
  ) {
    diagnosis =
      "Payment attempt expired";

    recoveryProbability = 68;

    recommendedAction =
      "Send a new recovery payment link";

    rationale =
      "The original payment attempt is no longer usable. A fresh payment link provides a new opportunity to recover the transaction.";

    recoveryStrategy =
      "Create a new time-bound payment link and give the customer a fresh checkout opportunity.";
  }

  /*
   * -------------------------------------------------------
   * EXPECTED RECOVERY VALUE
   * -------------------------------------------------------
   */

  const expectedRecoveryAmount =
    Math.round(
      amount *
        (recoveryProbability / 100)
    );

  /*
   * -------------------------------------------------------
   * PRIORITY
   *
   * Priority combines:
   * - transaction value
   * - recovery probability
   *
   * The result is a probability-weighted
   * recovery opportunity.
   * -------------------------------------------------------
   */

  const expectedValue =
    amount *
    (recoveryProbability / 100);

  let priority: RecoveryPriority;

  if (
    expectedValue >= 100000 ||
    (amount >= 500000 &&
      recoveryProbability >= 70)
  ) {
    priority = "HIGH";
  } else if (
    expectedValue >= 25000 ||
    (amount >= 100000 &&
      recoveryProbability >= 60)
  ) {
    priority = "MEDIUM";
  } else {
    priority = "LOW";
  }

  /*
   * -------------------------------------------------------
   * URGENCY
   *
   * The engine does not currently receive a timestamp
   * for the failed payment, so urgency is determined
   * conservatively from opportunity value and failure type.
   *
   * Temporary technical failures should be acted on
   * immediately.
   * -------------------------------------------------------
   */

  let urgency: RecoveryUrgency = "FRESH";

  if (
    reason.includes("network") ||
    reason.includes("timeout") ||
    reason.includes("technical") ||
    reason.includes("server")
  ) {
    urgency = "URGENT";
  } else if (
    expectedValue >= 100000 ||
    recoveryProbability >= 80
  ) {
    urgency = "TODAY";
  }

  /*
   * -------------------------------------------------------
   * RETURN DECISION
   * -------------------------------------------------------
   */

  return {
    diagnosis,

    recoveryProbability,

    recommendedAction,

    rationale,

    expectedRecoveryAmount,

    priority,

    urgency,

    recoveryStrategy,
  };
}