// SpectraQ — Raydium CPMM swap helper for the trading agent.
//
// We pre-build a swap instruction off-chain using Raydium SDK V2's
// `makeSwapCpmmBaseInInstruction`, then ship its raw bytes + accounts
// through the vault's `execute_trade` CPI. The vault validates Pyth
// slippage / amount caps / destination ATA / etc; Raydium handles the
// curve math.
//
// Pool wiring lives in .env (set by `scripts/create_raydium_pool.ts`):
//   RAYDIUM_CPMM_PROGRAM_ID
//   RAYDIUM_CPMM_POOL_AUTH
//   RAYDIUM_USDC_SOL_POOL
//   RAYDIUM_USDC_SOL_CONFIG_ID
//   RAYDIUM_USDC_SOL_VAULT_A           (mint A pool reserve)
//   RAYDIUM_USDC_SOL_VAULT_B           (mint B pool reserve)
//   RAYDIUM_USDC_SOL_MINT_A            (canonical-order mint A — wSOL on devnet)
//   RAYDIUM_USDC_SOL_MINT_B            (canonical-order mint B — USDC on devnet)
//   RAYDIUM_USDC_SOL_OBSERVATION
//
// The config trade fee rate (0.25% for fee index 0) is fetched from chain
// at first use and cached. Slippage is enforced both off-chain (we shrink
// `amountOutMin` by an additional `slippageBps`) and on-chain (vault's
// 5% Pyth cap).

