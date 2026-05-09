"use client";

import Link from "next/link";
import { useState } from "react";

interface VaultListing {
  id: string;
  name: string;
  manager: string;
  tag: string;
  category: "trend" | "momentum" | "mean-rev" | "arb";
  tvlUsdc: number;
  sharpe: number;
  ret30d: number;
  maxDd: number;
  depositors: number;
  live: boolean;
  verified: boolean;
  encrypted: boolean;
  verdict: "ship" | "no_ship" | "pending";
  vaultAddr?: string;
}

const VAULTS: VaultListing[] = [
  {
    id: "spectraq-ma-01",
    name: "MA Crossover Alpha",
    manager: "SpectraQ Labs",
    tag: "Trend Following",
    category: "trend",
    tvlUsdc: 142_800,
    sharpe: 1.34,
    ret30d: 3.1,
    maxDd: -8.2,
    depositors: 124,
    live: true,
    verified: true,
    encrypted: true,
    verdict: "no_ship",
    vaultAddr: "HjiD5aGYnE3unNnKh89xF7thQrF636i2RUw6jV2jNnKt",
  },
  {
    id: "vol-momentum-02",
    name: "Vol-Adj Momentum",
    manager: "0x4af2…3b1c",
    tag: "Momentum",
    category: "momentum",
    tvlUsdc: 89_400,
    sharpe: 2.1,
    ret30d: 7.8,
    maxDd: -12.4,
    depositors: 67,
    live: true,
    verified: true,
    encrypted: true,
    verdict: "ship",
  },
  {
    id: "mean-rev-grid-03",
    name: "Mean Rev Grid",
    manager: "0x9e71…fa02",
    tag: "Mean Reversion",
    category: "mean-rev",
    tvlUsdc: 54_200,
    sharpe: 0.91,
    ret30d: 1.9,
    maxDd: -6.7,
    depositors: 38,
    live: false,
    verified: true,
    encrypted: true,
    verdict: "ship",
  },
  {
    id: "stat-arb-04",
    name: "SOL/USDC Stat Arb",
    manager: "0xb338…7c1a",
    tag: "Arbitrage",
    category: "arb",
    tvlUsdc: 211_500,
    sharpe: 3.42,
    ret30d: 11.2,
    maxDd: -4.1,
    depositors: 203,
    live: true,
    verified: true,
    encrypted: true,
    verdict: "ship",
  },
  {
    id: "breakout-05",
    name: "Breakout Scanner",
    manager: "0x22cf…8d9b",
    tag: "Trend Following",
    category: "trend",
    tvlUsdc: 31_000,
    sharpe: 1.07,
    ret30d: -0.4,
    maxDd: -14.8,
    depositors: 19,
    live: false,
    verified: false,
    encrypted: true,
    verdict: "pending",
  },
  {
    id: "rsi-div-06",
    name: "RSI Divergence",
    manager: "0xf011…2a3e",
    tag: "Mean Reversion",
    category: "mean-rev",
    tvlUsdc: 78_700,
    sharpe: 1.81,
    ret30d: 5.3,
    maxDd: -9.6,
    depositors: 55,
    live: true,
    verified: true,
    encrypted: true,
    verdict: "ship",
  },
];

type SortKey = "tvl" | "sharpe" | "ret30d" | "dd";
type FilterCat = "all" | "trend" | "momentum" | "mean-rev" | "arb";

const FILTER_TABS: { key: FilterCat; label: string }[] = [
  { key: "all", label: "All vaults" },
  { key: "trend", label: "Trend" },
  { key: "momentum", label: "Momentum" },
  { key: "mean-rev", label: "Mean Reversion" },
  { key: "arb", label: "Arbitrage" },
];

