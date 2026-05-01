import anchor from "@coral-xyz/anchor";
import type { Program, Wallet } from "@coral-xyz/anchor";
const { BN } = anchor;
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  awaitComputationFinalization,
  createPacker,
  deserializeLE,
  getArciumAccountBaseSeed,
  getArciumProgram,
  getArciumProgramId,
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
  uploadCircuit,
  x25519,
} from "@arcium-hq/client";
import type { FieldInfo } from "@arcium-hq/client";
import { randomBytes } from "crypto";
import * as fs from "fs";
import { assert } from "chai";

import type { SpectraqVault } from "../target/types/spectraq_vault";

// ============================================================================
// 02_arcium.ts — end-to-end Arcium MPC test for the compute_ma_signal circuit.
//
// Steps per `it`:
//   1. Build a synthetic 50-price window (rising or flat).
//   2. Encrypt prices under a fresh agent x25519 keypair (Shared cipher with
//      the MXE pubkey) and params under the MXE key.
//   3. Call `request_signal_computation`.
//   4. Wait for the cluster to finalize (60 s budget).
//   5. Re-fetch vault_state and assert `last_signal == expected`.
//
// PRECONDITIONS to run (do these once, then `pnpm test:vault:arcium`):
//   bash scripts/init-mxe.sh             # arcium build + arcium deploy
//   anchor test --skip-deploy            # picks up this test, which uploads
//                                          the circuit + inits comp def
// ============================================================================

const VAULT_SEED = Buffer.from("vault");
const SHARE_MINT_SEED = Buffer.from("share_mint");
const ARCIUM_DEVNET_OFFSET = 456;
const COMPUTE_MA_SIGNAL = "compute_ma_signal";
const PRICE_CT_LEN = 17;
const PARAM_CT_LEN = 3;
const CALLBACK_TIMEOUT_MS = 60_000;

// `Pack<[u64; 50]>` mirrored as 50 indexed u64 fields. createPacker handles the
// base-field packing so the byte layout matches the circuit's `Pack::unpack()`.
const priceFields: FieldInfo[] = Array.from({ length: 50 }, (_, i) => ({
  name: `prices[${i}]`,
  type: { Integer: { signed: false, width: 64 } },
}));
const pricesPacker = createPacker(priceFields, "PriceWindow");

// StrategyParams { fast_n: u8, slow_n: u8, threshold_bps: i16 } — 3 ciphertexts.
const paramsFields: FieldInfo[] = [
  { name: "fast_n", type: { Integer: { signed: false, width: 8 } } },
  { name: "slow_n", type: { Integer: { signed: false, width: 8 } } },
  { name: "threshold_bps", type: { Integer: { signed: true, width: 16 } } },
];
const paramsPacker = createPacker(paramsFields, "StrategyParams");

