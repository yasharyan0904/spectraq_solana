"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";

import { useAnchorProgram } from "./useAnchorProgram";
import { shareMintPda, userPositionPda, vaultPda } from "@/lib/pdas";
import { USDC_MINT, WSOL_MINT } from "@/lib/env";

export interface WithdrawArgs {
  /** Number of share-mint units to burn (6 decimals, like USDC). */
  sharesToBurn: bigint;
}

export interface WithdrawResult {
  signature: string;
}

export function useWithdraw() {
  const program = useAnchorProgram();
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sharesToBurn }: WithdrawArgs): Promise<WithdrawResult> => {
      if (!program || !publicKey) throw new Error("wallet not connected");
      const vault = vaultPda();
      const shareMint = shareMintPda(vault);
      const position = userPositionPda(vault, publicKey);

      const usdcVault = getAssociatedTokenAddressSync(USDC_MINT, vault, true);
      const solVault = getAssociatedTokenAddressSync(WSOL_MINT, vault, true);
      const userUsdc = getAssociatedTokenAddressSync(USDC_MINT, publicKey);
      const userSol = getAssociatedTokenAddressSync(WSOL_MINT, publicKey);
      const userShares = getAssociatedTokenAddressSync(shareMint, publicKey);

      const signature: string = await (
        program.methods as Record<string, (...a: unknown[]) => {
          accounts: (a: unknown) => { rpc: () => Promise<string> };
        }>
      )
        .withdraw(new anchor.BN(sharesToBurn.toString()))
        .accounts({
          user: publicKey,
          vaultState: vault,
          usdcMint: USDC_MINT,
          solMint: WSOL_MINT,
          shareMint,
          usdcVault,
          solVault,
          userUsdcAccount: userUsdc,
          userSolAccount: userSol,
          userShareAccount: userShares,
          userPosition: position,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();
      return { signature };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault-state"] });
      queryClient.invalidateQueries({ queryKey: ["user-position"] });
    },
  });
}
