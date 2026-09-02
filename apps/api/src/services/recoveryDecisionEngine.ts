import {
  RecoveryDecision,
  RecoveryPriority,
  RecoveryUrgency,
} from "./recoveryEngine";

export type RecoveryAction =
  | "SEND_PAYMENT_LINK"
  | "RETRY_PAYMENT"
  | "WAIT_AND_RETRY"
  | "ESCALATE_HUMAN"
  | "SUPPRESS";

export type ExecutionMode =
  | "AUTO"
  | "APPROVAL_REQUIRED"
  | "BLOCKED";

export type RecoveryGuardrails = {
  minRecoveryProbability: number;
  minExpectedRecoveryAmount: number;
  humanApprovalAmount: number;
  autoExecuteMaxAmount: number;
};

export type RecoveryDecisionInput = {
  amount: number;

  status?: string | null;

  paymentLinkExists?: boolean;

  decision: RecoveryDecision;
};

export type AgentDecision = {
  nextBestAction: RecoveryAction;

  executionMode: ExecutionMode;

  confidence: number;

  expectedRecoveryAmount: number;

  score: number;

  priority: RecoveryPriority;

  urgency: RecoveryUrgency;

  explanation: string;

  guardrails: {
    allowed: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      reason: string;
    }>;
  };

  candidates: Array<{
    action: RecoveryAction;
    score: number;
    reason: string;
  }>;
};

const DEFAULT_GUARDRAILS: RecoveryGuardrails = {
  /*
   * Minimum probability at which RecoveryOS considers
   * an opportunity worth actively pursuing.
   */
  minRecoveryProbability: 60,

  /*
   * Avoid spending operational effort on extremely
   * small expected-value opportunities.
   */
  minExpectedRecoveryAmount: 50_000,

  /*
   * High-value recoveries receive human oversight.
   */
  humanApprovalAmount: 10_000_000,

  /*
   * Automatic execution is capped independently from
   * the human-approval threshold.
   */
  autoExecuteMaxAmount: 10_000_000,
};

function clamp(
  value: number,
  min: number,
  max: number
) {
  return Math.min(
    Math.max(value, min),
    max
  );
}

function priorityWeight(
  priority: RecoveryPriority
) {
  switch (priority) {
    case "HIGH":
      return 1;

    case "MEDIUM":
      return 0.65;

    case "LOW":
      return 0.3;
  }
}

function urgencyWeight(
  urgency: RecoveryUrgency
) {
  switch (urgency) {
    case "URGENT":
      return 1;

    case "TODAY":
      return 0.75;

    case "FRESH":
      return 0.4;
  }
}

function calculateConfidence(
  decision: RecoveryDecision
) {
  const probabilityScore =
    decision.recoveryProbability / 100;

  const valueScore = clamp(
    decision.expectedRecoveryAmount /
      100000,
    0,
    1
  );

  const priorityScore =
    priorityWeight(decision.priority);

  const urgencyScore =
    urgencyWeight(decision.urgency);

  /*
   * Confidence is deliberately explainable.
   *
   * It is influenced by:
   * - recovery probability
   * - economic value
   * - AI priority
   * - urgency
   */
  const confidence =
    probabilityScore * 0.5 +
    valueScore * 0.15 +
    priorityScore * 0.2 +
    urgencyScore * 0.15;

  return Number(
    clamp(confidence, 0, 1).toFixed(2)
  );
}