describe("spectraq_vault — Arcium MPC", function () {
  this.timeout(180_000); // includes the 60 s callback budget × 2 + setup

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SpectraqVault as Program<SpectraqVault>;
  const arciumProgram = getArciumProgram(provider as anchor.AnchorProvider);
  const connection = provider.connection;

  const payer = (provider.wallet as Wallet).payer;
  // Fresh admin per run keeps the [b"vault", admin] PDA distinct so re-runs
  // against the same deployed program do not collide on `initialize_vault`.
  const admin = Keypair.generate();
  const agent = Keypair.generate();

  let vaultStatePda: PublicKey;
  let vaultStateBump: number;
  let mxePublicKey: Uint8Array;

  before(async () => {
    // Fund admin and agent.
    const fundTx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: admin.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      }),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: agent.publicKey,
        lamports: 0.5 * LAMPORTS_PER_SOL,
      }),
    );
    await provider.sendAndConfirm(fundTx);

    [vaultStatePda, vaultStateBump] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, admin.publicKey.toBuffer()],
      program.programId,
    );
    const [shareMintPda] = PublicKey.findProgramAddressSync(
      [SHARE_MINT_SEED, vaultStatePda.toBuffer()],
      program.programId,
    );

    // Bare-minimum vault init so the vault PDA exists and is in `Idle`.
    // We don't deposit/trade here — only signal flow is under test.
    const dummyUsdcMint = await import("@solana/spl-token").then((spl) =>
      spl.createMint(connection, payer, payer.publicKey, null, 6),
    );
    const dummySolMint = await import("@solana/spl-token").then((spl) =>
      spl.createMint(connection, payer, payer.publicKey, null, 9),
    );
    const usdcVaultAta = await import("@solana/spl-token").then((spl) =>
      spl.getAssociatedTokenAddressSync(dummyUsdcMint, vaultStatePda, true),
    );
    const solVaultAta = await import("@solana/spl-token").then((spl) =>
      spl.getAssociatedTokenAddressSync(dummySolMint, vaultStatePda, true),
    );
    // SOL/USD Pyth feed id (32-byte hex). Required by initializeVault — the
    // vault stores it and deposit_sol enforces matching feed.
    const solUsdFeedId = Array.from(
      Buffer.from(
        "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
        "hex",
      ),
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

    // Init the comp def and upload the circuit (idempotent — skip if exists).
    await ensureMaSignalCompDef(program, admin);

    // Fetch MXE pubkey for client-side encryption (post-init-mxe).
    mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId,
    );
    console.log("[02_arcium] MXE x25519 pubkey:", Buffer.from(mxePublicKey).toString("hex"));
  });

  it("rising prices → signal = 1", async () => {
    const prices = makeRisingPrices();
    const signal = await runOneShot(prices);
    assert.equal(signal, 1, "rising window should cross fast > slow");
  });

  it("flat prices → signal = 0", async () => {
    const prices = new Array<bigint>(50).fill(BigInt(100_000_000));
    const signal = await runOneShot(prices);
    assert.equal(signal, 0, "flat window should not cross");
  });

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  async function runOneShot(prices: bigint[]): Promise<number> {
    assert.equal(prices.length, 50);

    // Fresh client x25519 + nonces per call (mirrors hello_world pattern).
    const privKey = x25519.utils.randomSecretKey();
    const pubKey = x25519.getPublicKey(privKey);
    const sharedSecret = x25519.getSharedSecret(privKey, mxePublicKey);
    const sharedCipher = new RescueCipher(sharedSecret);

    const noncePrices = randomBytes(16);
    const nonceParams = randomBytes(16);

    // `Pack<[u64; 50]>` → 17 base-field elements. Use the official packer
    // so the byte layout matches what Arcis unpacks inside the circuit.
    const priceData: Record<string, bigint> = {};
    for (let i = 0; i < 50; i++) priceData[`prices[${i}]`] = prices[i];
    const pricesPacked = pricesPacker.pack(priceData as any);
    const pricesCiphertexts = sharedCipher.encrypt(pricesPacked, noncePrices);
    assert.equal(
      pricesCiphertexts.length,
      PRICE_CT_LEN,
      `expected ${PRICE_CT_LEN} price ciphertexts, got ${pricesCiphertexts.length}`,
    );

    // StrategyParams { fast_n: 10, slow_n: 30, threshold_bps: 0 } → 3 ciphertexts
    // Use the same packer pattern; threshold_bps is i16 (signed).
    const paramsPacked = paramsPacker.pack({
      fast_n: BigInt(10),
      slow_n: BigInt(30),
      threshold_bps: BigInt(0),
    } as any);
    // MXE-encryption of static params: hello_world precedent — use the cluster's
    // MXE pubkey as the shared secret. The cluster decrypts under its MXE key.
    const mxeCipher = new RescueCipher(mxePublicKey);
    const paramsCiphertexts = mxeCipher.encrypt(paramsPacked, nonceParams);
    assert.equal(paramsCiphertexts.length, PARAM_CT_LEN);

    const computationOffset = new BN(randomBytes(8), "hex");

    const queueSig = await program.methods
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
        computationAccount: getComputationAccAddress(
          ARCIUM_DEVNET_OFFSET,
          computationOffset,
        ),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset(COMPUTE_MA_SIGNAL)).readUInt32LE(),
        ),
        clusterAccount: getClusterAccAddress(ARCIUM_DEVNET_OFFSET),
      })
      .signers([agent])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("[02_arcium] queue sig:", queueSig);

    // Poll until the cluster's callback lands (vault.signal_state → Ready).
    await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed",
    );
    // Allow up to CALLBACK_TIMEOUT_MS for the on-chain state to reflect the
    // callback (the finalization helper returns once the comp_account flips,
    // but our callback is a separate ix — give it a few extra slots).
    const deadline = Date.now() + CALLBACK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const v = (await (program.account as any).vaultState.fetch(vaultStatePda)) as any;
      // signal_state is an enum: 0 = Idle, 1 = Pending, 2 = Ready.
      if ((v.signalState as any).ready !== undefined) {
        // Reset back to Idle for the next iteration. We do this by force —
        // there is no public ix; fetch + re-init is overkill, so the tests
        // sequence relies on the callback writing Ready and the next call
        // queueing again from Idle. Therefore each `it` resets via a fresh
        // request only when the prior one finalized AND we land in Ready.
        return v.lastSignal as number;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error("timed out waiting for callback to land");
  }
});

