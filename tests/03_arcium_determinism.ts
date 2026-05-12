// 03_arcium_determinism.ts — diagnostic: run the same MA-signal computation
// many times back-to-back with three different price-magnitude scales and
// record what the cluster returns. Goal: localize whether the inconsistent
// rising-prices result is value-dependent (encoding magnitude bug) or
// value-independent (cluster non-determinism).
//
// Three batches:
//   A. Rising at production scale: 100_000_000 baseline, last 10 ramp 120M..129M.
//   B. Rising at small scale:      100 baseline, last 10 ramp 120..129.
//   C. Flat at production scale:   100_000_000 across the board (control: must be 0).
//
// Reads HELIUS_RPC_URL from .env (or ANCHOR_PROVIDER_URL).
// Run:  ANCHOR_PROVIDER_URL=$HELIUS_RPC_URL pnpm exec ts-mocha -p ./tsconfig.json -t 1800000 tests/03_arcium_determinism.ts

import anchor from "@coral-xyz/anchor";
import type { Program, Wallet } from "@coral-xyz/anchor";
const { BN } = anchor;
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  MessageV0,
  VersionedTransaction,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import {
  awaitComputationFinalization,
  deserializeLE,
  getArciumProgram,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getClusterAccAddress,
  getExecutingPoolAccAddress,
  getLookupTableAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
  getMXEPublicKey,
  RescueCipher,
  x25519,
} from "@arcium-hq/client";
import { randomBytes } from "crypto";
import { assert } from "chai";

import type { SpectraqVault } from "../target/types/spectraq_vault";

const VAULT_SEED = Buffer.from("vault");
const SHARE_MINT_SEED = Buffer.from("share_mint");
const ARCIUM_DEVNET_OFFSET = 456;
const COMPUTE_MA_SIGNAL = "compute_ma_signal_v3";
const PRICE_CT_LEN = 17;
const PARAM_CT_LEN = 3;

const N_PER_BATCH = 8; // keep airtime modest; 8 × 3 batches × ~15s = ~6 min

function packPriceU64s(prices: bigint[]): bigint[] {
  const out: bigint[] = [];
  for (let i = 0; i < 50; i += 3) {
    let v = prices[i]!;
    if (i + 1 < 50) v += prices[i + 1]! << 64n;
    if (i + 2 < 50) v += prices[i + 2]! << 128n;
    out.push(v);
  }
  return out;
}
function packStrategyParams(fastN: number, slowN: number, thresholdBps: number): bigint[] {
  return [BigInt(fastN), BigInt(slowN), BigInt(thresholdBps) + 32768n];
}

function risingProd(): bigint[] {
  const out = new Array<bigint>(50).fill(BigInt(100_000_000));
  for (let i = 40; i < 50; i++) out[i] = BigInt(120_000_000 + (i - 40) * 1_000_000);
  return out;
}
function risingSmall(): bigint[] {
  const out = new Array<bigint>(50).fill(100n);
  for (let i = 40; i < 50; i++) out[i] = BigInt(120 + (i - 40));
  return out;
}
function flatProd(): bigint[] {
  return new Array<bigint>(50).fill(BigInt(100_000_000));
}

