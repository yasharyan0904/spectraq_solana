"use client";

import { Card } from "./Card";
import { explorerAddrUrl } from "@/lib/env";
import { formatSol, formatUsdc, shortAddr } from "@/lib/format";
import { useRaydiumPool } from "@/lib/hooks/useRaydiumPool";

export function RaydiumPoolCard() {
  const { data, isLoading, error } = useRaydiumPool();

  return (
    <Card
      title="Raydium CPMM pool"
      subtitle="Live depth the agent routes USDC ↔ SOL through"
      right={
        data && (
          <a
            href={explorerAddrUrl(data.poolId)}
            target="_blank"
            rel="noreferrer"
            className="mono text-[11px] text-[var(--color-brand)] hover:underline"
          >
            {shortAddr(data.poolId, 4, 4)}
          </a>
        )
      }
    >
      {isLoading && (
        <div className="py-4 text-center text-sm text-[var(--color-muted)]">
          Loading pool reserves…
        </div>
      )}
      {error && (
        <div className="py-4 text-center text-sm text-[var(--color-negative)]">
          {String(error)}
        </div>
      )}
      {!data && !isLoading && !error && (
        <div className="py-4 text-center text-sm text-[var(--color-muted)]">
          Pool not configured yet — run scripts/create_raydium_pool.ts.
        </div>
      )}
      {data && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
              wSOL reserve
            </div>
            <div className="mono mt-1 text-lg">
              {formatSol(BigInt(data.wsolReserve))}
            </div>
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
              USDC reserve
            </div>
            <div className="mono mt-1 text-lg">
              {formatUsdc(BigInt(data.usdcReserve))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
