import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const payload = {
  event: "payment_link.paid",

  payload: {
    payment_link: {
      entity: {
        id: "plink_TV7SlPYoSolZi7",
        amount_paid: 849900,
      },
    },

    payment: {
      entity: {
        id: "pay_TV8vF4Qy1hb",
        amount: 849900,
        currency: "INR",
        status: "captured",
      },
    },

    order: {
      entity: {
        id: "order_test_001",
      },
    },
  },
};

const rawBody = JSON.stringify(payload);

const signature = crypto
  .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
  .update(rawBody)
  .digest("hex");

const response = await fetch(
  "http://localhost:4000/api/webhooks",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Razorpay-Signature": signature,
      "x-razorpay-event-id": `test-event-${Date.now()}`
    },
    body: rawBody
  }
);

console.log("Status:", response.status);
console.log("Response:", await response.text());