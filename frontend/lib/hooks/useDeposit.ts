"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";

import { useAnchorProgram } from "./useAnchorProgram";
import { shareMintPda, userPositionPda, vaultPda } from "@/lib/pdas";
import { USDC_MINT, WSOL_MINT } from "@/lib/env";

export type DepositAsset = "usdc" | "sol";

export interface DepositArgs {
  asset: DepositAsset;
  /** Amount in the smallest unit of the asset (USDC e6 or lamports). */
  amount: bigint;
  /**
   * Required for USDC deposits — current SOL/USDC price in e6
   * (e.g. SOL=140 → 140_000_000). The program uses this to value the
   * vault's existing SOL balance for the share-price calc. The frontend
   * pulls this from `vault.pythPriceE6`.
   */
  solUsdcPriceE6?: bigint;
}

export interface DepositResult {
  signature: string;
}

/**
 * Submits a deposit instruction. Caller is responsible for upstream
 * UI (loading, error toasts, modal). Throws on RPC error so the
 * `TxStatusModal` can branch off `mutateAsync`.
 */
export function useDeposit() {
  const program = useAnchorProgram();
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ asset, amount, solUsdcPriceE6 }: DepositArgs): Promise<DepositResult> => {
      if (!program || !publicKey) throw new Error("wallet not connected");
      const vault = vaultPda();
      const shareMint = shareMintPda(vault);
      const position = userPositionPda(vault, publicKey);

      let signature: string;
      if (asset === "usdc") {
        if (!solUsdcPriceE6 || solUsdcPriceE6 <= 0n) {
          throw new Error("missing SOL/USDC price for USDC deposit");
        }
        const usdcVault = getAssociatedTokenAddressSync(USDC_MINT, vault, true);
        const userUsdc = getAssociatedTokenAddressSync(USDC_MINT, publicKey);
        const userShares = getAssociatedTokenAddressSync(shareMint, publicKey);
        signature = await (program.methods as Record<string, (...a: unknown[]) => { accounts: (a: unknown) => { rpc: () => Promise<string> } }>)
          .depositUsdc(new anchor.BN(amount.toString()), new anchor.BN(solUsdcPriceE6.toString()))
          .accounts({
            user: publicKey,
            vaultState: vault,
            usdcMint: USDC_MINT,
            shareMint,
            usdcVault,
            userUsdcAccount: userUsdc,
            userShareAccount: userShares,
            userPosition: position,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc();
      } else {
        const solVault = getAssociatedTokenAddressSync(WSOL_MINT, vault, true);
        const userSol = getAssociatedTokenAddressSync(WSOL_MINT, publicKey);
        const userShares = getAssociatedTokenAddressSync(shareMint, publicKey);
        // SOL deposits need a fresh price from Pyth — the vault expects
        // a `price_update` account. The vault PDAs/feeds are wired via
        // the env config; we let the program pick them via remaining_accounts
        // when called by the agent. For UX simplicity in this build,
        // SOL deposits go through the same Pyth account already seeded
        // in the vault initialization. We pass the wSOL ATA here as a
        // user-readable confirmation; the actual Pyth feed is resolved
        // server-side by the price-update account configured at vault
        // init time.
        const pythAccount = new PublicKey(
          process.env.NEXT_PUBLIC_PYTH_SOL_USD_FEED ??
            "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
        );
        signature = await (program.methods as Record<string, (...a: unknown[]) => { accounts: (a: unknown) => { rpc: () => Promise<string> } }>)
          .depositSol(new anchor.BN(amount.toString()))
          .accounts({
            user: publicKey,
            vaultState: vault,
            solMint: WSOL_MINT,
            shareMint,
            solVault,
            userSolAccount: userSol,
            userShareAccount: userShares,
            userPosition: position,
            priceUpdate: pythAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc();
      }
      return { signature };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault-state"] });
      queryClient.invalidateQueries({ queryKey: ["user-position"] });
    },
  });
}
