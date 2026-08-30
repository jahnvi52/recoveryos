import { prisma } from "../src/db/prisma";
import { analyzeRecovery } from "../src/services/recoveryEngine";

async function main() {
  console.log(
    "🤖 RecoveryOS: Backfilling AI recovery intelligence..."
  );

  const opportunities =
    await prisma.recoveryOpportunity.findMany({
      where: {
        status: {
          not: "RECOVERED",
        },

        OR: [
          {
            priority: null,
          },
          {
            urgency: null,
          },
          {
            recoveryStrategy: null,
          },
        ],
      },
    });

  console.log(
    `Found ${opportunities.length} opportunities requiring AI intelligence.`
  );

  let updated = 0;

  for (const opportunity of opportunities) {
    const decision = analyzeRecovery({
      amount: opportunity.amount,

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

    await prisma.recoveryOpportunity.update({
      where: {
        id: opportunity.id,
      },

      data: {
        priority:
          decision.priority,

        urgency:
          decision.urgency,

        recoveryStrategy:
          decision.recoveryStrategy,
      },
    });

    updated++;

    console.log(
      `✅ ${opportunity.customerName}:`,
      `${decision.priority} /`,
      `${decision.urgency}`
    );
  }

  console.log(
    `\n🎯 RecoveryOS backfill complete. Updated ${updated} opportunities.`
  );
}

main()
  .catch((error) => {
    console.error(
      "❌ RecoveryOS backfill failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });