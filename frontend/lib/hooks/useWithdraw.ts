"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
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
  const { connection } = useConnection();
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

      // The vault's withdraw instruction requires both user_usdc_account
      // and user_sol_account to already exist as initialized SPL token
      // accounts. A user who only ever deposited USDC won't have a wSOL
      // ATA — and vice versa — so we prepend idempotent ATA creates for
      // both to keep the call non-custodial-friendly for any wallet.
      const [usdcInfo, solInfo] = await Promise.all([
        connection.getAccountInfo(userUsdc),
        connection.getAccountInfo(userSol),
      ]);
      const preIxs = [];
      if (!usdcInfo) {
        preIxs.push(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            userUsdc,
            publicKey,
            USDC_MINT,
          ),
        );
      }
      if (!solInfo) {
        preIxs.push(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            userSol,
            publicKey,
            WSOL_MINT,
          ),
        );
      }

      // After withdraw, close the wSOL ATA so the vault's wSOL payout is
      // automatically unwrapped back into native SOL (lamports) for the user.
      const closeWsolIx = createCloseAccountInstruction(
        userSol,    // wSOL ATA to close
        publicKey,  // lamports destination = user's wallet
        publicKey,  // authority
      );

      const builder = (
        program.methods as Record<string, (...a: unknown[]) => {
          accounts: (a: unknown) => {
            preInstructions: (ix: unknown[]) => {
              postInstructions: (ix: unknown[]) => { rpc: () => Promise<string> };
            };
          };
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
        .preInstructions(preIxs)
        .postInstructions([closeWsolIx]);

      const signature: string = await builder.rpc();
      return { signature };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault-state"] });
      queryClient.invalidateQueries({ queryKey: ["user-position"] });
    },
  });
}
