// Arcium signal client for the agent.
//
// Two modes (selected via config.mockMpc):
//
//   MOCK_MPC=true:
//     - Compute MA crossover in TypeScript via `mockComputeSignal`.
//     - Stamp the result on-chain via `vault.mock_callback_signal` (gated
//       by the `mock-mpc` feature flag in the program). The agent keypair
//       is the signer.
//
//   MOCK_MPC=false:
//     - Encrypt the 50-tick window with the agent's x25519 + the MXE pubkey.
//     - Submit via `vault.request_signal_computation` with a fresh
//       `computation_offset`.
//     - Poll `vault_state.signal_state` until it flips to Ready, return
//       the plaintext `last_signal`.
//
// Both modes leave vault state in the same shape (`signal_state == Ready`,
// `last_signal ∈ {-1, 0, 1}`) so `trader.ts` does not need to know which
// path produced the signal.

import { setTimeout as delay } from "node:timers/promises";
import { randomBytes } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import anchor from "@coral-xyz/anchor";
import {
  createPacker,
  deserializeLE,
  getMXEAccAddress,
  getMXEPublicKey,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getClusterAccAddress,
  RescueCipher,
  x25519,
} from "@arcium-hq/client";
import type { FieldInfo } from "@arcium-hq/client";

const { BN } = anchor;

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export type Signal = -1 | 0 | 1;

export interface ArciumDeps {
  /** Anchor program for `spectraq_vault`. Loosely typed (`any`) to avoid the
   * ts-mocha deep-instantiation issue we hit in the tests. */
  program: anchor.Program<any>;
  connection: Connection;
  agent: Keypair;
  vaultPda: PublicKey;
  /** Cluster offset (456 on devnet). */
  clusterOffset: number;
  /** Strategy params shipped alongside the prices in the encrypted blob. */
  strategy: { fastN: number; slowN: number; thresholdBps: number };
}

// -----------------------------------------------------------------------------
// MOCK_MPC=true path — pure-TS MA crossover + on-chain mock_callback_signal.
// -----------------------------------------------------------------------------

/**
 * Reference implementation of the Arcis circuit's MA-crossover logic.
 * Mirrors `programs/spectraq_vault/src/oracle.rs::ma_signal_reference` and
 * `encrypted-ixs/src/lib.rs::compute_ma_signal` so MOCK_MPC=true and the
 * real MPC path produce IDENTICAL signals on the same input.
 *
 * Long-only Mode 1: returns 0 or 1 (never -1).
 *
 * Cross-multiplication form (no division), in u128 arithmetic:
 *   fast_avg > slow_avg * (1 + th/10000)
 *   ⇔ fast_sum * SLOW_N * 10000 > slow_sum * FAST_N * (10000 + th)
 */
export function mockComputeSignal(
  pricesE6: bigint[],
  fastN: number,
  slowN: number,
  thresholdBps: number,
): Signal {
  if (pricesE6.length !== 50) {
    throw new Error(`mockComputeSignal expects 50 prices, got ${pricesE6.length}`);
  }
  if (fastN <= 0 || slowN <= fastN || slowN > 50) {
    throw new Error(`mockComputeSignal invalid window sizes (fast=${fastN}, slow=${slowN})`);
  }
  let fastSum = 0n;
  for (let i = 50 - fastN; i < 50; i++) fastSum += pricesE6[i]!;
  let slowSum = 0n;
  for (let i = 50 - slowN; i < 50; i++) slowSum += pricesE6[i]!;

  const threshU = thresholdBps > 0 ? BigInt(thresholdBps) : 0n;
  const factor = 10_000n + threshU;
  const left = fastSum * BigInt(slowN) * 10_000n;
  const right = slowSum * BigInt(fastN) * factor;
  // Mode 1 long-only tristate: 1 = long SOL, -1 = flat (sell). The on-chain
  // execute_trade enforces SolToUsdc requires last_signal == -1, so emitting
  // 0 here would jam every sell with SignalDirectionMismatch (6008).
  return left > right ? 1 : -1;
}

/**
 * MOCK_MPC=true: stamp the signal on-chain via `mock_callback_signal`.
 * No encryption, no Arcium round-trip. Returns the signal we just wrote.
 */
export async function stampMockSignal(
  deps: ArciumDeps,
  signal: Signal,
): Promise<Signal> {
  await (deps.program.methods as any)
    .mockCallbackSignal(signal)
    .accounts({
      authority: deps.agent.publicKey,
      vaultState: deps.vaultPda,
    })
    .signers([deps.agent])
    .rpc({ commitment: "confirmed" });
  return signal;
}

// -----------------------------------------------------------------------------
// MOCK_MPC=false path — real Arcium request + poll-for-ready.
// -----------------------------------------------------------------------------

const COMPUTE_MA_SIGNAL = "compute_ma_signal";
const PRICE_CT_LEN = 17;
const PARAM_CT_LEN = 3;

const priceFields: FieldInfo[] = Array.from({ length: 50 }, (_, i) => ({
  name: `prices[${i}]`,
  type: { Integer: { signed: false, width: 64 } },
}));
const pricesPacker = createPacker(priceFields, "PriceWindow");