function buildCandidates(
  input: RecoveryDecisionInput
) {
  const {
    amount,
    paymentLinkExists,
    decision,
  } = input;

  const probability =
    decision.recoveryProbability;

  const expectedValue =
    decision.expectedRecoveryAmount;

  const candidates: AgentDecision["candidates"] =
    [];

  /*
   * ----------------------------------------------------
   * SEND PAYMENT LINK
   * ----------------------------------------------------
   */

  if (!paymentLinkExists) {
    let score =
      probability * 0.55 +
      priorityWeight(
        decision.priority
      ) * 25 +
      urgencyWeight(
        decision.urgency
      ) * 20;

    if (expectedValue >= 50_000) {
      score += 10;
    }

    candidates.push({
      action: "SEND_PAYMENT_LINK",
      score: Number(score.toFixed(2)),
      reason:
        "A fresh payment attempt is the strongest available recovery path for this failure.",
    });
  } else {
    candidates.push({
      action: "SEND_PAYMENT_LINK",
      score: 0,
      reason:
        "A recovery payment link already exists, so RecoveryOS avoids creating another one.",
    });
  }

  /*
   * ----------------------------------------------------
   * RETRY PAYMENT
   * ----------------------------------------------------
   *
   * Technical failures are especially suitable for
   * immediate retry.
   */

  if (
    decision.diagnosis
      .toLowerCase()
      .includes("temporary") ||
    decision.urgency === "URGENT"
  ) {
    candidates.push({
      action: "RETRY_PAYMENT",
      score:
        probability * 0.65 +
        urgencyWeight(
          decision.urgency
        ) *
          35,
      reason:
        "The failure pattern suggests another payment attempt may succeed quickly.",
    });
  } else {
    candidates.push({
      action: "RETRY_PAYMENT",
      score:
        probability * 0.25,
      reason:
        "Retry remains possible but is less suitable than the recommended recovery path.",
    });
  }

  /*
   * ----------------------------------------------------
   * WAIT AND RETRY
   * ----------------------------------------------------
   *
   * Particularly useful for insufficient-funds cases.
   */

  if (
    decision.diagnosis
      .toLowerCase()
      .includes("insufficient")
  ) {
    candidates.push({
      action: "WAIT_AND_RETRY",
      score:
        probability * 0.45 +
        (decision.urgency === "FRESH"
          ? 20
          : 0),
      reason:
        "Insufficient-funds failures can benefit from a later retry when customer balance conditions may have changed.",
    });
  } else {
    candidates.push({
      action: "WAIT_AND_RETRY",
      score:
        probability * 0.2,
      reason:
        "Waiting is available but does not match the current failure pattern as strongly.",
    });
  }

  /*
   * ----------------------------------------------------
   * HUMAN ESCALATION
   * ----------------------------------------------------
   */

  if (amount >= 10_000_000) {
    candidates.push({
      action: "ESCALATE_HUMAN",
      score:
        60 +
        probability * 0.25,
      reason:
        "The opportunity is high-value enough to justify human oversight.",
    });
  } else {
    candidates.push({
      action: "ESCALATE_HUMAN",
      score:
        20 +
        probability * 0.1,
      reason:
        "Human escalation remains available but is not preferred for this opportunity value.",
    });
  }

  /*
   * ----------------------------------------------------
   * SUPPRESS
   * ----------------------------------------------------
   */

  if (
    probability < 60 ||
    expectedValue < 50_000
  ) {
    candidates.push({
      action: "SUPPRESS",
      score: 90,
      reason:
        "The expected economic return does not justify an active recovery intervention.",
    });
  } else {
    candidates.push({
      action: "SUPPRESS",
      score: 5,
      reason:
        "The opportunity is economically viable, so suppression is not preferred.",
    });
  }

  return candidates.map(
    (candidate) => ({
      ...candidate,
      score: Number(
        candidate.score.toFixed(2)
      ),
    })
  );
}

