"use client";

import { Card } from "./Card";
import { explorerTxUrl } from "@/lib/env";
import { formatSol, formatUsdc, shortAddr, timeAgo } from "@/lib/format";
import { useTrades } from "@/lib/hooks/useTrades";

export function TradesTable() {
  const { data, isLoading, error } = useTrades(15);

  return (
    <Card
      title="Recent trades"
      subtitle="On-chain TradeExecuted events"
      right={
        data && (
          <span className="mono text-xs text-[var(--color-muted)]">
            {data.length} shown
          </span>
        )
      }
    >
      {isLoading && (
        <div className="py-8 text-center text-sm text-[var(--color-muted)]">
          Loading trades…
        </div>
      )}
      {error && (
        <div className="py-8 text-center text-sm text-[var(--color-negative)]">
          {String(error)}
        </div>
      )}
      {data && data.length === 0 && (
        <div className="py-8 text-center text-sm text-[var(--color-muted)]">
          No trades yet. The agent will publish TradeExecuted events as it
          rebalances.
        </div>
      )}
      {data && data.length > 0 && (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                <th className="px-2 py-2 font-normal">When</th>
                <th className="px-2 py-2 font-normal">Direction</th>
                <th className="px-2 py-2 text-right font-normal">In</th>
                <th className="px-2 py-2 text-right font-normal">Out</th>
                <th className="px-2 py-2 text-right font-normal">Tx</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => {
                const isUsdcToSol = t.directionIsUsdcToSol;
                const inFmt = isUsdcToSol
                  ? formatUsdc(BigInt(t.amountIn))
                  : formatSol(BigInt(t.amountIn));
                const outFmt = isUsdcToSol
                  ? formatSol(BigInt(t.amountOut))
                  : formatUsdc(BigInt(t.amountOut));
                return (
                  <tr
                    key={t.signature}
                    className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface-2)]"
                  >
                    <td className="px-2 py-3 text-[var(--color-muted)] mono text-xs">
                      {timeAgo(t.blockTime)}
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`mono text-[11px] uppercase tracking-wider ${
                          isUsdcToSol
                            ? "text-[var(--color-positive)]"
                            : "text-[var(--color-negative)]"
                        }`}
                      >
                        {isUsdcToSol ? "USDC → SOL" : "SOL → USDC"}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right mono">{inFmt}</td>
                    <td className="px-2 py-3 text-right mono">{outFmt}</td>
                    <td className="px-2 py-3 text-right">
                      <a
                        href={explorerTxUrl(t.signature)}
                        target="_blank"
                        rel="noreferrer"
                        className="mono text-xs text-[var(--color-brand)] hover:underline"
                      >
                        {shortAddr(t.signature, 4, 4)}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
