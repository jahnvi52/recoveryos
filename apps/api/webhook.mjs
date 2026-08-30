import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const PAYMENT_LINK_ID = "plink_TVrQJRAaYJb3qg";
const AMOUNT = 162100;

const payload = {
  event: "payment_link.paid",

  payload: {
    payment_link: {
      entity: {
        id: PAYMENT_LINK_ID,
        amount_paid: AMOUNT,
      },
    },

    payment: {
      entity: {
        id: `pay_test_${Date.now()}`,
        amount: AMOUNT,
        currency: "INR",
        status: "captured",
      },
    },

    order: {
      entity: {
        id: `order_test_${Date.now()}`,
      },
    },
  },
};

const rawBody = JSON.stringify(payload);

const secret =
  process.env.RAZORPAY_WEBHOOK_SECRET;

if (!secret) {
  console.error(
    "❌ RAZORPAY_WEBHOOK_SECRET is missing from .env"
  );

  process.exit(1);
}

const signature = crypto
  .createHmac("sha256", secret)
  .update(rawBody)
  .digest("hex");

const eventId =
  `recoveryos-test-${Date.now()}`;

console.log("");
console.log(
  "🚀 RecoveryOS webhook test"
);
console.log(
  "🔗 Payment Link:",
  PAYMENT_LINK_ID
);
console.log(
  "💰 Amount: ₹1,621"
);
console.log(
  "📩 Event ID:",
  eventId
);

const response = await fetch(
  "http://localhost:4000/api/webhooks",
  {
    method: "POST",

    headers: {
      "Content-Type":
        "application/json",

      "X-Razorpay-Signature":
        signature,

      "x-razorpay-event-id":
        eventId,
    },

    body: rawBody,
  }
);

const responseText =
  await response.text();

console.log("");
console.log(
  "HTTP Status:",
  response.status
);

console.log(
  "Response:",
  responseText
);