export type RecoveryInput = {
  amount: number;
  failureReason?: string | null;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
};

export type RecoveryDecision = {
  diagnosis: string;
  recoveryProbability: number;
  recommendedAction: string;
  rationale: string;
  expectedRecoveryAmount: number;
};

export function analyzeRecovery(
  input: RecoveryInput
): RecoveryDecision {
  const amount = Number(input.amount) || 0;

  const reason = (
    input.failureReason || "unknown payment failure"
  ).toLowerCase();

  let diagnosis = "Unclassified payment failure";
  let recoveryProbability = 55;
  let recommendedAction = "Send a recovery payment link";
  let rationale =
    "A recovery payment link gives the customer another opportunity to complete the payment.";

  if (
    reason.includes("insufficient") ||
    reason.includes("fund") ||
    reason.includes("balance")
  ) {
    diagnosis = "Insufficient funds";
    recoveryProbability = 78;
    recommendedAction = "Send a recovery payment link";
    rationale =
      "The payment appears to have failed because the customer did not have sufficient funds. A new payment attempt gives the customer an opportunity to complete the purchase later.";
  } else if (
    reason.includes("card") ||
    reason.includes("declined") ||
    reason.includes("issuer")
  ) {
    diagnosis = "Card payment was declined";
    recoveryProbability = 64;
    recommendedAction = "Send a recovery payment link";
    rationale =
      "The customer's card payment was declined. A fresh payment attempt may allow the customer to retry with the same or another payment method.";
  } else if (
    reason.includes("network") ||
    reason.includes("timeout") ||
    reason.includes("technical") ||
    reason.includes("server")
  ) {
    diagnosis = "Temporary payment processing failure";
    recoveryProbability = 86;
    recommendedAction =
      "Retry payment and send a recovery link if needed";
    rationale =
      "The failure appears technical or temporary rather than customer-driven, making another payment attempt highly recoverable.";
  } else if (
    reason.includes("authentication") ||
    reason.includes("otp") ||
    reason.includes("3d secure") ||
    reason.includes("3ds")
  ) {
    diagnosis = "Payment authentication failed";
    recoveryProbability = 71;
    recommendedAction = "Send a recovery payment link";
    rationale =
      "The payment could not complete its authentication step. A fresh payment attempt can allow the customer to complete authentication successfully.";
  } else if (
    reason.includes("expired") ||
    reason.includes("expiry")
  ) {
    diagnosis = "Payment attempt expired";
    recoveryProbability = 68;
    recommendedAction = "Send a new recovery payment link";
    rationale =
      "The original payment attempt is no longer usable. A fresh payment link provides a new opportunity to recover the transaction.";
  }

  const expectedRecoveryAmount = Math.round(
    amount * (recoveryProbability / 100)
  );

  return {
    diagnosis,
    recoveryProbability,
    recommendedAction,
    rationale,
    expectedRecoveryAmount,
  };
}