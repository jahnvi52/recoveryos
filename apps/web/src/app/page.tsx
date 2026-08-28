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
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400";
  }

  if (status === "RECOVERY_INITIATED") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400";
  }

  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400";
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

  const [darkMode, setDarkMode] = useState(false);

  /*
   * Load saved theme.
   */
  useEffect(() => {
    const savedTheme =
      localStorage.getItem("recoveryos-theme");

    const shouldUseDark =
      savedTheme === "dark";

    setDarkMode(shouldUseDark);

    if (shouldUseDark) {
      document.documentElement.classList.add(
        "dark"
      );
    } else {
      document.documentElement.classList.remove(
        "dark"
      );
    }
  }, []);

  /*
   * Apply theme whenever it changes.
   */
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add(
        "dark"
      );

      localStorage.setItem(
        "recoveryos-theme",
        "dark"
      );
    } else {
      document.documentElement.classList.remove(
        "dark"
      );

      localStorage.setItem(
        "recoveryos-theme",
        "light"
      );
    }
  }, [darkMode]);

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
    <main className="min-h-screen bg-slate-50 text-slate-950 transition-colors duration-300 dark:bg-[#080b12] dark:text-white">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl transition-colors duration-300 dark:border-white/10 dark:bg-[#080b12]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          {/* BRAND */}
          <div className="flex items-center gap-4">
            <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-slate-950 text-lg font-bold text-white shadow-lg dark:bg-white dark:text-slate-950">
              R
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/30 to-transparent" />
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight">
                RecoveryOS
              </h1>

              <p className="text-sm text-slate-500 dark:text-slate-400">
                AI Revenue Recovery Command Center
              </p>
            </div>
          </div>

          {/* HEADER CONTROLS */}
          <div className="flex items-center gap-3">
            <div className="hidden text-right lg:block">
              <p className="text-sm font-semibold">
                Razorpay Test Mode
              </p>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Revenue recovery engine
              </p>
            </div>

            {/* API STATUS */}
            <div
              className={`hidden items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium sm:flex ${
                apiConnected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
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

            {/* THEME TOGGLE */}
            <button
              onClick={() =>
                setDarkMode((current) => !current)
              }
              aria-label="Toggle theme"
              className="group flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            >
              {darkMode ? (
                <span className="text-lg transition-transform duration-300 group-hover:rotate-45">
                  ☀
                </span>
              ) : (
                <span className="text-lg transition-transform duration-300 group-hover:rotate-12">
                  ☾
                </span>
              )}
            </button>

            {/* REFRESH */}
            <button
              onClick={() =>
                loadDashboard(true)
              }
              disabled={refreshing}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
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
        <section className="relative mb-10 overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          {/* Decorative glow */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="relative">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-blue-600 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Revenue Intelligence
            </div>

            <h2 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
              Recover revenue{" "}
              <span className="text-blue-600 dark:text-blue-400">
                before it is lost.
              </span>
            </h2>

            <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-500 dark:text-slate-400">
              RecoveryOS detects payment failures,
              diagnoses why they happened, predicts
              recovery probability, and turns lost
              payments into actionable recovery flows.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                AI-powered diagnosis
              </div>

              <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                Razorpay recovery
              </div>

              <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                Real-time outcomes
              </div>
            </div>
          </div>
        </section>

        {/* ERROR */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
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
            icon="↗"
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
            icon="✓"
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
            icon="%"
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
            icon="!"
            accent="amber"
          />
        </section>

        {/* MAIN GRID */}
        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* OPPORTUNITIES */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 dark:border-white/10">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold">
                    Recovery Opportunities
                  </h3>

                  <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 sm:inline-flex dark:bg-blue-950/50 dark:text-blue-400">
                    Live
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Payment events identified by
                  RecoveryOS
                </p>
              </div>

              <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                {opportunities.length} total
              </div>
            </div>

            {loading ? (
              <div className="space-y-4 p-6">
                <LoadingCard />
                <LoadingCard />
              </div>
            ) : opportunities.length === 0 ? (
              <div className="p-12 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  ✓
                </div>

                <p className="font-bold">
                  No recovery opportunities
                </p>

                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
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
          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                Recovery Engine
              </p>

              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
            </div>

            <h3 className="mt-2 text-2xl font-bold">
              AI-powered recovery loop
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              RecoveryOS continuously turns failed
              payment signals into recovery actions.
            </p>

            <div className="mt-8 space-y-1">
              <EngineStep
                number="01"
                title="Detect"
                description="Identify failed or abandoned payments."
                active
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

            <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                System status
              </p>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-semibold">
                  Recovery engine
                </span>

                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  Operational
                </span>
              </div>
            </div>
          </aside>
        </section>

        {/* FOOTER */}
        <footer className="mt-12 border-t border-slate-200 py-7 text-center text-xs text-slate-400 dark:border-white/10 dark:text-slate-500">
          RecoveryOS · AI Revenue Recovery ·
          Razorpay Buildathon
        </footer>
      </div>
    </main>
  );
}

/* =========================================================
   METRIC CARD
========================================================= */

function MetricCard({
  title,
  value,
  description,
  icon,
  accent,
}: {
  title: string;
  value: string;
  description: string;
  icon: string;
  accent:
    | "risk"
    | "success"
    | "blue"
    | "amber";
}) {
  const accentClasses = {
    risk: {
      icon: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
      dot: "bg-red-500",
    },

    success: {
      icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
      dot: "bg-emerald-500",
    },

    blue: {
      icon: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
      dot: "bg-blue-500",
    },

    amber: {
      icon: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
      dot: "bg-amber-500",
    },
  };

  const current = accentClasses[accent];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-white/[0.03]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent opacity-0 transition group-hover:opacity-100 dark:via-white/20" />

      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {title}
        </p>

        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold ${current.icon}`}
        >
          {icon}
        </div>
      </div>

      <p className="mt-5 text-3xl font-bold tracking-tight">
        {value}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${current.dot}`}
        />

        <p className="text-xs text-slate-400 dark:text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   OPPORTUNITY CARD
========================================================= */

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
    <div className="border-b border-slate-200 p-6 transition-colors last:border-b-0 hover:bg-slate-50/60 dark:border-white/10 dark:hover:bg-white/[0.02]">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        {/* CUSTOMER */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-lg font-bold">
              {opportunity.customerName}
            </h4>

            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(
                opportunity.status
              )}`}
            >
              {statusLabel(
                opportunity.status
              )}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {opportunity.customerEmail}
          </p>

          <div className="mt-5 space-y-2 text-sm">
            <p className="text-slate-400 dark:text-slate-500">
              Opportunity:{" "}
              <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                {opportunity.id}
              </span>
            </p>

            {opportunity.failureReason && (
              <p className="text-slate-500 dark:text-slate-400">
                Reason:{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
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
              <p className="mt-2 text-sm font-bold text-blue-600 dark:text-blue-400">
                {probability}% recovery probability
              </p>
            )}
        </div>
      </div>

      {/* AI DECISION */}
      {(opportunity.failureReason ||
        opportunity.recoveryProbability ||
        opportunity.recommendedAction) && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 via-white to-white p-5 dark:border-blue-900/40 dark:from-blue-950/30 dark:via-white/[0.02] dark:to-transparent">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white shadow-lg shadow-blue-600/20">
                  AI
                </span>

                <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  AI Recovery Decision
                </p>
              </div>

              <p className="mt-3 text-lg font-bold">
                {opportunity.failureReason ||
                  "Payment failure detected"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Expected recovery
              </p>

              <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                {formatCurrency(
                  expectedRecovery,
                  opportunity.currency
                )}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {/* PROBABILITY */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Recovery probability
              </p>

              <div className="mt-4 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-700"
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

            {/* ACTION */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Recommended action
              </p>

              <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
                {opportunity.recommendedAction ||
                  "Analyze payment and recommend recovery"}
              </p>
            </div>
          </div>

          {/* BUTTONS */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {!isRecovered && (
              <button
                onClick={onRecover}
                disabled={
                  recovering || hasPaymentLink
                }
                className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-slate-950/10 transition duration-200 hover:-translate-y-0.5 hover:bg-blue-600 hover:shadow-blue-600/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-400"
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
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 transition duration-200 hover:-translate-y-0.5 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Open Payment Link ↗
              </a>
            )}

            {isRecovered && (
              <span className="rounded-xl bg-emerald-50 px-5 py-2.5 text-sm font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                ✓ Revenue Recovered
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   ENGINE STEP
========================================================= */

function EngineStep({
  number,
  title,
  description,
  active = false,
}: {
  number: string;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div className="group relative flex gap-4 py-3">
      <div className="relative">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition ${
            active
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
              : "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
          }`}
        >
          {number}
        </div>
      </div>

      <div>
        <p className="font-bold">
          {title}
        </p>

        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   LOADING CARD
========================================================= */

function LoadingCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 p-6 dark:border-white/10">
      <div className="h-5 w-48 rounded bg-slate-200 dark:bg-white/10" />

      <div className="mt-3 h-4 w-32 rounded bg-slate-100 dark:bg-white/5" />

      <div className="mt-6 h-20 rounded-xl bg-slate-100 dark:bg-white/5" />
    </div>
  );
}