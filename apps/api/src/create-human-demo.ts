import { prisma } from "./db/prisma";

async function main() {
  const opportunity =
    await prisma.recoveryOpportunity.create({
      data: {
        customerName: "Enterprise Demo",
        customerEmail:
          "enterprise-demo@recoveryos.test",
        customerContact: "+91 9000000000",

        // ₹1,50,000 = 15,000,000 paise
        amount: 15_000_000,

        currency: "INR",

        originalPaymentId:
          `demo_high_value_${Date.now()}`,

        failureReason:
          "Payment attempt expired",

        recoveryProbability: 82,

        recommendedAction:
          "Send a new recovery payment link",

        priority: "CRITICAL",

        urgency: "TODAY",

        recoveryStrategy:
          "Create a time-bound recovery payment link after human approval and give the customer a fresh checkout opportunity.",

        status: "AT_RISK",

        paymentLinkId: null,

        paymentLinkUrl: null,

        razorpayPaymentId: null,

        webhookEventId: null,
      },
    });

  console.log("");
  console.log("========================================");
  console.log(
    "HIGH-VALUE HUMAN APPROVAL DEMO CREATED"
  );
  console.log("========================================");

  console.log(`ID: ${opportunity.id}`);

  console.log(
    `Customer: ${opportunity.customerName}`
  );

  console.log(
    `Amount: ₹${(
      opportunity.amount / 100
    ).toLocaleString("en-IN")}`
  );

  console.log(
    `Probability: ${opportunity.recoveryProbability}%`
  );

  console.log(
    `Status: ${opportunity.status}`
  );

  console.log("========================================");
  console.log("");
}

main()
  .catch((error) => {
    console.error(
      "Failed to create demo opportunity:"
    );

    console.error(error);

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });