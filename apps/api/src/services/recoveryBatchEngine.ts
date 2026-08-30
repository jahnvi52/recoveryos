import { prisma } from "../db/prisma";
import { analyzeRecovery } from "./recoveryEngine";
import { decideRecoveryAction } from "./recoveryDecisionEngine";
import { evaluateRecoveryGuardrails } from "./recoveryGuardrails";
import { recordRecoveryAuditEvent } from "./recoveryAudit";
import { recordRecoveryEvaluation } from "./recoveryEvaluation";

export type BatchRecoveryResult = {
  batchId: string;

  processed: number;

  recoverable: number;

  autoEligible: number;

  humanApproval: number;

  suppressed: number;

  stopped: number;

  revenueAtRisk: number;

  predictedRecovery: number;

  simulatedActualRecovery: number;

  recoveryRate: number;

  averageRecoveryProbability: number;

  opportunities: {
    id: string;

    customerName: string;

    amount: number;

    recoveryProbability: number;

    expectedRecoveryAmount: number;

    simulatedActualRecovery: number;

    predictionError: number;

    outcome: string;

    priority: string;

    urgency: string;

    nextBestAction: string;

    executionMode: string;

    guardrailDecision: string;

    status: string;
  }[];
};

/**
 * RecoveryOS Batch Recovery Engine
 *
 * Evaluation now distinguishes between:
 *
 * 1. REAL RECOVERY
 *    A Razorpay webhook has confirmed payment.
 *
 * 2. SIMULATED RECOVERY
 *    The opportunity has not actually recovered yet,
 *    so deterministic simulation is used for evaluation.
 *
 * This keeps batch evaluation useful while making
 * confirmed recovery numbers truthful.
 */