export function decideRecoveryAction(
  input: RecoveryDecisionInput,
  guardrails: RecoveryGuardrails =
    DEFAULT_GUARDRAILS
): AgentDecision {
  const {
    amount,
    status,
    paymentLinkExists,
    decision,
  } = input;

  /*
   * ----------------------------------------------------
   * 1. CALCULATE EXPECTED VALUE
   * ----------------------------------------------------
   */

  const expectedRecoveryAmount =
    decision.expectedRecoveryAmount;

  /*
   * ----------------------------------------------------
   * 2. BUILD ACTION CANDIDATES
   * ----------------------------------------------------
   */

  const candidates =
    buildCandidates(input);

  /*
   * Highest-scoring action becomes the initial
   * next-best action.
   */

  candidates.sort(
    (a, b) =>
      b.score - a.score
  );

  let nextBestAction =
    candidates[0].action;

  /*
   * Existing payment link means we should never create
   * another link automatically.
   */

  if (
    nextBestAction ===
      "SEND_PAYMENT_LINK" &&
    paymentLinkExists
  ) {
    nextBestAction =
      decision.urgency === "URGENT"
        ? "RETRY_PAYMENT"
        : "WAIT_AND_RETRY";
  }

  /*
   * ----------------------------------------------------
   * 3. GUARDRAIL CHECKS
   * ----------------------------------------------------
   */

  const checks: AgentDecision["guardrails"]["checks"] =
    [];

  const probabilityPassed =
    decision.recoveryProbability >=
    guardrails.minRecoveryProbability;

  checks.push({
    name:
      "Minimum recovery probability",
    passed:
      probabilityPassed,
    reason: probabilityPassed
      ? `${decision.recoveryProbability}% is above the ${guardrails.minRecoveryProbability}% minimum.`
      : `${decision.recoveryProbability}% is below the ${guardrails.minRecoveryProbability}% minimum.`,
  });

  const valuePassed =
    expectedRecoveryAmount >=
    guardrails.minExpectedRecoveryAmount;

  checks.push({
    name:
      "Minimum expected recovery",
    passed:
      valuePassed,
    reason: valuePassed
      ? `₹${expectedRecoveryAmount.toLocaleString("en-IN")} expected recovery clears the ₹${guardrails.minExpectedRecoveryAmount.toLocaleString("en-IN")} minimum.`
      : `₹${expectedRecoveryAmount.toLocaleString("en-IN")} expected recovery is below the minimum.`,
  });

  const statusPassed =
    status !== "RECOVERED";

  checks.push({
    name:
      "Recovery still open",
    passed:
      statusPassed,
    reason: statusPassed
      ? "The opportunity is still eligible for recovery."
      : "The opportunity has already been recovered.",
  });

  const duplicateLinkPassed =
    !(
      nextBestAction ===
        "SEND_PAYMENT_LINK" &&
      paymentLinkExists
    );

  checks.push({
    name:
      "Duplicate payment-link protection",
    passed:
      duplicateLinkPassed,
    reason: duplicateLinkPassed
      ? "No duplicate recovery payment link will be created."
      : "A recovery payment link already exists.",
  });

  /*
   * ----------------------------------------------------
   * 4. DETERMINE EXECUTION MODE
   * ----------------------------------------------------
   */

  let executionMode: ExecutionMode =
    "AUTO";

  let allowed = true;

  if (!statusPassed) {
    executionMode = "BLOCKED";
    allowed = false;
  }

  if (!probabilityPassed) {
    nextBestAction = "SUPPRESS";
    executionMode = "BLOCKED";
    allowed = false;
  }

  if (!valuePassed) {
    nextBestAction = "SUPPRESS";
    executionMode = "BLOCKED";
    allowed = false;
  }

  /*
   * High-value recovery requires human approval.
   */

  if (
    allowed &&
    amount >=
      guardrails.humanApprovalAmount
  ) {
    nextBestAction =
      "ESCALATE_HUMAN";

    executionMode =
      "APPROVAL_REQUIRED";
  }

  /*
   * Automatic execution must stay below the
   * merchant's configured maximum.
   */

  if (
    allowed &&
    amount >
      guardrails.autoExecuteMaxAmount
  ) {
    nextBestAction =
      "ESCALATE_HUMAN";

    executionMode =
      "APPROVAL_REQUIRED";
  }

  /*
   * Existing payment links can never trigger another
   * link creation.
   */

  if (
    allowed &&
    nextBestAction ===
      "SEND_PAYMENT_LINK" &&
    paymentLinkExists
  ) {
    nextBestAction =
      "WAIT_AND_RETRY";
  }

  /*
   * ----------------------------------------------------
   * 5. CONFIDENCE
   * ----------------------------------------------------
   */

  const confidence =
    calculateConfidence(
      decision
    );

  /*
   * ----------------------------------------------------
   * 6. EXPLANATION
   * ----------------------------------------------------
   */

  let explanation =
    `RecoveryOS selected ${nextBestAction} because the opportunity has ${decision.recoveryProbability}% recovery probability and ₹${expectedRecoveryAmount.toLocaleString("en-IN")} expected recovery value.`;

  if (
    nextBestAction ===
    "ESCALATE_HUMAN"
  ) {
    explanation +=
      " The opportunity exceeds the automatic execution threshold, so human approval is required.";
  }

  if (
    nextBestAction ===
    "SUPPRESS"
  ) {
    explanation +=
      " Recovery is suppressed because the opportunity does not clear the configured economic guardrails.";
  }

  if (
    nextBestAction ===
    "WAIT_AND_RETRY"
  ) {
    explanation +=
      " The failure pattern suggests waiting can improve the chance of a successful retry.";
  }

  if (
    nextBestAction ===
    "RETRY_PAYMENT"
  ) {
    explanation +=
      " The failure pattern suggests another payment attempt may succeed without creating a new recovery link.";
  }

  if (
    nextBestAction ===
    "SEND_PAYMENT_LINK"
  ) {
    explanation +=
      " A fresh payment path is the best available intervention.";
  }

  return {
    nextBestAction,

    executionMode,

    confidence,

    expectedRecoveryAmount,

    score:
      candidates.find(
        (candidate) =>
          candidate.action ===
          nextBestAction
      )?.score ?? 0,

    priority:
      decision.priority,

    urgency:
      decision.urgency,

    explanation,

    guardrails: {
      allowed,
      checks,
    },

    candidates,
  };
}