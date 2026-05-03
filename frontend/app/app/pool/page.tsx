"use client";

import { RaydiumLiquidityForm } from "@/components/RaydiumLiquidityForm";
import { RaydiumPoolCard } from "@/components/RaydiumPoolCard";
import { useRaydiumPool } from "@/lib/hooks/useRaydiumPool";

export default function PoolPage() {
  const { data: pool } = useRaydiumPool();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Raydium pool</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          The agent routes every USDC ↔ SOL swap through this single Raydium
          CPMM pool. Reserves shown below are read live from chain. The vault
          admin can top up liquidity here so trades clear inside the program&apos;s
          5 % Pyth-derived slippage cap.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RaydiumPoolCard />
        <RaydiumLiquidityForm pool={pool} />
      </div>
    </div>
  );
}
