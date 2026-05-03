"use client";

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
