"use client";

import { useQuery } from "@tanstack/react-query";

export interface TradeRow {
  signature: string;
  blockTime: number; // unix seconds
  directionIsUsdcToSol: boolean;
  amountIn: string; // bigint as string
  amountOut: string;
  usdcBalanceAfter: string;
  solBalanceAfter: string;
}

export function useTrades(limit = 20) {
  return useQuery({
    queryKey: ["trades", limit],
    queryFn: async (): Promise<TradeRow[]> => {
      const res = await fetch(`/api/trades?limit=${limit}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`/api/trades ${res.status}`);
      const json = (await res.json()) as { trades: TradeRow[] };
      return json.trades;
    },
    refetchInterval: 15_000,
  });
}