function fmtUsdc(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

function VerdictBadge({ verdict }: { verdict: VaultListing["verdict"] }) {
  if (verdict === "ship")
    return (
      <span
        className="mono rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest"
        style={{
          background: "rgba(16, 217, 140, 0.1)",
          border: "1px solid rgba(16, 217, 140, 0.3)",
          color: "var(--color-positive)",
        }}
      >
        Validated
      </span>
    );
  if (verdict === "no_ship")
    return (
      <span
        className="mono rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest"
        style={{
          background: "rgba(255, 69, 96, 0.08)",
          border: "1px solid rgba(255, 69, 96, 0.25)",
          color: "var(--color-negative)",
        }}
      >
        Unvalidated
      </span>
    );
  return (
    <span
      className="mono rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest"
      style={{
        background: "rgba(112, 112, 160, 0.1)",
        border: "1px solid rgba(112, 112, 160, 0.25)",
        color: "var(--color-muted)",
      }}
    >
      Pending
    </span>
  );
}

export default function MarketplacePage() {
  const [filter, setFilter] = useState<FilterCat>("all");
  const [sort, setSort] = useState<SortKey>("tvl");

  const vaults = VAULTS
    .filter((v) => filter === "all" || v.category === filter)
    .sort((a, b) => {
      if (sort === "tvl") return b.tvlUsdc - a.tvlUsdc;
      if (sort === "sharpe") return b.sharpe - a.sharpe;
      if (sort === "ret30d") return b.ret30d - a.ret30d;
      if (sort === "dd") return b.maxDd - a.maxDd;
      return 0;
    });

  return (
    <div className="space-y-8">

      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--color-brand)]">
            Shopify for Quants
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Strategy Marketplace
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)]">
            Browse non-custodial trading vaults. Every strategy runs inside{" "}
            <span className="text-[var(--color-brand)]">Arcium MPC</span> — quant
            logic stays private, on-chain performance is fully verifiable.
          </p>
        </div>
        <Link
          href="/app/launch"
          className="btn-glow inline-flex items-center gap-2 self-start rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-px md:self-auto"
          style={{
            background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
            border: "1px solid rgba(196,181,253,0.15)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Launch your vault
        </Link>
      </div>

      {/* Filter + sort bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex gap-0.5 rounded-xl p-1"
          style={{
            background: "rgba(10, 10, 18, 0.6)",
            border: "1px solid rgba(139, 92, 246, 0.12)",
          }}
        >
          {FILTER_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
              style={
                filter === t.key
                  ? {
                      background: "rgba(139, 92, 246, 0.2)",
                      border: "1px solid rgba(139, 92, 246, 0.3)",
                      color: "var(--color-text)",
                    }
                  : { color: "var(--color-muted)", border: "1px solid transparent" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <span>Sort by</span>
          {(
            [
              ["tvl", "TVL"],
              ["sharpe", "Sharpe"],
              ["ret30d", "30D Return"],
              ["dd", "Drawdown"],
            ] as [SortKey, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className="rounded-md px-2.5 py-1 transition-all"
              style={
                sort === k
                  ? {
                      background: "rgba(139, 92, 246, 0.15)",
                      border: "1px solid rgba(139, 92, 246, 0.3)",
                      color: "var(--color-brand)",
                    }
                  : {
                      border: "1px solid rgba(139, 92, 246, 0.1)",
                      color: "var(--color-muted)",
                    }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Vault grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vaults.map((v) => (
          <div
            key={v.id}
            className="glass card-glow flex flex-col rounded-2xl p-5 transition-all"
            style={{ border: "1px solid rgba(139, 92, 246, 0.15)" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: v.live ? "var(--color-positive)" : "var(--color-muted)" }}
                  />
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                    {v.live ? "live" : "testnet"}
                  </span>
                  <VerdictBadge verdict={v.verdict} />
                </div>
                <h3 className="mt-1.5 truncate text-sm font-semibold tracking-tight">{v.name}</h3>
                <p className="mono text-[11px] text-[var(--color-muted)]">{v.manager}</p>
              </div>
              <span
                className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium"
                style={{
                  background: "rgba(139,92,246,0.08)",
                  border: "1px solid rgba(139,92,246,0.18)",
                  color: "var(--color-brand)",
                }}
              >
                {v.tag}
              </span>
            </div>

            {/* Arcium badge */}
            {v.encrypted && (
              <div
                className="mt-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5"
                style={{
                  background: "rgba(139,92,246,0.05)",
                  border: "1px solid rgba(139,92,246,0.12)",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="mono text-[10px] text-[var(--color-brand)]">
                  Strategy encrypted · Arcium MPC
                </span>
              </div>
            )}

            {/* Stats grid */}
            <div className="mt-4 grid grid-cols-4 gap-2">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-[var(--color-muted)]">TVL</p>
                <p className="mono mt-0.5 text-sm font-semibold">{fmtUsdc(v.tvlUsdc)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-[var(--color-muted)]">Sharpe</p>
                <p
                  className="mono mt-0.5 text-sm font-semibold"
                  style={{ color: v.sharpe > 1 ? "var(--color-positive)" : v.sharpe > 0 ? "var(--color-text)" : "var(--color-negative)" }}
                >
                  {v.sharpe > 0 ? "+" : ""}{v.sharpe.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-[var(--color-muted)]">30D</p>
                <p
                  className="mono mt-0.5 text-sm font-semibold"
                  style={{ color: v.ret30d >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}
                >
                  {v.ret30d >= 0 ? "+" : ""}{v.ret30d.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-[var(--color-muted)]">MaxDD</p>
                <p className="mono mt-0.5 text-sm font-semibold" style={{ color: "var(--color-negative)" }}>
                  {v.maxDd.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Depositors */}
            <div className="mt-3 flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--color-muted)]">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="text-[11px] text-[var(--color-muted)]">{v.depositors} depositors</span>
            </div>

            {/* CTA */}
            <div className="mt-4 flex gap-2">
              {v.vaultAddr ? (
                <Link
                  href="/app/deposit"
                  className="flex-1 rounded-lg py-2 text-center text-xs font-semibold transition-all hover:-translate-y-px"
                  style={{
                    background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(109,40,217,0.2))",
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                    color: "var(--color-text)",
                  }}
                >
                  Deposit
                </Link>
              ) : (
                <div
                  className="flex-1 rounded-lg py-2 text-center text-xs font-semibold"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(139, 92, 246, 0.1)",
                    color: "var(--color-muted)",
                  }}
                >
                  Coming soon
                </div>
              )}
              {v.verified && (
                <Link
                  href="/strategy"
                  className="flex items-center justify-center rounded-lg px-3 py-2 text-xs transition-all"
                  style={{
                    background: "rgba(10, 10, 18, 0.5)",
                    border: "1px solid rgba(139, 92, 246, 0.15)",
                    color: "var(--color-muted)",
                  }}
                  title="View validation report"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom info banner */}
      <div
        className="rounded-2xl p-6 md:p-8"
        style={{
          background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(34,211,238,0.04))",
          border: "1px solid rgba(139, 92, 246, 0.18)",
        }}
      >
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <h4 className="text-sm font-semibold">Non-custodial guarantee</h4>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">
              Every vault is a Solana program PDA. No manager key can drain funds.
              Withdraw any time — the on-chain instruction bypasses the agent entirely.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Arcium MPC privacy</h4>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">
              Signal computation runs inside the Arcium MXE cluster under threshold
              encryption. No single node — including the strategy author — sees
              the plaintext computation state.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Transparent validation</h4>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">
              Every listed strategy ships a four-stage MCPT report: in-sample
              permutation, walk-forward OOS Sharpe, and WF permutation. Failed
              verdicts are displayed — not hidden.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
