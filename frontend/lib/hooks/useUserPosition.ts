"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { useAnchorProgram } from "./useAnchorProgram";
import { userPositionPda, vaultPda } from "@/lib/pdas";

export interface UserPositionView {
  shares: bigint;
  cumulativeDepositsUsdc: bigint;
  lastDepositSlot: bigint;
}

/**
 * Reads the connected wallet's UserPosition PDA. Returns `null` shares
 * if the account hasn't been created yet (common before the first
 * deposit) — the caller renders that as "0 shares" rather than an
 * error.
 */
export function useUserPosition() {
  const program = useAnchorProgram();
  const { publicKey } = useWallet();

  return useQuery({
    enabled: !!program && !!publicKey,
    queryKey: ["user-position", publicKey?.toBase58()],
    queryFn: async (): Promise<UserPositionView | null> => {
      if (!program || !publicKey) return null;
      const vault = vaultPda();
      const positionAddr = userPositionPda(vault, publicKey);
      try {
        // Anchor 0.32 type: program.account[name].fetch(addr)
        const acc = await (program.account as Record<string, { fetch: (a: PublicKey) => Promise<unknown> }>)
          .userPosition.fetch(positionAddr);
        const a = acc as { shares: bigint; cumulativeDepositsUsdc: bigint; lastDepositSlot: bigint };
        return {
          shares: BigInt(a.shares.toString()),
          cumulativeDepositsUsdc: BigInt(a.cumulativeDepositsUsdc.toString()),
          lastDepositSlot: BigInt(a.lastDepositSlot.toString()),
        };
      } catch {
        // Account doesn't exist yet — pre-deposit state.
        return null;
      }
    },
    refetchInterval: 8_000,
  });
}