describe("spectraq_vault — determinism discriminator", function () {
  this.timeout(1_800_000); // 30 min

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SpectraqVault as Program<SpectraqVault>;
  const connection = provider.connection;
  const payer = (provider.wallet as Wallet).payer;
  const agent = Keypair.generate();

  let mxePublicKey: Uint8Array;
  let arciumLut: AddressLookupTableAccount;

  before(async () => {
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: agent.publicKey,
          lamports: 1.5 * LAMPORTS_PER_SOL,
        }),
      ),
    );

    mxePublicKey = await getMXEPublicKey(provider as anchor.AnchorProvider, program.programId);
    console.log("[03_det] MXE pubkey:", Buffer.from(mxePublicKey).toString("hex"));

    const arciumProgram = getArciumProgram(provider as anchor.AnchorProvider);
    const mxeAcc = await arciumProgram.account.mxeAccount.fetch(getMXEAccAddress(program.programId));
    const lutAddress = getLookupTableAddress(program.programId, mxeAcc.lutOffsetSlot);
    const lutResponse = await connection.getAddressLookupTable(lutAddress);
    if (!lutResponse.value) throw new Error("ALT not found");
    arciumLut = lutResponse.value;
  });

  async function freshVault(): Promise<PublicKey> {
    const admin = Keypair.generate();
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: admin.publicKey,
          lamports: 0.05 * LAMPORTS_PER_SOL,
        }),
      ),
    );

    const [vaultStatePda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, admin.publicKey.toBuffer()],
      program.programId,
    );
    const [shareMintPda] = PublicKey.findProgramAddressSync(
      [SHARE_MINT_SEED, vaultStatePda.toBuffer()],
      program.programId,
    );

    const spl = await import("@solana/spl-token");
    const dummyUsdcMint = await spl.createMint(connection, payer, payer.publicKey, null, 6);
    const dummySolMint = await spl.createMint(connection, payer, payer.publicKey, null, 9);
    const usdcVaultAta = spl.getAssociatedTokenAddressSync(dummyUsdcMint, vaultStatePda, true);
    const solVaultAta = spl.getAssociatedTokenAddressSync(dummySolMint, vaultStatePda, true);

    const solUsdFeedId = Array.from(
      Buffer.from("ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", "hex"),
    );
    await program.methods
      .initializeVault(solUsdFeedId as any)
      .accounts({
        admin: admin.publicKey,
        agent: agent.publicKey,
        vaultState: vaultStatePda,
        shareMint: shareMintPda,
        usdcMint: dummyUsdcMint,
        solMint: dummySolMint,
        usdcVault: usdcVaultAta,
        solVault: solVaultAta,
      } as any)
      .signers([admin])
      .rpc({ commitment: "confirmed" });
    return vaultStatePda;
  }

  async function runOneShot(vaultStatePda: PublicKey, prices: bigint[]): Promise<{ signal: number; sig: string }> {
    const privKey = x25519.utils.randomSecretKey();
    const pubKey = x25519.getPublicKey(privKey);
    const sharedSecret = x25519.getSharedSecret(privKey, mxePublicKey);
    const sharedCipher = new RescueCipher(sharedSecret);

    const noncePrices = randomBytes(16);
    const nonceParams = randomBytes(16);

    const pricesPacked = packPriceU64s(prices);
    const pricesCiphertexts = sharedCipher.encrypt(pricesPacked, noncePrices);
    assert.equal(pricesCiphertexts.length, PRICE_CT_LEN);

    const paramsPacked = packStrategyParams(10, 30, 0);
    const mxeCipher = new RescueCipher(mxePublicKey);
    const paramsCiphertexts = mxeCipher.encrypt(paramsPacked, nonceParams);
    assert.equal(paramsCiphertexts.length, PARAM_CT_LEN);

    const computationOffset = new BN(randomBytes(8), "hex");

    const ix = await program.methods
      .requestSignalComputation(
        computationOffset,
        Array.from(pubKey),
        new BN(deserializeLE(noncePrices).toString()),
        pricesCiphertexts.map((c) => Array.from(c)) as any,
        new BN(deserializeLE(nonceParams).toString()),
        paramsCiphertexts.map((c) => Array.from(c)) as any,
      )
      .accountsPartial({
        payer: agent.publicKey,
        vaultState: vaultStatePda,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(ARCIUM_DEVNET_OFFSET),
        executingPool: getExecutingPoolAccAddress(ARCIUM_DEVNET_OFFSET),
        computationAccount: getComputationAccAddress(ARCIUM_DEVNET_OFFSET, computationOffset),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset(COMPUTE_MA_SIGNAL)).readUInt32LE(),
        ),
        clusterAccount: getClusterAccAddress(ARCIUM_DEVNET_OFFSET),
      })
      .instruction();

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const msg = MessageV0.compile({
      payerKey: agent.publicKey,
      instructions: [ix],
      recentBlockhash: blockhash,
      addressLookupTableAccounts: [arciumLut],
    });
    const vtx = new VersionedTransaction(msg);
    vtx.sign([agent]);
    const queueSig = await connection.sendTransaction(vtx, {
      skipPreflight: true,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(
      { signature: queueSig, blockhash, lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight },
      "confirmed",
    );

    await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed",
      240_000,
    );
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const v = (await (program.account as any).vaultState.fetch(vaultStatePda)) as any;
      if ((v.signalState as any).ready !== undefined) {
        return { signal: v.lastSignal as number, sig: queueSig };
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error("timed out waiting for callback");
  }

  type Result = { idx: number; signal: number; sig: string; ms: number };

  async function runBatch(name: string, n: number, makePrices: () => bigint[]): Promise<Result[]> {
    const results: Result[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = Date.now();
      try {
        const v = await freshVault();
        const r = await runOneShot(v, makePrices());
        const ms = Date.now() - t0;
        results.push({ idx: i, signal: r.signal, sig: r.sig, ms });
        console.log(`[${name}] ${i + 1}/${n}  signal=${r.signal}  ${ms}ms  ${r.sig.slice(0, 24)}…`);
      } catch (e: any) {
        const ms = Date.now() - t0;
        results.push({ idx: i, signal: -2, sig: "ERR", ms });
        console.log(`[${name}] ${i + 1}/${n}  ERROR  ${ms}ms  ${e.message?.slice(0, 100) ?? e}`);
      }
    }
    return results;
  }

  function summarize(label: string, results: Result[]): string {
    const ones = results.filter((r) => r.signal === 1).length;
    const zeros = results.filter((r) => r.signal === 0).length;
    const errs = results.filter((r) => r.signal === -2).length;
    return `${label}: 1=${ones}  0=${zeros}  ERR=${errs}  (n=${results.length})`;
  }

  it("histogram", async function () {
    console.log("\n=== A: rising at production scale (100M..129M) ===");
    const a = await runBatch("A_prod", N_PER_BATCH, risingProd);

    console.log("\n=== B: rising at small scale (100..129) ===");
    const b = await runBatch("B_small", N_PER_BATCH, risingSmall);

    console.log("\n=== C: flat at production scale (control, expect 0) ===");
    const c = await runBatch("C_flat", Math.min(4, N_PER_BATCH), flatProd);

    console.log("\n========== SUMMARY ==========");
    console.log(summarize("A rising-prod ", a));
    console.log(summarize("B rising-small", b));
    console.log(summarize("C flat-prod   ", c));
    console.log("\nA expected: all 1s (rising should cross)");
    console.log("B expected: all 1s (same logic, smaller magnitudes)");
    console.log("C expected: all 0s (flat does not cross)");
  });
});
