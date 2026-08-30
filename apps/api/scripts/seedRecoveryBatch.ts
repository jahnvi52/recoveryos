import { prisma } from "../src/db/prisma";

const FAILURE_REASONS = [
  "insufficient funds",
  "card declined",
  "issuer declined",
  "network timeout",
  "technical payment failure",
  "authentication failed",
  "OTP authentication failed",
  "payment expired",
];

const CUSTOMER_NAMES = [
  "Aarav Mehta",
  "Ananya Sharma",
  "Rohan Gupta",
  "Ishita Verma",
  "Kabir Singh",
  "Meera Kapoor",
  "Arjun Malhotra",
  "Diya Shah",
  "Vihaan Joshi",
  "Aditi Rao",
  "Rahul Bansal",
  "Sneha Patel",
  "Aditya Nair",
  "Kavya Iyer",
  "Dev Agarwal",
  "Tanya Mehta",
  "Karan Sethi",
  "Riya Khanna",
  "Nikhil Jain",
  "Priya Desai",
];

function randomItem<T>(
  items: T[]
): T {
  return items[
    Math.floor(
      Math.random() * items.length
    )
  ];
}

function randomAmount(): number {
  const amount =
    Math.floor(
      Math.random() * 195000
    ) + 5000;

  return Math.round(
    amount / 100
  ) * 100;
}

function calculateProbability(
  failureReason: string
): number {
  const reason =
    failureReason.toLowerCase();

  if (
    reason.includes("network") ||
    reason.includes("timeout") ||
    reason.includes("technical")
  ) {
    return 86;
  }

  if (
    reason.includes("insufficient") ||
    reason.includes("fund")
  ) {
    return 78;
  }

  if (
    reason.includes("authentication") ||
    reason.includes("otp")
  ) {
    return 71;
  }

  if (
    reason.includes("expired")
  ) {
    return 68;
  }

  if (
    reason.includes("card") ||
    reason.includes("declined") ||
    reason.includes("issuer")
  ) {
    return 64;
  }

  return 55;
}