const paramsFields: FieldInfo[] = [
  { name: "fast_n", type: { Integer: { signed: false, width: 8 } } },
  { name: "slow_n", type: { Integer: { signed: false, width: 8 } } },
  { name: "threshold_bps", type: { Integer: { signed: true, width: 16 } } },
];
const paramsPacker = createPacker(paramsFields, "StrategyParams");

/**
 * MXE pubkey is fetched once and cached here. The cluster only rotates it
 * on `arcium init-mxe --resume` operations.
 */
let cachedMxePubkey: Uint8Array | null = null;

async function getMxePubkeyOnce(
  connection: Connection,
  programId: PublicKey,
): Promise<Uint8Array> {
  if (cachedMxePubkey) return cachedMxePubkey;
  const provider = new anchor.AnchorProvider(
    connection,
    // dummy wallet — getMXEPublicKey only reads
    { publicKey: programId, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t } as any,
    {},
  );
  const pk = await getMXEPublicKey(provider, programId);
  if (!pk) throw new Error("MXE pubkey not yet published — has arcium deploy completed?");
  cachedMxePubkey = pk;
  return pk;
}

/**
 * MOCK_MPC=false: encrypt the price window + strategy params, submit via
 * `request_signal_computation`. Returns the freshly-generated computation
 * offset — `awaitSignal` polls vault state until that offset's callback
 * lands and returns the resulting plaintext signal.
 */
export async function requestSignal(
  deps: ArciumDeps,
  pricesE6: bigint[],
): Promise<{ computationOffset: anchor.BN }> {
  if (pricesE6.length !== 50) {
    throw new Error(`requestSignal expects 50 prices, got ${pricesE6.length}`);
  }
  const mxePubkey = await getMxePubkeyOnce(deps.connection, deps.program.programId);

  const privKey = x25519.utils.randomSecretKey();
  const pubKey = x25519.getPublicKey(privKey);
  const sharedSecret = x25519.getSharedSecret(privKey, mxePubkey);
  const sharedCipher = new RescueCipher(sharedSecret);
  const mxeCipher = new RescueCipher(mxePubkey);

  const noncePrices = randomBytes(16);
  const nonceParams = randomBytes(16);

  const priceData: Record<string, bigint> = {};
  for (let i = 0; i < 50; i++) priceData[`prices[${i}]`] = pricesE6[i]!;
  const pricesPacked = pricesPacker.pack(priceData as any);
  const pricesCiphertexts = sharedCipher.encrypt(pricesPacked, noncePrices);
  if (pricesCiphertexts.length !== PRICE_CT_LEN) {
    throw new Error(`expected ${PRICE_CT_LEN} price cts, got ${pricesCiphertexts.length}`);
  }

  const paramsPacked = paramsPacker.pack({
    fast_n: BigInt(deps.strategy.fastN),
    slow_n: BigInt(deps.strategy.slowN),
    threshold_bps: BigInt(deps.strategy.thresholdBps),
  } as any);
  const paramsCiphertexts = mxeCipher.encrypt(paramsPacked, nonceParams);
  if (paramsCiphertexts.length !== PARAM_CT_LEN) {
    throw new Error(`expected ${PARAM_CT_LEN} param cts, got ${paramsCiphertexts.length}`);
  }

  const computationOffset = new BN(randomBytes(8), "hex");
  const programId = deps.program.programId;

  await (deps.program.methods as any)
    .requestSignalComputation(
      computationOffset,
      Array.from(pubKey),
      new BN(deserializeLE(noncePrices).toString()),
      pricesCiphertexts.map((c) => Array.from(c)),
      new BN(deserializeLE(nonceParams).toString()),
      paramsCiphertexts.map((c) => Array.from(c)),
    )
    .accountsPartial({
      payer: deps.agent.publicKey,
      vaultState: deps.vaultPda,
      mxeAccount: getMXEAccAddress(programId),
      mempoolAccount: getMempoolAccAddress(deps.clusterOffset),
      executingPool: getExecutingPoolAccAddress(deps.clusterOffset),
      computationAccount: getComputationAccAddress(
        deps.clusterOffset,
        computationOffset,
      ),
      compDefAccount: getCompDefAccAddress(
        programId,
        Buffer.from(getCompDefAccOffset(COMPUTE_MA_SIGNAL)).readUInt32LE(),
      ),
      clusterAccount: getClusterAccAddress(deps.clusterOffset),
    })
    .signers([deps.agent])
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  return { computationOffset };
}

/**
 * Poll vault_state until signal_state == Ready or `timeoutMs` elapses.
 * Returns last_signal cast to {-1, 0, 1}.
 */
export async function awaitSignal(
  deps: ArciumDeps,
  timeoutMs: number,
): Promise<Signal> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = (await (deps.program.account as any).vaultState.fetch(deps.vaultPda)) as any;
    if (v.signalState && v.signalState.ready !== undefined) {
      const s = Number(v.lastSignal);
      if (s !== -1 && s !== 0 && s !== 1) {
        throw new Error(`last_signal out of bounds: ${s}`);
      }
      return s as Signal;
    }
    await delay(1500);
  }
  throw new Error(`awaitSignal timed out after ${timeoutMs}ms`);
}
