"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { makeWithdrawCpmmInInstruction } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";

import { USDC_MINT, WSOL_MINT } from "@/lib/env";
import type { RaydiumPoolView } from "./useRaydiumPool";

export interface RemoveLiquidityArgs {
  pool: RaydiumPoolView;
  /** LP tokens to burn, in raw LP-mint units (decimals = lpDecimals). */
  lpAmount: bigint;
  /** Slippage cap on the wSOL/USDC sides, in bps (default 100 = 1 %). */
  slippageBps?: number;
}

export interface RemoveLiquidityResult {
  signature: string;
  /** Estimated wSOL the user will receive (raw lamports). */
  wsolEstimate: string;
  /** Estimated USDC the user will receive (raw e6). */
  usdcEstimate: string;
}

/**
 * Burn LP tokens and reclaim the proportional USDC + wSOL share of pool
 * reserves. Mirror of `useAddRaydiumLiquidity`. The wSOL ATA is `closeAccount`d
 * at the end of the tx so the unwrapped native SOL lands directly in the
 * user's wallet (no dust-y wSOL ATA left behind).
 *
 * Why proportional withdraw and not a single-asset exit: Raydium CPMM only
 * exposes a balanced withdraw (`makeWithdrawCpmmInInstruction`). To exit
 * to one side, the user can swap one half through the same pool after
 * withdrawing — the LP withdraw itself is always 50 % USDC / 50 % wSOL by
 * value at the current pool ratio.
 */
export function useRemoveRaydiumLiquidity() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pool,
      lpAmount,
      slippageBps = 100,
    }: RemoveLiquidityArgs): Promise<RemoveLiquidityResult> => {
      if (!publicKey) throw new Error("wallet not connected");
      if (lpAmount <= 0n) throw new Error("LP amount must be positive");
      if (!pool.lpMint || !pool.lpSupply || !pool.poolAuth) {
        throw new Error("pool LP metadata not loaded yet");
      }

      const usdcReserve = BigInt(pool.usdcReserve);
      const wsolReserve = BigInt(pool.wsolReserve);
      const lpSupply = BigInt(pool.lpSupply);
      if (usdcReserve === 0n || wsolReserve === 0n || lpSupply === 0n) {
        throw new Error("pool reserves are empty — nothing to withdraw");
      }
      if (lpAmount > lpSupply) {
        throw new Error("lpAmount exceeds total LP supply");
      }

      // Proportional payout: your % of LP × each reserve.
      const wsolEstimate = (lpAmount * wsolReserve) / lpSupply;
      const usdcEstimate = (lpAmount * usdcReserve) / lpSupply;
      // Lower bounds we accept — Raydium reverts if it would deliver less.
      // (10000 - slippageBps) gives e.g. 99 % of the estimate at 100 bps.
      const floor = (n: bigint) =>
        (n * BigInt(10_000 - slippageBps)) / 10_000n;
      const minWsol = floor(wsolEstimate);
      const minUsdc = floor(usdcEstimate);

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

      const aIsWsol = pool.mintA === WSOL_MINT.toBase58();
      const userVaultA = aIsWsol ? userWsolAta : userUsdcAta;
      const userVaultB = aIsWsol ? userUsdcAta : userWsolAta;
      const minA = aIsWsol ? minWsol : minUsdc;
      const minB = aIsWsol ? minUsdc : minWsol;

      const tx = new Transaction();

      // Idempotent ATA creates so withdraw works even if the user has never
      // held wSOL or USDC on this wallet (rare for an LP-holder, but cheap
      // to guard against).
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
        makeWithdrawCpmmInInstruction(
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
          new BN(minA.toString()),
          new BN(minB.toString()),
        ),
      );

      // Unwrap the wSOL we just received back to native SOL. closeAccount
      // returns all lamports (rent + balance) to the wallet's gas-side
      // SOL — so the user sees their withdrawal as native SOL, not wSOL.
      tx.add(
        createCloseAccountInstruction(userWsolAta, publicKey, publicKey),
      );

      const signature = await sendTransaction(tx, connection, {
        skipPreflight: false,
      });
      await connection.confirmTransaction(signature, "confirmed");

      queryClient.invalidateQueries({ queryKey: ["raydium-pool"] });
      queryClient.invalidateQueries({ queryKey: ["vault"] });

      return {
        signature,
        wsolEstimate: wsolEstimate.toString(),
        usdcEstimate: usdcEstimate.toString(),
      };
    },
  });
}