// ---------------------------------------------------------------------------
// init_ma_signal_comp_def + uploadCircuit (idempotent).
// ---------------------------------------------------------------------------
async function ensureMaSignalCompDef(
  program: Program<any>,
  owner: Keypair,
): Promise<void> {
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const arciumProgram = getArciumProgram(provider);
  const baseSeed = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const offset = getCompDefAccOffset(COMPUTE_MA_SIGNAL);
  const compDefPda = PublicKey.findProgramAddressSync(
    [baseSeed, program.programId.toBuffer(), offset],
    getArciumProgramId(),
  )[0];

  const mxe = getMXEAccAddress(program.programId);
  const mxeAcc = await arciumProgram.account.mxeAccount.fetch(mxe);
  const lut = getLookupTableAddress(program.programId, mxeAcc.lutOffsetSlot);

  const existing = await provider.connection.getAccountInfo(compDefPda);
  if (!existing) {
    await (program.methods as any)
      .initMaSignalCompDef()
      .accounts({
        payer: owner.publicKey,
        compDefAccount: compDefPda,
        mxeAccount: mxe,
        addressLookupTable: lut,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });
    console.log("[02_arcium] init_ma_signal_comp_def OK");
  } else {
    console.log("[02_arcium] comp def already exists — skip init");
  }

  // Always (re)upload the circuit — `uploadCircuit` is idempotent.
  const raw = fs.readFileSync("build/compute_ma_signal.arcis");
  await uploadCircuit(
    provider,
    COMPUTE_MA_SIGNAL,
    program.programId,
    raw,
    true,
    5,
    {
      skipPreflight: true,
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    },
  );
  console.log("[02_arcium] uploadCircuit OK");
}

// ---------------------------------------------------------------------------
// MXE pubkey fetch with backoff. The cluster takes a few minutes to publish
// its key right after `arcium deploy`, so we retry up to 80 s.
// ---------------------------------------------------------------------------
async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries = 40,
  delayMs = 2000,
): Promise<Uint8Array> {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      const pk = await getMXEPublicKey(provider, programId);
      if (pk) return pk;
    } catch (e) {
      console.log(`[02_arcium] getMXEPublicKey attempt ${i}: ${e}`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`getMXEPublicKey failed after ${maxRetries} retries`);
}

// ---------------------------------------------------------------------------
// Synthetic price series helpers.
// ---------------------------------------------------------------------------
function makeRisingPrices(): bigint[] {
  // Baseline 100.0 USDC/SOL, last 10 ramp 120→129.
  const out = new Array<bigint>(50).fill(BigInt(100_000_000));
  for (let i = 40; i < 50; i++) {
    out[i] = BigInt(120_000_000 + (i - 40) * 1_000_000);
  }
  return out;
}

