"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { makeDepositCpmmInInstruction } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";

import { USDC_MINT, WSOL_MINT } from "@/lib/env";
import type { RaydiumPoolView } from "./useRaydiumPool";

export interface AddLiquidityArgs {
  pool: RaydiumPoolView;
  /** USDC amount the admin wants to deposit, in e6 units. */
  usdcAmount: bigint;
  /** Slippage cap on the wSOL side, in bps (default 100 = 1 %). */
  slippageBps?: number;
}

export interface AddLiquidityResult {
  signature: string;
  lpAmount: string;
  wsolAmount: string;
}

/**
 * Admin-side liquidity top-up for the Raydium CPMM pool the agent routes
 * trades through. We compute the matching wSOL deposit from the live pool
 * ratio (`wsolReserve / usdcReserve`), wrap any missing SOL into the
 * caller's wSOL ATA inside the same tx, and call Raydium's
 * `makeDepositCpmmInInstruction`. The user signs once via wallet adapter.
 *
 * Why one tx: spreading the ATA creates / SOL wrap / deposit across
 * multiple txs makes UX brittle (wallet reopens, partial state on failure).
 * Anchor's compute budget is comfortable here — the deposit ix itself is
 * the only heavy step.
 */
export function useAddRaydiumLiquidity() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pool,
      usdcAmount,
      slippageBps = 100,
    }: AddLiquidityArgs): Promise<AddLiquidityResult> => {
      if (!publicKey) throw new Error("wallet not connected");
      if (usdcAmount <= 0n) throw new Error("USDC amount must be positive");
      if (!pool.lpMint || !pool.lpSupply || !pool.poolAuth) {
        throw new Error("pool LP metadata not loaded yet");
      }

      const usdcReserve = BigInt(pool.usdcReserve);
      const wsolReserve = BigInt(pool.wsolReserve);
      const lpSupply = BigInt(pool.lpSupply);
      if (usdcReserve === 0n || wsolReserve === 0n || lpSupply === 0n) {
        throw new Error("pool reserves are empty — cannot price deposit");
      }

      // Proportional sizing: matching wSOL = usdcAmount * wsolReserve / usdcReserve.
      // LP minted ≈ usdcAmount * lpSupply / usdcReserve.
      const wsolAmount = (usdcAmount * wsolReserve) / usdcReserve;
      const lpAmount = (usdcAmount * lpSupply) / usdcReserve;
      // Upper bounds we authorize Raydium to pull (covers rounding + tiny
      // ratio drift between quote and on-chain execution).
      const buffer = (n: bigint) =>
        (n * BigInt(10_000 + slippageBps)) / 10_000n;
      const amountMaxA = buffer(wsolAmount);
      const amountMaxB = buffer(usdcAmount);

      const programId = new PublicKey(pool.programId);
      const authority = new PublicKey(pool.poolAuth);
      const poolId = new PublicKey(pool.poolId);
      const lpMint = new PublicKey(pool.lpMint);
      const mintA = new PublicKey(pool.mintA);
      const mintB = new PublicKey(pool.mintB);
      const vaultA = new PublicKey(pool.vaultA);
      const vaultB = new PublicKey(pool.vaultB);

      const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, publicKey);
      const userWsolAta = getAssociatedTokenAddressSync(WSOL_MINT, publicKey);
      const userLpAta = getAssociatedTokenAddressSync(lpMint, publicKey);

      // Map (A, B) → (user's wSOL/USDC ATA) regardless of which side is mintA.
      const aIsWsol = pool.mintA === WSOL_MINT.toBase58();
      const userVaultA = aIsWsol ? userWsolAta : userUsdcAta;
      const userVaultB = aIsWsol ? userUsdcAta : userWsolAta;

      const tx = new Transaction();

      // 1. Make sure the three ATAs exist (idempotent — no-op if present).
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          userUsdcAta,
          publicKey,
          USDC_MINT,
        ),
      );
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          userWsolAta,
          publicKey,
          WSOL_MINT,
        ),
      );
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          userLpAta,
          publicKey,
          lpMint,
        ),
      );

      // 2. Wrap any SOL needed to cover wsolAmount. Read live wSOL ATA
      //    balance (post-ATA-create it'll be 0) and top up the difference.
      let currentWsol = 0n;
      try {
        const acc = await getAccount(connection, userWsolAta);
        currentWsol = BigInt(acc.amount.toString());
      } catch {
        // ATA didn't exist before this tx — balance is 0.
      }
      if (currentWsol < wsolAmount) {
        const lamportsToWrap = wsolAmount - currentWsol;
        tx.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: userWsolAta,
            lamports: Number(lamportsToWrap),
          }),
        );
        tx.add(createSyncNativeInstruction(userWsolAta, TOKEN_PROGRAM_ID));
      }

      // 3. The actual Raydium CPMM deposit ix.
      tx.add(
        makeDepositCpmmInInstruction(
          programId,
          publicKey,
          authority,
          poolId,
          userLpAta,
          userVaultA,
          userVaultB,
          vaultA,
          vaultB,
          mintA,
          mintB,
          lpMint,
          new BN(lpAmount.toString()),
          new BN(amountMaxA.toString()),
          new BN(amountMaxB.toString()),
        ),
      );

      const signature = await sendTransaction(tx, connection, {
        skipPreflight: false,
      });
      await connection.confirmTransaction(signature, "confirmed");

      // Refresh the dashboard cards.
      queryClient.invalidateQueries({ queryKey: ["raydium-pool"] });
      queryClient.invalidateQueries({ queryKey: ["vault"] });

      return {
        signature,
        lpAmount: lpAmount.toString(),
        wsolAmount: wsolAmount.toString(),
      };
    },
  });
}
