"use client";

import { useEffect, useState } from "react";

type Metrics = {
  totalOpportunities: number;
  recoveredOpportunities: number;
  pendingOpportunities: number;
  recoveredRevenue: number;
  revenueAtRisk: number;
  recoveryRate: number;
};

type Opportunity = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerContact: string;
  amount: number;
  currency: string;
  originalPaymentId: string | null;
  failureReason: string | null;
  recoveryProbability: number | null;
  recommendedAction: string | null;
  status: string;
  paymentLinkId: string | null;
  paymentLinkUrl: string | null;
  razorpayPaymentId: string | null;
  webhookEventId: string | null;
  createdAt: string;
  updatedAt: string;
  recoveredAt: string | null;
};

const API_URL = "http://localhost:4000/api/recovery";

function formatMoney(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default function Home() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const [metricsResponse, opportunitiesResponse] = await Promise.all([
        fetch(`${API_URL}/metrics`),
        fetch(`${API_URL}/opportunities`),
      ]);

      if (!metricsResponse.ok || !opportunitiesResponse.ok) {
        throw new Error("Failed to load RecoveryOS data");
      }

      const metricsData = await metricsResponse.json();
      const opportunitiesData = await opportunitiesResponse.json();

      setMetrics(metricsData.metrics);
      setOpportunities(opportunitiesData.opportunities || []);
    } catch (err) {
      console.error(err);
      setError(
        "Could not connect to the RecoveryOS API. Make sure the API is running on port 4000."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-lg font-bold text-white">
                R
              </div>

              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  RecoveryOS
                </h1>
                <p className="text-xs text-slate-500">
                  AI Revenue Recovery Command Center
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">Razorpay Test Mode</p>
              <p className="text-xs text-slate-500">
                Revenue recovery engine
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              API Connected
            </div>

            <button
              onClick={loadDashboard}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Hero */}
        <section className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-blue-600">
            Revenue Intelligence
          </p>

          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                Recover revenue before it is lost.
              </h2>

              <p className="mt-2 max-w-2xl text-slate-500">
                RecoveryOS detects payment failures, identifies recovery
                opportunities, and turns them into actionable recovery flows.
              </p>
            </div>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Metrics */}
        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Revenue at Risk"
            value={
              loading || !metrics
                ? "—"
                : formatMoney(metrics.revenueAtRisk)
            }
            subtitle="Currently recoverable"
          />

          <MetricCard
            title="Recovered Revenue"
            value={
              loading || !metrics
                ? "—"
                : formatMoney(metrics.recoveredRevenue)
            }
            subtitle="Successfully recovered"
          />

          <MetricCard
            title="Recovery Rate"
            value={
              loading || !metrics ? "—" : `${metrics.recoveryRate}%`
            }
            subtitle={
              metrics
                ? `${metrics.recoveredOpportunities} recovered opportunities`
                : "Loading..."
            }
          />

          <MetricCard
            title="Open Opportunities"
            value={
              loading || !metrics
                ? "—"
                : String(metrics.pendingOpportunities)
            }
            subtitle="Need recovery action"
          />
        </section>

        {/* Main content */}
        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Opportunities */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="font-semibold">Recovery Opportunities</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Payment events identified by RecoveryOS
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {opportunities.length} total
              </span>
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-slate-500">
                Loading recovery opportunities...
              </div>
            ) : opportunities.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">
                  ✓
                </div>

                <p className="font-semibold">No recovery opportunities</p>
                <p className="mt-1 text-sm text-slate-500">
                  RecoveryOS has nothing requiring action right now.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {opportunities.map((opportunity) => (
                  <OpportunityRow
                    key={opportunity.id}
                    opportunity={opportunity}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Recovery Engine */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-blue-600">
                Recovery Engine
              </p>

              <h3 className="mt-2 text-xl font-bold">
                AI-powered recovery loop
              </h3>

              <div className="mt-6 space-y-4">
                <EngineStep
                  number="01"
                  title="Detect"
                  description="Identify failed or abandoned payments."
                />

                <EngineStep
                  number="02"
                  title="Diagnose"
                  description="Understand why the payment failed."
                />

                <EngineStep
                  number="03"
                  title="Prioritize"
                  description="Estimate recovery probability and value."
                />

                <EngineStep
                  number="04"
                  title="Recover"
                  description="Generate and execute the best recovery action."
                />
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950 p-6 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                System Status
              </p>

              <div className="mt-5 space-y-4">
                <StatusItem label="Recovery API" status="Operational" />
                <StatusItem label="Razorpay Integration" status="Connected" />
                <StatusItem label="Webhook Listener" status="Active" />
                <StatusItem label="Database" status="Connected" />
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-10 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
          RecoveryOS · AI Revenue Recovery · Razorpay Buildathon
        </footer>
      </div>
    </main>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>

      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>

      <p className="mt-2 text-xs text-slate-400">{subtitle}</p>
    </div>
  );
}

function OpportunityRow({
  opportunity,
}: {
  opportunity: Opportunity;
}) {
  const recovered = opportunity.status === "RECOVERED";

  return (
    <div className="p-6 transition hover:bg-slate-50">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold">
              {opportunity.customerName || "Unknown Customer"}
            </h4>

            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                recovered
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {statusLabel(opportunity.status)}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            {opportunity.customerEmail || opportunity.customerContact || "No contact"}
          </p>

          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
            <span>
              Opportunity: {opportunity.id.slice(0, 12)}...
            </span>

            {opportunity.failureReason && (
              <span>
                Reason: {opportunity.failureReason}
              </span>
            )}
          </div>
        </div>

        <div className="text-left md:text-right">
          <p className="text-lg font-bold">
            {formatMoney(
              opportunity.amount,
              opportunity.currency || "INR"
            )}
          </p>

          {opportunity.recoveryProbability !== null && (
            <p className="mt-1 text-xs font-medium text-blue-600">
              {opportunity.recoveryProbability}% recovery probability
            </p>
          )}

          {opportunity.recommendedAction && (
            <p className="mt-1 text-xs text-slate-400">
              Action: {opportunity.recommendedAction}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EngineStep({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-600">
        {number}
      </div>

      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}

function StatusItem({
  label,
  status,
}: {
  label: string;
  status: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-300">{label}</span>

      <span className="flex items-center gap-2 text-xs font-medium text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        {status}
      </span>
    </div>
  );
}