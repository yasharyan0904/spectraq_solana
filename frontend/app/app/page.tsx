"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

import { AgentActivity } from "@/components/AgentActivity";
import { Card, Stat } from "@/components/Card";
import { NavChart } from "@/components/NavChart";
import { PositionBreakdown } from "@/components/PositionBreakdown";
import { RaydiumPoolCard } from "@/components/RaydiumPoolCard";
import { SignalPanel } from "@/components/SignalPanel";
import { TradesTable } from "@/components/TradesTable";
import { formatSol, formatUsdc } from "@/lib/format";
import { useUserPosition } from "@/lib/hooks/useUserPosition";
import { useVaultState } from "@/lib/hooks/useVaultState";

export default function Dashboard() {
  const { data: vaultRes } = useVaultState();
  const { data: position } = useUserPosition();
  const { connected } = useWallet();

  const v = vaultRes?.vault;
  const userShares = position?.shares ?? 0n;
  const totalShares = v ? BigInt(v.totalShares) : 0n;
  const userEquityE6 =
    v && totalShares > 0n
      ? (BigInt(v.navUsdcE6) * userShares) / totalShares
      : 0n;
  const sharePctOfVault =
    totalShares > 0n
      ? Number((userShares * 10_000n) / totalShares) / 100
      : 0;

  return (
    <div className="space-y-6">

      {/* Vault identity header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--color-brand)]">
              SpectraQ Labs · MA Crossover Alpha
            </p>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
              style={{
                background: "rgba(16, 217, 140, 0.08)",
                border: "1px solid rgba(16, 217, 140, 0.25)",
                color: "var(--color-positive)",
              }}
            >
              live · devnet
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
              style={{
                background: "rgba(139,92,246,0.08)",
                border: "1px solid rgba(139,92,246,0.22)",
                color: "var(--color-brand)",
              }}
            >
              Arcium MPC
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Non-custodial · withdrawals bypass the agent · strategy encrypted end-to-end
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href="/app/deposit"
            className="btn-glow rounded-lg px-4 py-2 text-xs font-semibold text-white"
            style={{
              background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
              border: "1px solid rgba(196,181,253,0.15)",
            }}
          >
            Deposit
          </Link>
          <Link
            href="/app/withdraw"
            className="rounded-lg px-4 py-2 text-xs font-medium"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(139,92,246,0.2)",
              color: "var(--color-muted)",
            }}
          >
            Withdraw
          </Link>
        </div>
      </div>

      {/* Top stats bar — vault composition + user position at a glance */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <Stat
            label="Vault NAV"
            value={v ? formatUsdc(BigInt(v.navUsdcE6)) : "—"}
          />
        </Card>
        <Card>
          <Stat
            label="Vault USDC"
            value={v ? formatUsdc(BigInt(v.usdcBalance)) : "—"}
          />
        </Card>
        <Card>
          <Stat
            label="Vault SOL"
            value={v ? formatSol(BigInt(v.solBalance)) : "—"}
          />
        </Card>
        <Card>
          <Stat
            label="Total shares"
            value={
              v
                ? (Number(BigInt(v.totalShares)) / 1_000_000).toLocaleString()
                : "—"
            }
            hint="SPQS"
          />
        </Card>
        <Card>
          <Stat
            label="Your shares"
            value={
              connected ? (Number(userShares) / 1_000_000).toFixed(4) : "—"
            }
            hint={connected ? `${sharePctOfVault.toFixed(2)}% of vault` : "wallet not connected"}
          />
        </Card>
        <Card>
          <Stat
            label="Your equity"
            value={connected ? formatUsdc(userEquityE6) : "—"}
            hint="≈ NAV × shareOfPool"
          />
        </Card>
      </div>

      {/* Mid grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NavChart />
        </div>
        <div className="space-y-6">
          <SignalPanel />
          <PositionBreakdown />
        </div>
      </div>

      {/* Pool depth for the AMM the agent routes through */}
      <RaydiumPoolCard />

      {/* Live agent activity */}
      <AgentActivity filter="trades" limit={30} />

      {/* On-chain TradeExecuted events landed via Raydium CPMM */}
      <TradesTable />
    </div>
  );
}
