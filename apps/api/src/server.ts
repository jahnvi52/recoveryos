import express from "express";
import cors from "cors";
import { env } from "./config/env";
import paymentsRouter from "./routes/payments";
import recoveryRouter from "./routes/recovery";
import webhooksRouter from "./routes/webhooks";

const app = express();

app.use(cors());

app.use(
  "/api/webhooks",
  express.raw({ type: "application/json" }),
  webhooksRouter
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "RecoveryOS API",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/payments", paymentsRouter);
app.use("/api/recovery", recoveryRouter);

app.listen(env.port, () => {
  console.log(
    `🚀 RecoveryOS API running on http://localhost:${env.port}`
  );
});