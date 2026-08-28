"use client";

import { useEffect, useState } from "react";

type Opportunity = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerContact?: string | null;
  amount: number;
  currency: string;
  originalPaymentId?: string | null;
  failureReason?: string | null;
  recoveryProbability?: number | null;
  recommendedAction?: string | null;
  status: string;
  paymentLinkId?: string | null;
  paymentLinkUrl?: string | null;
  razorpayPaymentId?: string | null;
  webhookEventId?: string | null;
  createdAt: string;
  updatedAt: string;
  recoveredAt?: string | null;
};

type Metrics = {
  totalOpportunities: number;
  recoveredOpportunities: number;
  pendingOpportunities: number;
  recoveredRevenue: number;
  revenueAtRisk: number;
  recoveryRate: number;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000/api";

function formatCurrency(
  amount: number,
  currency = "INR"
) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function statusClass(status: string) {
  if (status === "RECOVERED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "RECOVERY_INITIATED") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

export default function Home() {
  const [opportunities, setOpportunities] =
    useState<Opportunity[]>([]);

  const [metrics, setMetrics] =
    useState<Metrics | null>(null);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [recoveringId, setRecoveringId] =
    useState<string | null>(null);

  const [apiConnected, setApiConnected] =
    useState(false);

  const [error, setError] = useState("");

  async function loadDashboard(
    showRefresh = false
  ) {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const [
        opportunitiesResponse,
        metricsResponse,
      ] = await Promise.all([
        fetch(
          `${API_URL}/recovery/opportunities`,
          {
            cache: "no-store",
          }
        ),

        fetch(`${API_URL}/recovery/metrics`, {
          cache: "no-store",
        }),
      ]);

      if (
        !opportunitiesResponse.ok ||
        !metricsResponse.ok
      ) {
        throw new Error(
          "RecoveryOS API request failed"
        );
      }

      const opportunitiesData =
        await opportunitiesResponse.json();

      const metricsData =
        await metricsResponse.json();

      if (
        !opportunitiesData.success ||
        !metricsData.success
      ) {
        throw new Error(
          "RecoveryOS API returned an error"
        );
      }

      setOpportunities(
        opportunitiesData.opportunities || []
      );

      setMetrics(metricsData.metrics);

      setApiConnected(true);
    } catch (err) {
      console.error(
        "Dashboard loading failed:",
        err
      );

      setApiConnected(false);

      setError(
        "Unable to connect to the RecoveryOS API. Make sure the API server is running on port 4000."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function recoverOpportunity(
    opportunity: Opportunity
  ) {
    try {
      setRecoveringId(opportunity.id);
      setError("");

      const response = await fetch(
        `${API_URL}/recovery/opportunities/${opportunity.id}/recover`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            "Failed to initiate recovery"
        );
      }

      /*
       * Refresh the dashboard after the recovery
       * action so the latest opportunity state,
       * payment link and metrics are displayed.
       */
      await loadDashboard(true);
    } catch (err) {
      console.error(
        "Recovery action failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to initiate recovery"
      );
    } finally {
      setRecoveringId(null);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      {/* HEADER */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-lg font-bold text-white">
              R
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight">
                RecoveryOS
              </h1>

              <p className="text-sm text-slate-500">
                AI Revenue Recovery Command Center
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">
                Razorpay Test Mode
              </p>

              <p className="text-xs text-slate-500">
                Revenue recovery engine
              </p>
            </div>

            <div
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
                apiConnected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  apiConnected
                    ? "bg-emerald-500"
                    : "bg-red-500"
                }`}
              />

              {apiConnected
                ? "API Connected"
                : "API Offline"}
            </div>

            <button
              onClick={() =>
                loadDashboard(true)
              }
              disabled={refreshing}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* HERO */}
        <section className="mb-10">
          <p className="mb-2 text-sm font-bold uppercase tracking-wider text-blue-600">
            Revenue Intelligence
          </p>

          <h2 className="text-4xl font-bold tracking-tight">
            Recover revenue before it is lost.
          </h2>

          <p className="mt-3 max-w-3xl text-lg leading-8 text-slate-500">
            RecoveryOS detects payment failures,
            diagnoses why they happened, predicts
            recovery probability, and turns lost
            payments into actionable recovery flows.
          </p>
        </section>

        {/* ERROR */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* METRICS */}
        <section className="mb-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Revenue at Risk"
            value={
              metrics
                ? formatCurrency(
                    metrics.revenueAtRisk
                  )
                : "—"
            }
            description="Currently recoverable"
            accent="risk"
          />

          <MetricCard
            title="Recovered Revenue"
            value={
              metrics
                ? formatCurrency(
                    metrics.recoveredRevenue
                  )
                : "—"
            }
            description="Successfully recovered"
            accent="success"
          />

          <MetricCard
            title="Recovery Rate"
            value={
              metrics
                ? `${metrics.recoveryRate}%`
                : "—"
            }
            description={
              metrics
                ? `${metrics.recoveredOpportunities} recovered opportunities`
                : "Loading..."
            }
            accent="blue"
          />

          <MetricCard
            title="Open Opportunities"
            value={
              metrics
                ? String(
                    metrics.pendingOpportunities
                  )
                : "—"
            }
            description="Need recovery action"
            accent="amber"
          />
        </section>

        {/* DASHBOARD CONTENT */}
        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* OPPORTUNITIES */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-lg font-bold">
                  Recovery Opportunities
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Payment events identified by
                  RecoveryOS
                </p>
              </div>

              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {opportunities.length} total
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-slate-500">
                Loading recovery opportunities...
              </div>
            ) : opportunities.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-xl text-emerald-600">
                  ✓
                </div>

                <p className="font-semibold">
                  No recovery opportunities
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  RecoveryOS is currently not seeing
                  any payments that need recovery.
                </p>
              </div>
            ) : (
              <div>
                {opportunities.map(
                  (opportunity) => (
                    <OpportunityCard
                      key={opportunity.id}
                      opportunity={opportunity}
                      recovering={
                        recoveringId ===
                        opportunity.id
                      }
                      onRecover={() =>
                        recoverOpportunity(
                          opportunity
                        )
                      }
                    />
                  )
                )}
              </div>
            )}
          </div>

          {/* RECOVERY ENGINE */}
          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-blue-600">
              Recovery Engine
            </p>

            <h3 className="mt-2 text-2xl font-bold">
              AI-powered recovery loop
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              RecoveryOS continuously turns failed
              payment signals into recovery actions.
            </p>

            <div className="mt-7 space-y-6">
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

              <EngineStep
                number="05"
                title="Learn"
                description="Track the outcome through Razorpay webhooks."
              />
            </div>
          </aside>
        </section>

        {/* FOOTER */}
        <footer className="mt-10 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
          RecoveryOS · AI Revenue Recovery ·
          Razorpay Buildathon
        </footer>
      </div>
    </main>
  );
}

function MetricCard({
  title,
  value,
  description,
  accent,
}: {
  title: string;
  value: string;
  description: string;
  accent:
    | "risk"
    | "success"
    | "blue"
    | "amber";
}) {
  const accentClasses = {
    risk: "bg-red-50 text-red-600",
    success: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">
          {title}
        </p>

        <div
          className={`h-2.5 w-2.5 rounded-full ${accentClasses[accent]}`}
        />
      </div>

      <p className="mt-4 text-3xl font-bold tracking-tight">
        {value}
      </p>

      <p className="mt-2 text-sm text-slate-400">
        {description}
      </p>
    </div>
  );
}

function OpportunityCard({
  opportunity,
  recovering,
  onRecover,
}: {
  opportunity: Opportunity;
  recovering: boolean;
  onRecover: () => void;
}) {
  const probability =
    opportunity.recoveryProbability ?? 0;

  const expectedRecovery = Math.round(
    opportunity.amount *
      (probability / 100)
  );

  const isRecovered =
    opportunity.status === "RECOVERED";

  const hasPaymentLink =
    Boolean(
      opportunity.paymentLinkUrl
    );

  return (
    <div className="border-b border-slate-200 p-6 last:border-b-0">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        {/* CUSTOMER */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-lg font-bold">
              {opportunity.customerName}
            </h4>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                opportunity.status
              )}`}
            >
              {statusLabel(
                opportunity.status
              )}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            {opportunity.customerEmail}
          </p>

          <div className="mt-5 space-y-2 text-sm">
            <p className="text-slate-500">
              Opportunity:{" "}
              <span className="font-mono text-xs text-slate-700">
                {opportunity.id}
              </span>
            </p>

            {opportunity.failureReason && (
              <p className="text-slate-500">
                Reason:{" "}
                <span className="font-medium text-slate-700">
                  {opportunity.failureReason}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* AMOUNT */}
        <div className="text-left xl:text-right">
          <p className="text-2xl font-bold">
            {formatCurrency(
              opportunity.amount,
              opportunity.currency
            )}
          </p>

          {opportunity.recoveryProbability !==
            null &&
            opportunity.recoveryProbability !==
              undefined && (
              <p className="mt-2 text-sm font-semibold text-blue-600">
                {probability}% recovery probability
              </p>
            )}
        </div>
      </div>

      {/* AI DECISION */}
      {(opportunity.failureReason ||
        opportunity.recoveryProbability ||
        opportunity.recommendedAction) && (
        <div className="mt-6 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-white p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
                  AI
                </span>

                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                  AI Recovery Decision
                </p>
              </div>

              <p className="mt-3 text-lg font-bold">
                {opportunity.failureReason ||
                  "Payment failure detected"}
              </p>
            </div>

            <div className="rounded-xl bg-white px-4 py-3 text-left shadow-sm sm:text-right">
              <p className="text-xs text-slate-500">
                Expected recovery
              </p>

              <p className="text-lg font-bold text-blue-700">
                {formatCurrency(
                  expectedRecovery,
                  opportunity.currency
                )}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Recovery probability
              </p>

              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{
                      width: `${probability}%`,
                    }}
                  />
                </div>

                <span className="text-lg font-bold">
                  {probability}%
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Recommended action
              </p>

              <p className="mt-3 text-sm font-semibold text-slate-800">
                {opportunity.recommendedAction ||
                  "Analyze payment and recommend recovery"}
              </p>
            </div>
          </div>

          {/* ACTION */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {!isRecovered && (
              <button
                onClick={onRecover}
                disabled={
                  recovering || hasPaymentLink
                }
                className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {recovering
                  ? "Initiating..."
                  : hasPaymentLink
                    ? "Recovery Link Created"
                    : "Recover Now"}
              </button>
            )}

            {hasPaymentLink && (
              <a
                href={
                  opportunity.paymentLinkUrl!
                }
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Open Payment Link
              </a>
            )}

            {isRecovered && (
              <span className="rounded-lg bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-700">
                ✓ Revenue Recovered
              </span>
            )}
          </div>
        </div>
      )}
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
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-600">
        {number}
      </div>

      <div>
        <p className="font-bold">{title}</p>

        <p className="mt-1 text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}