function calculatePriority(
  amount: number,
  probability: number
): string {
  const expectedValue =
    amount *
    (probability / 100);

  if (
    expectedValue >= 100000 ||
    (amount >= 500000 &&
      probability >= 70)
  ) {
    return "HIGH";
  }

  if (
    expectedValue >= 25000 ||
    (amount >= 100000 &&
      probability >= 60)
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function calculateUrgency(
  amount: number,
  probability: number,
  failureReason: string
): string {
  const reason =
    failureReason.toLowerCase();

  if (
    reason.includes("network") ||
    reason.includes("timeout") ||
    reason.includes("technical") ||
    reason.includes("server")
  ) {
    return "URGENT";
  }

  const expectedValue =
    amount *
    (probability / 100);

  if (
    expectedValue >= 100000 ||
    probability >= 80
  ) {
    return "TODAY";
  }

  return "FRESH";
}

function calculateStrategy(
  failureReason: string
): string {
  const reason =
    failureReason.toLowerCase();

  if (
    reason.includes("network") ||
    reason.includes("timeout") ||
    reason.includes("technical")
  ) {
    return "Retry the transaction quickly. If the retry does not complete, provide a recovery payment link.";
  }

  if (
    reason.includes("insufficient") ||
    reason.includes("fund")
  ) {
    return "Wait for a better payment opportunity and send a fresh payment link so the customer can retry the transaction.";
  }

  if (
    reason.includes("authentication") ||
    reason.includes("otp")
  ) {
    return "Create a fresh payment attempt and allow the customer to complete the authentication flow again.";
  }

  if (
    reason.includes("expired")
  ) {
    return "Create a new time-bound payment link and give the customer a fresh checkout opportunity.";
  }

  return "Provide a fresh payment link that allows the customer to retry or choose another available payment method.";
}

async function main() {
  console.log(
    "🚀 RecoveryOS: Creating 500 demo revenue-risk opportunities..."
  );

  /*
   * -------------------------------------------------------
   * 1. REMOVE PREVIOUS DEMO BATCH
   * -------------------------------------------------------
   *
   * Only records marked with the DEMO-BATCH prefix
   * are removed.
   *
   * Existing real/test opportunities remain untouched.
   */

  const existingDemoEvents =
    await prisma.recoveryAuditEvent.findMany({
      where: {
        metadata: {
          contains:
            '"batch":"DEMO-BATCH"',
        },
      },

      select: {
        opportunityId: true,
      },
    });

  const demoOpportunityIds =
    Array.from(
      new Set(
        existingDemoEvents.map(
          (event) =>
            event.opportunityId
        )
      )
    );

  if (
    demoOpportunityIds.length > 0
  ) {
    await prisma.recoveryAuditEvent.deleteMany({
      where: {
        opportunityId: {
          in: demoOpportunityIds,
        },
      },
    });

    await prisma.recoveryOpportunity.deleteMany({
      where: {
        id: {
          in: demoOpportunityIds,
        },
      },
    });

    console.log(
      `🧹 Removed ${demoOpportunityIds.length} previous demo opportunities.`
    );
  }

  /*
   * -------------------------------------------------------
   * 2. CREATE 500 OPPORTUNITIES
   * -------------------------------------------------------
   */

  const opportunities = [];

  for (
    let index = 0;
    index < 500;
    index++
  ) {
    const customerName =
      randomItem(
        CUSTOMER_NAMES
      );

    const failureReason =
      randomItem(
        FAILURE_REASONS
      );

    const amount =
      randomAmount();

    const probability =
      calculateProbability(
        failureReason
      );

    const priority =
      calculatePriority(
        amount,
        probability
      );

    const urgency =
      calculateUrgency(
        amount,
        probability,
        failureReason
      );

    const expectedRecoveryAmount =
      Math.round(
        amount *
          (probability / 100)
      );

    const recoveryStrategy =
      calculateStrategy(
        failureReason
      );

    const customerNumber =
      String(index + 1).padStart(
        3,
        "0"
      );

    opportunities.push({
      customerName:
        `${customerName} ${customerNumber}`,

      customerEmail:
        `demo-${index + 1}@recoveryos.test`,

      customerContact:
        `90000${String(
          10000 + index
        )}`,

      amount,

      currency: "INR",

      originalPaymentId:
        `demo_payment_${index + 1}`,

      failureReason,

      recoveryProbability:
        probability,

      recommendedAction:
        "Send a recovery payment link",

      priority,

      urgency,

      recoveryStrategy,

      status:
        "AT_RISK",
    });

    /*
     * Print progress every 100 records.
     */

    if (
      (index + 1) % 100 ===
      0
    ) {
      console.log(
        `   Created ${index + 1}/500...`
      );
    }
  }

  /*
   * -------------------------------------------------------
   * 3. INSERT IN BATCHES
   * -------------------------------------------------------
   */

  const batchSize = 100;

  for (
    let start = 0;
    start <
    opportunities.length;
    start += batchSize
  ) {
    const batch =
      opportunities.slice(
        start,
        start + batchSize
      );

    await prisma.recoveryOpportunity.createMany({
      data: batch,
    });
  }

  /*
   * -------------------------------------------------------
   * 4. VERIFY
   * -------------------------------------------------------
   */

  const createdCount =
    await prisma.recoveryOpportunity.count({
      where: {
        customerEmail: {
          contains:
            "@recoveryos.test",
        },
      },
    });

  /*
   * -------------------------------------------------------
   * 5. CALCULATE DEMO TOTALS
   * -------------------------------------------------------
   */

  const demoOpportunities =
    await prisma.recoveryOpportunity.findMany({
      where: {
        customerEmail: {
          contains:
            "@recoveryos.test",
        },
      },

      select: {
        amount: true,
        recoveryProbability: true,
      },
    });

  const revenueAtRisk =
    demoOpportunities.reduce(
      (total, opportunity) =>
        total + opportunity.amount,
      0
    );

  const predictedRecovery =
    demoOpportunities.reduce(
      (total, opportunity) =>
        total +
        Math.round(
          opportunity.amount *
            ((opportunity.recoveryProbability ??
              0) /
              100)
        ),
      0
    );

  console.log("");
  console.log(
    "🎯 RecoveryOS demo batch created."
  );
  console.log("");
  console.log(
    `Opportunities: ${createdCount}`
  );
  console.log(
    `Revenue at risk: ₹${revenueAtRisk.toLocaleString(
      "en-IN"
    )}`
  );
  console.log(
    `Predicted recovery: ₹${predictedRecovery.toLocaleString(
      "en-IN"
    )}`
  );
  console.log("");
  console.log(
    "⚠️ No Razorpay API calls were made."
  );
  console.log(
    "⚠️ No payment links were created."
  );
}

main()
  .catch((error) => {
    console.error(
      "❌ Demo batch creation failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });