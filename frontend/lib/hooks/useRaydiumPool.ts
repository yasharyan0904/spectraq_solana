"use client";

import { useQuery } from "@tanstack/react-query";

export interface RaydiumPoolView {
  programId: string;
  poolId: string;
  poolAuth: string | null;
  mintA: string;
  mintB: string;
  vaultA: string;
  vaultB: string;
  wsolReserve: string;
  wsolDecimals: number;
  usdcReserve: string;
  usdcDecimals: number;
  lpMint: string | null;
  lpDecimals: number | null;
  lpSupply: string | null;
}

export function useRaydiumPool() {
  return useQuery({
    queryKey: ["raydium-pool"],
    queryFn: async (): Promise<RaydiumPoolView | null> => {
      const res = await fetch(`/api/raydium-pool`, { cache: "no-store" });
      if (!res.ok) throw new Error(`/api/raydium-pool ${res.status}`);
      const json = (await res.json()) as { pool: RaydiumPoolView | null };
      return json.pool;
    },
    refetchInterval: 15_000,
  });
}