import {
  AccountMeta,
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  makeSwapCpmmBaseInInstruction,
  CurveCalculator,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";

// -----------------------------------------------------------------------------
// Pool config — loaded once at boot via loadRaydiumPoolFromEnv()
// -----------------------------------------------------------------------------

export interface RaydiumPoolConfig {
  programId: PublicKey;
  authority: PublicKey;
  poolId: PublicKey;
  configId: PublicKey;
  observation: PublicKey;
  /** Canonical mint A (wSOL on devnet for the USDC/wSOL pool). */
  mintA: PublicKey;
  /** Canonical mint B (USDC on devnet for the USDC/wSOL pool). */
  mintB: PublicKey;
  /** Pool's reserve ATA holding mintA. */
  vaultA: PublicKey;
  /** Pool's reserve ATA holding mintB. */
  vaultB: PublicKey;
}

export function loadRaydiumPoolFromEnv(): RaydiumPoolConfig {
  const need = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing required env var: ${k}`);
    return v;
  };
  return {
    programId: new PublicKey(need("RAYDIUM_CPMM_PROGRAM_ID")),
    authority: new PublicKey(need("RAYDIUM_CPMM_POOL_AUTH")),
    poolId: new PublicKey(need("RAYDIUM_USDC_SOL_POOL")),
    configId: new PublicKey(need("RAYDIUM_USDC_SOL_CONFIG_ID")),
    observation: new PublicKey(need("RAYDIUM_USDC_SOL_OBSERVATION")),
    mintA: new PublicKey(need("RAYDIUM_USDC_SOL_MINT_A")),
    mintB: new PublicKey(need("RAYDIUM_USDC_SOL_MINT_B")),
    vaultA: new PublicKey(need("RAYDIUM_USDC_SOL_VAULT_A")),
    vaultB: new PublicKey(need("RAYDIUM_USDC_SOL_VAULT_B")),
  };
}

// -----------------------------------------------------------------------------
// AMM config fee-rate cache
// -----------------------------------------------------------------------------

interface AmmConfigFees {
  tradeFeeRate: BN;
  protocolFeeRate: BN;
  fundFeeRate: BN;
  creatorFeeRate: BN;
}

let cachedFees: AmmConfigFees | null = null;

/**
 * Fetch the CPMM AmmConfig account and parse out its fee rates. Layout:
 *   8  discriminator
 *   1  bump
 *   1  disable_create_pool
 *   2  index (u16 LE)
 *   8  trade_fee_rate (u64 LE)
 *   8  protocol_fee_rate (u64 LE)
 *   8  fund_fee_rate (u64 LE)
 *   8  create_pool_fee (u64 LE)
 *   32 protocol_owner
 *   8  creator_fee_rate (u64 LE) — only present in newer Raydium config
 *   ...
 */
async function loadAmmFees(
  connection: Connection,
  configId: PublicKey,
): Promise<AmmConfigFees> {
  if (cachedFees) return cachedFees;
  const info = await connection.getAccountInfo(configId);
  if (!info) throw new Error(`AmmConfig ${configId.toBase58()} not found`);
  const data = info.data;
  const readU64LE = (offset: number): BN =>
    new BN(data.subarray(offset, offset + 8), "le");
  // CpmmConfigInfoLayout (Raydium SDK V2):
  //   8  discriminator
  //   1  bump
  //   1  disableCreatePool (bool)
  //   2  index (u16)
  //   8  tradeFeeRate    @ offset 12
  //   8  protocolFeeRate @ offset 20
  //   8  fundFeeRate     @ offset 28
  //   8  createPoolFee   @ offset 36
  //  32  protocolOwner   @ offset 44
  //  32  fundOwner       @ offset 76
  //   8  creatorFeeRate  @ offset 108
  const tradeFeeRate = readU64LE(12);
  const protocolFeeRate = readU64LE(20);
  const fundFeeRate = readU64LE(28);
  const creatorFeeRate = data.length >= 116 ? readU64LE(108) : new BN(0);
  cachedFees = { tradeFeeRate, protocolFeeRate, fundFeeRate, creatorFeeRate };
  return cachedFees;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export interface ParsedRoute {
  /** Off-chain quote — what we expect Raydium to return. */
  quote: { outAmount: string };
  /** Raw bytes the vault forwards in execute_trade. */
  dexRouteData: Buffer;
  /** Index into `remainingAccounts` of the vault's destination-side ATA. */
  destinationAtaIndex: number;
  /** Remaining accounts to attach to the vault's execute_trade ix. */
  remainingAccounts: AccountMeta[];
  /** Address-lookup tables (none for direct CPMM, kept for symmetry). */
  addressLookupTableAddresses: PublicKey[];
}

export interface QuoteAndBuildArgs {
  connection: Connection;
  pool: RaydiumPoolConfig;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: bigint;
  /** Extra slippage tolerance (bps) applied on top of the curve math. */
  slippageBps: number;
  /** The vault PDA — owns the source-side ATA and signs via invoke_signed. */
  vaultPda: PublicKey;
  /** The vault PDA's destination-side ATA (output mint). */
  expectedDestinationAta: PublicKey;
}

/**
 * Quote the swap against current pool reserves, then build a Raydium CPMM
 * `swap_base_input` instruction targeting the vault PDA's ATAs. Returns the
 * raw ix data + accounts shape that `execute_trade` expects.
 */
export async function quoteAndBuildSwap(
  args: QuoteAndBuildArgs,
): Promise<ParsedRoute> {
  const { connection, pool, inputMint, outputMint, amount, slippageBps, vaultPda } = args;

  // Determine which side is mint A vs mint B in the pool.
  const inputIsA = inputMint.equals(pool.mintA);
  if (!inputIsA && !inputMint.equals(pool.mintB)) {
    throw new Error(
      `inputMint ${inputMint.toBase58()} is not part of pool ${pool.poolId.toBase58()}`,
    );
  }
  const inputVault = inputIsA ? pool.vaultA : pool.vaultB;
  const outputVault = inputIsA ? pool.vaultB : pool.vaultA;

  // Fetch live reserves.
  const [inputBal, outputBal] = await Promise.all([
    connection.getTokenAccountBalance(inputVault),
    connection.getTokenAccountBalance(outputVault),
  ]);
  const inputReserve = new BN(inputBal.value.amount);
  const outputReserve = new BN(outputBal.value.amount);

  // Off-chain CPMM quote.
  const fees = await loadAmmFees(connection, pool.configId);
  const swapResult = CurveCalculator.swapBaseInput(
    new BN(amount.toString()),
    inputReserve,
    outputReserve,
    fees.tradeFeeRate,
    fees.creatorFeeRate,
    fees.protocolFeeRate,
    fees.fundFeeRate,
    /* isCreatorFeeOnInput */ false,
  );
  const expectedOut: BN =
    (swapResult as any).outputAmount ??
    (swapResult as any).destinationAmountSwapped ??
    (swapResult as any).outAmount;
  if (!expectedOut || !BN.isBN(expectedOut)) {
    throw new Error(
      `CurveCalculator returned no outputAmount; keys=${Object.keys(swapResult ?? {}).join(",")}`,
    );
  }

  // Apply the additional slippage tolerance: amountOutMin = expected * (1 - slippageBps).
  const amountOutMin = expectedOut
    .muln(10_000 - slippageBps)
    .divn(10_000);

  // Vault's source/destination ATAs.
  const userInputAccount = getAssociatedTokenAddressSync(inputMint, vaultPda, true);
  const userOutputAccount = getAssociatedTokenAddressSync(outputMint, vaultPda, true);

  // Build the swap ix. The "payer" is the source ATA owner (the vault PDA),
  // and Raydium delegates token-program transfer authority to the payer
  // signature — which is exactly what our `invoke_signed` provides.
  const ix: TransactionInstruction = makeSwapCpmmBaseInInstruction(
    pool.programId,
    vaultPda,
    pool.authority,
    pool.configId,
    pool.poolId,
    userInputAccount,
    userOutputAccount,
    inputVault,
    outputVault,
    TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    inputMint,
    outputMint,
    pool.observation,
    new BN(amount.toString()),
    amountOutMin,
  );

  // The Raydium swap ix marks the "payer" (vault PDA) as isSigner=true so
  // the SPL token program can debit the source ATA. The vault program's
  // execute_trade handler signs for it via invoke_signed using the vault's
  // PDA seeds — so we must NOT propagate isSigner=true into the outer tx,
  // or solana-runtime will reject the tx for missing a real signature.
  // execute_trade.rs flips is_signer back to true for the vault PDA before
  // building the inner CPI, restoring the correct AccountMeta shape.
  const remainingAccounts: AccountMeta[] = ix.keys.map((k) => ({
    pubkey: k.pubkey,
    isSigner: k.pubkey.equals(vaultPda) ? false : k.isSigner,
    isWritable: k.isWritable,
  }));
  const destStr = userOutputAccount.toBase58();
  const destinationAtaIndex = remainingAccounts.findIndex(
    (a) => a.pubkey.toBase58() === destStr,
  );
  if (destinationAtaIndex < 0) {
    throw new Error(
      `Raydium swap ix did not include destination ATA ${destStr}`,
    );
  }

  return {
    quote: { outAmount: expectedOut.toString() },
    dexRouteData: Buffer.from(ix.data),
    destinationAtaIndex,
    remainingAccounts,
    addressLookupTableAddresses: [],
  };
}