export async function evaluateRecoveryBatch(
  limit = 500
): Promise<BatchRecoveryResult> {
  /*
   * -------------------------------------------------------
   * 1. CREATE BATCH ID
   * -------------------------------------------------------
   */

  const batchId = `BATCH-${Date.now()}`;

  /*
   * -------------------------------------------------------
   * 2. LOAD OPPORTUNITIES
   * -------------------------------------------------------
   *
   * IMPORTANT:
   *
   * We now include RECOVERED opportunities so that
   * confirmed Razorpay outcomes can be compared against
   * the AI prediction.
   */

  const opportunities =
    await prisma.recoveryOpportunity.findMany({
      orderBy: {
        createdAt: "asc",
      },

      take: Math.min(
        Math.max(limit, 1),
        500
      ),

      include: {
        auditEvents: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

  /*
   * -------------------------------------------------------
   * 3. AGGREGATE METRICS
   * -------------------------------------------------------
   */

  let recoverable = 0;

  let autoEligible = 0;

  let humanApproval = 0;

  let suppressed = 0;

  let stopped = 0;

  let revenueAtRisk = 0;

  let predictedRecovery = 0;

  let totalActualRecovery = 0;

  let totalRecoveryProbability = 0;

  /*
   * -------------------------------------------------------
   * 4. INDIVIDUAL RESULTS
   * -------------------------------------------------------
   */

  const results: BatchRecoveryResult["opportunities"] =
    [];

  /*
   * -------------------------------------------------------
   * 5. PROCESS EVERY OPPORTUNITY
   * -------------------------------------------------------
   */

  for (const opportunity of opportunities) {
    /*
     * ---------------------------------------------------
     * REVENUE AT RISK
     * ---------------------------------------------------
     *
     * Only open revenue remains at risk.
     */

    if (
      opportunity.status !==
      "RECOVERED"
    ) {
      revenueAtRisk +=
        opportunity.amount;
    }

    /*
     * ---------------------------------------------------
     * AI DIAGNOSIS
     * ---------------------------------------------------
     */

    const decision =
      analyzeRecovery({
        amount:
          opportunity.amount,

        failureReason:
          opportunity.failureReason,

        customer: {
          name:
            opportunity.customerName,

          email:
            opportunity.customerEmail ??
            undefined,

          contact:
            opportunity.customerContact ??
            undefined,
        },
      });

    /*
     * ---------------------------------------------------
     * NEXT-BEST ACTION
     * ---------------------------------------------------
     */

    const agentDecision =
      decideRecoveryAction({
        amount:
          opportunity.amount,

        status:
          opportunity.status,

        paymentLinkExists:
          Boolean(
            opportunity.paymentLinkId &&
              opportunity.paymentLinkUrl
          ),

        decision,
      });

    /*
     * ---------------------------------------------------
     * GUARDRAILS
     * ---------------------------------------------------
     */

    const guardrailResult =
      await evaluateRecoveryGuardrails(
        opportunity.id
      );

    /*
     * ---------------------------------------------------
     * CLASSIFY OPPORTUNITY
     * ---------------------------------------------------
     */

    if (
      guardrailResult.decision ===
      "ALLOW_AUTO"
    ) {
      autoEligible++;

      if (
        opportunity.status !==
        "RECOVERED"
      ) {
        recoverable++;
      }
    } else if (
      guardrailResult.decision ===
      "REQUIRE_HUMAN"
    ) {
      humanApproval++;

      if (
        opportunity.status !==
        "RECOVERED"
      ) {
        recoverable++;
      }
    } else if (
      guardrailResult.decision ===
      "SUPPRESS"
    ) {
      suppressed++;
    } else if (
      guardrailResult.decision ===
      "STOP"
    ) {
      stopped++;
    }

    /*
     * ---------------------------------------------------
     * AI PREDICTION
     * ---------------------------------------------------
     */

    const recoveryProbability =
      decision.recoveryProbability;

    const expectedRecoveryAmount =
      decision.expectedRecoveryAmount;

    totalRecoveryProbability +=
      recoveryProbability;

    predictedRecovery +=
      expectedRecoveryAmount;

    /*
     * ---------------------------------------------------
     * FIND REAL RECOVERY
     * ---------------------------------------------------
     *
     * The webhook writes:
     *
     * eventType = RECOVERED
     * actualAmount = actual Razorpay payment
     *
     * Therefore this is the source of truth.
     */

    const recoveredAuditEvent =
      opportunity.auditEvents.find(
        (event) =>
          event.eventType ===
          "RECOVERED"
      );

    const hasRealRecovery =
      opportunity.status ===
        "RECOVERED" &&
      Boolean(
        recoveredAuditEvent
      );

    /*
     * ---------------------------------------------------
     * ACTUAL RECOVERY
     * ---------------------------------------------------
     */

    let actualRecoveryForOpportunity =
      0;

    let outcome =
      "NOT_RECOVERED";

    let isSimulated =
      true;

    if (hasRealRecovery) {
      /*
       * REAL RAZORPAY OUTCOME
       */

      actualRecoveryForOpportunity =
        recoveredAuditEvent
          ?.actualAmount ??
        0;

      outcome =
        actualRecoveryForOpportunity >
        0
          ? "RECOVERED"
          : "NOT_RECOVERED";

      isSimulated = false;
    } else {
      /*
       * -------------------------------------------------
       * DETERMINISTIC SIMULATION
       * -------------------------------------------------
       *
       * Only used when there is no confirmed
       * Razorpay recovery yet.
       */

      let outcomeFactor =
        0.82;

      if (
        guardrailResult.decision ===
        "ALLOW_AUTO"
      ) {
        outcomeFactor =
          0.90;
      }

      if (
        guardrailResult.decision ===
        "REQUIRE_HUMAN"
      ) {
        outcomeFactor =
          0.76;
      }

      if (
        guardrailResult.decision ===
        "SUPPRESS"
      ) {
        outcomeFactor =
          0;
      }

      if (
        guardrailResult.decision ===
        "STOP"
      ) {
        outcomeFactor =
          0;
      }

      actualRecoveryForOpportunity =
        Math.round(
          expectedRecoveryAmount *
            outcomeFactor
        );

      outcome =
        actualRecoveryForOpportunity >
        0
          ? "RECOVERED"
          : "NOT_RECOVERED";
    }

    /*
     * ---------------------------------------------------
     * PREDICTION ERROR
     * ---------------------------------------------------
     *
     * Positive:
     * AI predicted more than actual.
     *
     * Negative:
     * AI predicted less than actual.
     */

    const predictionError =
      expectedRecoveryAmount -
      actualRecoveryForOpportunity;

    /*
     * ---------------------------------------------------
     * SAVE EVALUATION
     * ---------------------------------------------------
     *
     * Real recoveries are recorded as actual.
     * Open opportunities retain simulated evaluation.
     */

    await recordRecoveryEvaluation({
      opportunityId:
        opportunity.id,

      batchId,

      actualRecoveryAmount:
        actualRecoveryForOpportunity,

      
    });

    /*
     * ---------------------------------------------------
     * AUDIT ONLY SIMULATED OUTCOMES
     * ---------------------------------------------------
     *
     * Real RECOVERED events are already written by
     * the Razorpay webhook.
     */

    if (isSimulated) {
      await recordRecoveryAuditEvent({
        opportunityId:
          opportunity.id,

        eventType:
          "BATCH_OUTCOME_SIMULATED",

        action:
          agentDecision.nextBestAction,

        executionMode:
          "EVALUATION",

        reason:
          `RecoveryOS simulated an outcome of ₹${actualRecoveryForOpportunity.toLocaleString(
            "en-IN"
          )} against predicted recovery of ₹${expectedRecoveryAmount.toLocaleString(
            "en-IN"
          )}.`,

        expectedAmount:
          expectedRecoveryAmount,

        actualAmount:
          actualRecoveryForOpportunity,

        metadata: {
          batchId,

          outcome,

          predictionError,

          guardrailDecision:
            guardrailResult.decision,

          recoveryProbability,

          source:
            "SIMULATION",
        },
      });
    }

    /*
     * ---------------------------------------------------
     * UPDATE ACTUAL RECOVERY
     * ---------------------------------------------------
     */

    totalActualRecovery +=
      actualRecoveryForOpportunity;

    /*
     * ---------------------------------------------------
     * STORE RESULT
     * ---------------------------------------------------
     */

    results.push({
      id:
        opportunity.id,

      customerName:
        opportunity.customerName,

      amount:
        opportunity.amount,

      recoveryProbability,

      expectedRecoveryAmount,

      simulatedActualRecovery:
        actualRecoveryForOpportunity,

      predictionError,

      outcome,

      priority:
        decision.priority,

      urgency:
        decision.urgency,

      nextBestAction:
        agentDecision.nextBestAction,

      executionMode:
        hasRealRecovery
          ? "REAL"
          : agentDecision.executionMode,

      guardrailDecision:
        guardrailResult.decision,

      status:
        opportunity.status,
    });
  }

  /*
   * -------------------------------------------------------
   * 6. FINAL BATCH METRICS
   * -------------------------------------------------------
   */

  const processed =
    opportunities.length;

  const averageRecoveryProbability =
    processed > 0
      ? Number(
          (
            totalRecoveryProbability /
            processed
          ).toFixed(2)
        )
      : 0;

  /*
   * -------------------------------------------------------
   * PREDICTED VS ACTUAL
   * -------------------------------------------------------
   *
   * This is now:
   *
   * actual recovered / predicted recovery
   *
   * where actual includes confirmed Razorpay
   * recoveries.
   */

  const recoveryRate =
    predictedRecovery > 0
      ? Number(
          (
            (totalActualRecovery /
              predictedRecovery) *
            100
          ).toFixed(2)
        )
      : 0;

  /*
   * -------------------------------------------------------
   * 7. RANK OPPORTUNITIES
   * -------------------------------------------------------
   */

  results.sort(
    (a, b) =>
      b.expectedRecoveryAmount -
      a.expectedRecoveryAmount
  );

  /*
   * -------------------------------------------------------
   * 8. RETURN RESULT
   * -------------------------------------------------------
   */

  return {
    batchId,

    processed,

    recoverable,

    autoEligible,

    humanApproval,

    suppressed,

    stopped,

    revenueAtRisk,

    predictedRecovery,

    simulatedActualRecovery:
      totalActualRecovery,

    recoveryRate,

    averageRecoveryProbability,

    opportunities:
      results,
  };
}