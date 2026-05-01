"use client";

import { useQuery } from "@tanstack/react-query";

export interface VaultStateView {
  vaultPubkey: string;
  totalShares: string; // bigint as string (network safety)
  usdcBalance: string;
  solBalance: string;
  lastSignal: number; // -1 / 0 / 1
  lastSignalSlot: string;
  signalState: "idle" | "pending" | "ready";
  pythPriceE6: string | null; // last known SOL/USD from Pyth, e6 fixed-point
  navUsdcE6: string;          // computed: usdc + sol*price
  // Indicative 24h change (not on-chain — derived by the API route).
  nav24hChange: number | null;
}

export interface VaultStateResponse {
  vault: VaultStateView | null;
  fetchedAt: number;
  errored?: string;
}

async function fetchVault(): Promise<VaultStateResponse> {
  const res = await fetch("/api/vault", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/vault ${res.status}`);
  return (await res.json()) as VaultStateResponse;
}

/** 5-second-refetch view of the vault. Polls the server cache, not RPC. */
export function useVaultState() {
  return useQuery({
    queryKey: ["vault-state"],
    queryFn: fetchVault,
    refetchInterval: 5_000,
  });
}
