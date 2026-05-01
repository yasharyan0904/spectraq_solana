"use client";

import { Card, Stat } from "./Card";
import { formatSol, formatUsdc, navUsdc } from "@/lib/format";
import { useVaultState } from "@/lib/hooks/useVaultState";

export function PositionBreakdown() {
  const { data } = useVaultState();
  const v = data?.vault;

  const usdcShare = v
    ? Number(BigInt(v.usdcBalance)) / Number(BigInt(v.navUsdcE6) || 1n)
    : 0;
  const solShare = 1 - usdcShare;
  const solValueUsdc =
    v && v.pythPriceE6
      ? (Number(BigInt(v.solBalance)) * Number(BigInt(v.pythPriceE6))) /
        1_000_000_000 / 1_000_000
      : 0;

  return (
    <Card title="Vault composition" subtitle="On-chain balances · live">
      <div className="grid grid-cols-2 gap-4">
        <Stat
          label="USDC"
          value={v ? formatUsdc(BigInt(v.usdcBalance)) : "—"}
          hint={v ? `${(usdcShare * 100).toFixed(1)}% of NAV` : undefined}
        />
        <Stat
          label="SOL"
          value={v ? formatSol(BigInt(v.solBalance)) : "—"}
          hint={
            v && v.pythPriceE6
              ? `≈ ${formatUsdc(BigInt(Math.round(solValueUsdc * 1_000_000)))}`
              : undefined
          }
        />
      </div>
      {v && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]">
          <div
            className="h-full bg-[var(--color-brand)] transition-all"
            style={{ width: `${(usdcShare * 100).toFixed(1)}%` }}
            aria-label="USDC share of NAV"
          />
        </div>
      )}
      {v && (
        <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          <span>USDC {(usdcShare * 100).toFixed(0)}%</span>
          <span>SOL {(solShare * 100).toFixed(0)}%</span>
        </div>
      )}
      {v && v.pythPriceE6 && (
        <div className="mt-3 text-[11px] text-[var(--color-muted)]">
          Pyth SOL/USD · ${navUsdc(BigInt(v.pythPriceE6)).toFixed(2)}
        </div>
      )}
    </Card>
  );
}
