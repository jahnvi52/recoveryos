import { Router } from "express";
import { createPaymentLink } from "../services/paymentlink";
import { prisma } from "../db/prisma";
import { analyzeRecovery } from "../services/recoveryEngine";
import { decideRecoveryAction } from "../services/recoveryDecisionEngine";
import { recordRecoveryAuditEvent } from "../services/recoveryAudit";
const router = Router();
/**
* GET /api/recovery/opportunities
*/
router.get("/opportunities", async (_req, res) => {
try {
const opportunities =
await prisma.recoveryOpportunity.findMany({
orderBy: {
createdAt: "desc",
},
});
return res.json({
success: true,
opportunities,
});
} catch (error) {
console.error(
"Failed to fetch recovery opportunities:",
error
);
return res.status(500).json({
success: false,
error:
"Failed to fetch recovery opportunities",
});
}
});
/**
* GET /api/recovery/metrics
*/
router.get("/metrics", async (_req, res) => {
try {
const opportunities =
await prisma.recoveryOpportunity.findMany({
select: {
amount: true,
status: true,
},
});
const totalOpportunities =
opportunities.length;
const recoveredOpportunities =
opportunities.filter(
(opportunity) =>
opportunity.status === "RECOVERED"
);
const openOpportunities =
opportunities.filter(
(opportunity) =>
opportunity.status !== "RECOVERED"
);
const recoveredRevenue =
recoveredOpportunities.reduce(
(total, opportunity) =>
total + opportunity.amount,
0
);
const revenueAtRisk =
openOpportunities.reduce(
(total, opportunity) =>
total + opportunity.amount,
0
);
const recoveryRate =
totalOpportunities > 0
? (recoveredOpportunities.length /
totalOpportunities) *
100
: 0;
return res.json({
success: true,
metrics: {
totalOpportunities,
recoveredOpportunities:
recoveredOpportunities.length,
pendingOpportunities:
openOpportunities.length,
recoveredRevenue,
revenueAtRisk,
recoveryRate: Number(
recoveryRate.toFixed(2)
),
},
});
} catch (error) {
console.error(
"Failed to calculate recovery metrics:",
error
);
return res.status(500).json({
success: false,
error:
"Failed to calculate recovery metrics",
});
}
});
/**
* POST /api/recovery/opportunities/:id/decide
*
* Runs the RecoveryOS Agent Brain.
*
* Does NOT execute recovery.
*/
router.post(
"/opportunities/:id/decide",
async (req, res) => {
try {
const { id } = req.params;
const opportunity =
await prisma.recoveryOpportunity.findUnique({
where: {
id,
},
});
if (!opportunity) {
return res.status(404).json({
success: false,
error:
"Recovery opportunity not found",
});
}
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
/**
* Persist the agent decision.
*/
await recordRecoveryAuditEvent({
opportunityId:
opportunity.id,
eventType:
"ACTION_SELECTED",
action:
agentDecision.nextBestAction,
executionMode:
agentDecision.executionMode,
reason:
agentDecision.explanation,
expectedAmount:
agentDecision.expectedRecoveryAmount,
metadata: {
diagnosis:
decision.diagnosis,
recoveryProbability:
decision.recoveryProbability,
priority:
decision.priority,
urgency:
decision.urgency,
confidence:
agentDecision.confidence,
guardrails:
agentDecision.guardrails,
candidates:
agentDecision.candidates,
},
});
console.log(
"n RecoveryOS Agent Decision:",
agentDecision
);
return res.json({
success: true,
opportunity: {
id:
opportunity.id,
customerName:
opportunity.customerName,
amount:
opportunity.amount,
status:
opportunity.status,
},
aiDecision: {
diagnosis:
decision.diagnosis,
recoveryProbability:
decision.recoveryProbability,
recommendedAction:
decision.recommendedAction,
rationale:
decision.rationale,
expectedRecoveryAmount:
decision.expectedRecoveryAmount,
priority:
decision.priority,
urgency:
decision.urgency,
recoveryStrategy:
decision.recoveryStrategy,
},
agentDecision,
});
} catch (error) {
console.error(
"Agent decision failed:",
error
);
return res.status(500).json({
success: false,
error:
"Failed to generate recovery decision",
});
}
}
);
/**
* GET /api/recovery/opportunities/:id/audit
*
* Returns the complete audit trail.
*/
router.get(
"/opportunities/:id/audit",
async (req, res) => {
try {
const { id } = req.params;
const opportunity =
await prisma.recoveryOpportunity.findUnique({
where: {
id,
},
});
if (!opportunity) {
return res.status(404).json({
success: false,
error:
"Recovery opportunity not found",
});
}
const events =
await prisma.recoveryAuditEvent.findMany({
where: {
opportunityId:
opportunity.id,
},
orderBy: {
createdAt: "asc",
},
});
return res.json({
success: true,
opportunity: {
id:
opportunity.id,
customerName:
opportunity.customerName,
amount:
opportunity.amount,
status:
opportunity.status,
},
events,
});
} catch (error) {
console.error(
"Failed to fetch recovery audit trail:",
error
);
return res.status(500).json({
success: false,
error:
"Failed to fetch recovery audit trail",
});
}
}
);
/**
* POST /api/recovery/payment-link
*/
router.post(
"/payment-link",
async (req, res) => {
try {
const {
amount,
customer,
description,
referenceId,
originalPaymentId,
failureReason,
} = req.body;
if (
!amount ||
!customer?.name
) {
return res.status(400).json({
success: false,
error:
"amount and customer.name are required",
});
}
const decision =
analyzeRecovery({
amount,
failureReason,
customer,
});
console.log(
"n RecoveryOS AI Decision:",
decision
);
const result =
await createPaymentLink({
amount,
customer,
description,
referenceId,
originalPaymentId,
failureReason:
decision.diagnosis,
recoveryProbability:
decision.recoveryProbability,
recommendedAction:
decision.recommendedAction,
});
return res.status(201).json({
success: true,
aiDecision: {
diagnosis:
decision.diagnosis,
recoveryProbability:
decision.recoveryProbability,
recommendedAction:
decision.recommendedAction,
rationale:
decision.rationale,
expectedRecoveryAmount:
decision.expectedRecoveryAmount,
priority:
decision.priority,
urgency:
decision.urgency,
recoveryStrategy:
decision.recoveryStrategy,
},
recoveryOpportunity: {
id:
result.recoveryOpportunity.id,
status:
result.recoveryOpportunity.status,
priority:
result.recoveryOpportunity.priority,
urgency:
result.recoveryOpportunity.urgency,
recoveryStrategy:
result.recoveryOpportunity
.recoveryStrategy,
},
paymentLink: {
id:
result.paymentLink.id,
shortUrl:
result.paymentLink.short_url,
status:
result.paymentLink.status,
amount:
result.paymentLink.amount,
currency:
result.paymentLink.currency,
},
});
} catch (error) {
console.error(
"Payment Link creation failed:",
error
);
return res.status(500).json({
success: false,
error:
"Failed to create payment link",
});
}
}
);
/**
* POST /api/recovery/opportunities/:id/recover
*
* Initiates recovery for an existing opportunity.
*
* Existing payment links are reused.
*/
router.post(
"/opportunities/:id/recover",
async (req, res) => {
try {
const { id } = req.params;
const opportunity =
await prisma.recoveryOpportunity.findUnique({
where: {
id,
},
});
if (!opportunity) {
return res.status(404).json({
success: false,
error:
"Recovery opportunity not found",
});
}
if (
opportunity.status ===
"RECOVERED"
) {
return res.status(400).json({
success: false,
error:
"This recovery opportunity has already been recovered",
});
}
/**
* Existing payment link.
*
* Refresh AI intelligence without creating
* a duplicate Razorpay payment link.
*/
if (
opportunity.paymentLinkId &&
opportunity.paymentLinkUrl
) {
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
const updatedOpportunity =
await prisma.recoveryOpportunity.update({
where: {
id:
opportunity.id,
},
data: {
failureReason:
decision.diagnosis,
recoveryProbability:
decision.recoveryProbability,
recommendedAction:
decision.recommendedAction,
priority:
decision.priority,
urgency:
decision.urgency,
recoveryStrategy:
decision.recoveryStrategy,
updatedAt:
new Date(),
},
});
return res.json({
success: true,
message:
"Recovery payment link already exists. AI intelligence refreshed.",
aiDecision: {
diagnosis:
decision.diagnosis,
recoveryProbability:
decision.recoveryProbability,
recommendedAction:
decision.recommendedAction,
rationale:
decision.rationale,
expectedRecoveryAmount:
decision.expectedRecoveryAmount,
priority:
decision.priority,
urgency:
decision.urgency,
recoveryStrategy:
decision.recoveryStrategy,
},
recoveryOpportunity: {
id:
updatedOpportunity.id,
status:
updatedOpportunity.status,
priority:
updatedOpportunity.priority,
urgency:
updatedOpportunity.urgency,
recoveryStrategy:
updatedOpportunity
.recoveryStrategy,
},
paymentLink: {
id:
updatedOpportunity
.paymentLinkId,
shortUrl:
updatedOpportunity
.paymentLinkUrl,
},
});
}
/**
* Re-run the RecoveryOS AI engine.
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
console.log(
"n RecoveryOS Recovery Action:",
decision
);
/**
* Create Razorpay recovery payment link.
*/
const result =
await createPaymentLink({
amount:
opportunity.amount,
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
description:
"RecoveryOS payment recovery",
referenceId:
`RECOVERY-${opportunity.id}`,
originalPaymentId:
opportunity.originalPaymentId ??
undefined,
failureReason:
decision.diagnosis,
recoveryProbability:
decision.recoveryProbability,
recommendedAction:
decision.recommendedAction,
});
/**
* Remove temporary duplicate opportunity.
*/
await prisma.recoveryOpportunity.delete({
where: {
id:
result.recoveryOpportunity.id,
},
});
/**
* Update original opportunity.
*/
const updatedOpportunity =
await prisma.recoveryOpportunity.update({
where: {
id,
},
data: {
failureReason:
decision.diagnosis,
recoveryProbability:
decision.recoveryProbability,
recommendedAction:
decision.recommendedAction,
priority:
decision.priority,
urgency:
decision.urgency,
recoveryStrategy:
decision.recoveryStrategy,
status:
"RECOVERY_INITIATED",
paymentLinkId:
result.paymentLink.id,
paymentLinkUrl:
result.paymentLink.short_url,
updatedAt:
new Date(),
},
});
return res.json({
success: true,
aiDecision: {
diagnosis:
decision.diagnosis,
recoveryProbability:
decision.recoveryProbability,
recommendedAction:
decision.recommendedAction,
rationale:
decision.rationale,
expectedRecoveryAmount:
decision.expectedRecoveryAmount,
priority:
decision.priority,
urgency:
decision.urgency,
recoveryStrategy:
decision.recoveryStrategy,
},
recoveryOpportunity: {
id:
updatedOpportunity.id,
status:
updatedOpportunity.status,
priority:
updatedOpportunity.priority,
urgency:
updatedOpportunity.urgency,
recoveryStrategy:
updatedOpportunity
.recoveryStrategy,
},
paymentLink: {
id:
result.paymentLink.id,
shortUrl:
result.paymentLink.short_url,
status:
result.paymentLink.status,
amount:
result.paymentLink.amount,
currency:
result.paymentLink.currency,
},
});
} catch (error) {
console.error(
"Recovery action failed:",
error
);
return res.status(500).json({
success: false,
error:
"Failed to initiate recovery",
});
}
}
);
export default router;