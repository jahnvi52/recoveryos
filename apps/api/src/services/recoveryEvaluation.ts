import { prisma } from "../db/prisma";

export type RecoveryOutcome =
  | "RECOVERED"
  | "NOT_RECOVERED"
  | "PENDING";

export type RecoveryEvaluationResult = {
  opportunityId: string;
  batchId: string;

  predictedRecoveryAmount: number;
  actualRecoveryAmount: number;

  recoveryProbability: number;

  outcome: RecoveryOutcome;

  predictionError: number;
};

export async function recordRecoveryEvaluation(
  input: {
    opportunityId: string;

    batchId: string;

    actualRecoveryAmount?: number;

    outcome?: RecoveryOutcome;
  }
): Promise<RecoveryEvaluationResult> {
  /*
   * -------------------------------------------------------
   * 1. LOAD OPPORTUNITY
   * -------------------------------------------------------
   */

  const opportunity =
    await prisma.recoveryOpportunity.findUnique({
      where: {
        id: input.opportunityId,
      },
    });

  if (!opportunity) {
    throw new Error(
      "Recovery opportunity not found"
    );
  }

  /*
   * -------------------------------------------------------
   * 2. CALCULATE PREDICTION
   * -------------------------------------------------------
   */

  const recoveryProbability =
    opportunity.recoveryProbability ?? 0;

  const predictedRecoveryAmount =
    Math.round(
      opportunity.amount *
        (recoveryProbability / 100)
    );

  /*
   * -------------------------------------------------------
   * 3. ACTUAL RECOVERY
   * -------------------------------------------------------
   */

  const actualRecoveryAmount =
    Math.max(
      0,
      Math.round(
        input.actualRecoveryAmount ?? 0
      )
    );

  /*
   * -------------------------------------------------------
   * 4. DETERMINE OUTCOME
   * -------------------------------------------------------
   */

  let outcome: RecoveryOutcome;

  if (input.outcome) {
    outcome = input.outcome;
  } else if (
    opportunity.status ===
      "RECOVERED" ||
    actualRecoveryAmount > 0
  ) {
    outcome = "RECOVERED";
  } else {
    outcome = "PENDING";
  }

  /*
   * -------------------------------------------------------
   * 5. PREDICTION ERROR
   *
   * Positive:
   * AI predicted more than actual.
   *
   * Negative:
   * AI predicted less than actual.
   * -------------------------------------------------------
   */

  const predictionError =
    predictedRecoveryAmount -
    actualRecoveryAmount;

  /*
   * -------------------------------------------------------
   * 6. SAVE EVALUATION
   * -------------------------------------------------------
   */

  await prisma.recoveryEvaluation.create({
    data: {
      opportunityId:
        opportunity.id,

      batchId:
        input.batchId,

      predictedRecoveryAmount,

      actualRecoveryAmount,

      recoveryProbability,

      outcome,

      predictionError,
    },
  });

  /*
   * -------------------------------------------------------
   * 7. AUDIT
   * -------------------------------------------------------
   */

  await prisma.recoveryAuditEvent.create({
    data: {
      opportunityId:
        opportunity.id,

      eventType:
        "OUTCOME_EVALUATED",

      action:
        "MEASURE_RECOVERY",

      executionMode:
        "EVALUATION",

      reason:
        `RecoveryOS compared predicted recovery of ₹${predictedRecoveryAmount.toLocaleString(
          "en-IN"
        )} against actual recovery of ₹${actualRecoveryAmount.toLocaleString(
          "en-IN"
        )}.`,

      expectedAmount:
        predictedRecoveryAmount,

      actualAmount:
        actualRecoveryAmount,

      metadata:
        JSON.stringify({
          batchId:
            input.batchId,

          recoveryProbability,

          outcome,

          predictionError,
        }),
    },
  });

  /*
   * -------------------------------------------------------
   * 8. RETURN
   * -------------------------------------------------------
   */

  return {
    opportunityId:
      opportunity.id,

    batchId:
      input.batchId,

    predictedRecoveryAmount,

    actualRecoveryAmount,

    recoveryProbability,

    outcome,

    predictionError,
  };
}

/**
 * Calculate aggregate recovery performance
 * for a batch.
 */
export async function getRecoveryEvaluationMetrics(
  batchId: string
) {
  const evaluations =
    await prisma.recoveryEvaluation.findMany({
      where: {
        batchId,
      },
    });

  const totalPredicted =
    evaluations.reduce(
      (total, evaluation) =>
        total +
        evaluation.predictedRecoveryAmount,
      0
    );

  const totalActual =
    evaluations.reduce(
      (total, evaluation) =>
        total +
        evaluation.actualRecoveryAmount,
      0
    );

  const recoveredCount =
    evaluations.filter(
      (evaluation) =>
        evaluation.outcome ===
        "RECOVERED"
    ).length;

  const pendingCount =
    evaluations.filter(
      (evaluation) =>
        evaluation.outcome ===
        "PENDING"
    ).length;

  const notRecoveredCount =
    evaluations.filter(
      (evaluation) =>
        evaluation.outcome ===
        "NOT_RECOVERED"
    ).length;

  const predictionError =
    totalPredicted -
    totalActual;

  /*
   * Recovery rate is actual money recovered
   * divided by revenue that the AI expected to recover.
   */

  const recoveryRate =
    totalPredicted > 0
      ? Number(
          (
            (totalActual /
              totalPredicted) *
            100
          ).toFixed(2)
        )
      : 0;

  /*
   * Mean absolute prediction error.
   */

  const meanAbsoluteError =
    evaluations.length > 0
      ? Number(
          (
            evaluations.reduce(
              (total, evaluation) =>
                total +
                Math.abs(
                  evaluation.predictionError
                ),
              0
            ) /
            evaluations.length
          ).toFixed(2)
        )
      : 0;

  return {
    batchId,

    evaluated:
      evaluations.length,

    recovered:
      recoveredCount,

    pending:
      pendingCount,

    notRecovered:
      notRecoveredCount,

    totalPredicted,

    totalActual,

    predictionError,

    recoveryRate,

    meanAbsoluteError,
  };
}