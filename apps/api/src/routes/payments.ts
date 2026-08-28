import { Router } from "express";
import { razorpay } from "../services/razorpay";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const payments = await razorpay.payments.all({
      count: 20,
    });

    res.json({
      success: true,
      count: payments.count,
      items: payments.items,
    });
  } catch (error) {
    console.error("Failed to fetch Razorpay payments:", error);

    res.status(500).json({
      success: false,
      error: "Failed to fetch Razorpay payments",
    });
  }
});

export default router;