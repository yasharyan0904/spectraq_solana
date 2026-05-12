// One-time setup: upload the compute_ma_signal_v3 circuit to the Arcium
// cluster. Run this AFTER `arcium init-mxe` and init_ma_signal_comp_def,
// BEFORE running the 02_arcium.ts test.
//
// Usage:
//   ANCHOR_PROVIDER_URL="$HELIUS_RPC_URL" ANCHOR_WALLET="$HOME/.config/solana/id.json" \
//   ts-node --transpile-only scripts/upload_arcium_circuit.ts
//
// Takes ~10 minutes (757 chunks × 3783 txs). Safe to re-run — uploadCircuit is
// idempotent against the same comp-def state.

import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  uploadCircuit,
  getArciumAccountBaseSeed,
  getArciumProgram,
  getArciumProgramId,
  getCompDefAccOffset,
  getLookupTableAddress,
  getMXEAccAddress,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

import type { SpectraqVault } from "../target/types/spectraq_vault";

dotenv.config();

// Anchor 0.32.1 is incompatible with @solana/web3.js 1.95.4: when a tx fails
// to confirm, Anchor wraps the error with `new SendTransactionError(msg, logs)`
// (old positional API), but web3.js >= 1.95 expects an object. Result: the
// real error is masked as "Unknown action 'undefined'" with no signature.
// We replace AnchorProvider.sendAndConfirm with a minimal version that signs,
// sends raw, and confirms via blockhash, surfacing the actual on-chain error.
// Helius (and most public RPCs) will 429 / drop sockets under sustained load.
// All transient retries live here so the upper-level uploadCircuit logic
// doesn't have to know about them.
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 8): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      const transient =
        msg.includes("fetch failed") ||
        msg.includes("429") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("socket hang up") ||
        msg.includes("Too Many Requests") ||
        msg.includes("blockhash") ||
        msg.includes("not found") ||
        msg.includes("network") ||
        msg.includes("timed out") ||
        msg.includes("Block height exceeded");
      if (!transient || i === attempts - 1) throw e;
      const backoff = 500 * Math.pow(2, Math.min(i, 5)); // 0.5,1,2,4,8,16,16,16
      console.log(`[retry] ${label} attempt ${i + 1}/${attempts} after ${backoff}ms — ${msg.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

function patchAnchorProvider(provider: anchor.AnchorProvider): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (provider as any).sendAndConfirm = async function (
    tx: Transaction | VersionedTransaction,
    signers: anchor.web3.Signer[] | undefined,
    opts: anchor.web3.ConfirmOptions | undefined,
  ): Promise<string> {
    const o = opts ?? this.opts ?? { commitment: "confirmed" };
    const conn = this.connection;
    if (tx instanceof VersionedTransaction) {
      if (signers) tx.sign(signers);
    } else {
      const block = await withRetry("getLatestBlockhash(prep)", () =>
        conn.getLatestBlockhash(o.preflightCommitment ?? "confirmed"),
      );
      tx.feePayer = tx.feePayer ?? this.wallet.publicKey;
      tx.recentBlockhash = block.blockhash;
      if (signers) for (const s of signers) tx.partialSign(s);
    }
    const signed = await this.wallet.signTransaction(tx);
    const raw = signed.serialize();
    const sig = await withRetry("sendRawTransaction", () =>
      conn.sendRawTransaction(raw, {
        skipPreflight: o.skipPreflight ?? true,
        preflightCommitment: o.preflightCommitment ?? "confirmed",
        maxRetries: o.maxRetries,
      }),
    );
    const block = await withRetry("getLatestBlockhash(confirm)", () =>
      conn.getLatestBlockhash(o.preflightCommitment ?? "confirmed"),
    );
    const confirm = await withRetry("confirmTransaction", () =>
      conn.confirmTransaction(
        { signature: sig, blockhash: block.blockhash, lastValidBlockHeight: block.lastValidBlockHeight },
        o.commitment ?? "confirmed",
      ),
    );
    if (confirm.value.err) {
      throw new Error(`tx ${sig} failed: ${JSON.stringify(confirm.value.err)}`);
    }
    return sig;
  };
}

const COMPUTE_MA_SIGNAL = "compute_ma_signal_v3";
const PROGRAM_ID = new PublicKey(
  process.env.SPECTRAQ_PROGRAM_ID ?? "96fHw6FzHUB8gAPPUUWRpyZuWo2NRPHJtJYcm7ERfugN",
);

async function ensureCompDef(program: Program<SpectraqVault>): Promise<boolean> {
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const arciumProgram = getArciumProgram(provider);
  const baseSeed = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const offset = getCompDefAccOffset(COMPUTE_MA_SIGNAL);
  const compDefPda = PublicKey.findProgramAddressSync(
    [baseSeed, PROGRAM_ID.toBuffer(), offset],
    getArciumProgramId(),
  )[0];

  const existing = await provider.connection.getAccountInfo(compDefPda);
  if (existing) {
    console.log(`comp_def already exists: ${compDefPda.toBase58()}`);
    return false;
  }

  const mxe = getMXEAccAddress(PROGRAM_ID);
  const mxeAcc = await arciumProgram.account.mxeAccount.fetch(mxe);
  const lut = getLookupTableAddress(PROGRAM_ID, mxeAcc.lutOffsetSlot);

  const sig = await (program.methods as any)
    .initMaSignalCompDef()
    .accounts({
      payer: provider.wallet.publicKey,
      compDefAccount: compDefPda,
      mxeAccount: mxe,
      addressLookupTable: lut,
    })
    .rpc({ commitment: "confirmed" });
  console.log(`init_ma_signal_comp_def OK: ${compDefPda.toBase58()} (sig: ${sig})`);
  return true;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  patchAnchorProvider(provider);
  anchor.setProvider(provider);
  const program = anchor.workspace.SpectraqVault as Program<SpectraqVault>;
  console.log("Payer:    ", provider.wallet.publicKey.toBase58());
  console.log("Program:  ", PROGRAM_ID.toBase58());
  console.log("Circuit:  ", COMPUTE_MA_SIGNAL);

  await ensureCompDef(program);

  const circuitPath = path.resolve("build/compute_ma_signal_v3.arcis");
  if (!fs.existsSync(circuitPath)) {
    throw new Error(`Circuit file not found: ${circuitPath}. Run \`arcium build\` first.`);
  }
  const raw = fs.readFileSync(circuitPath);
  console.log(`Circuit file: ${circuitPath} (${raw.length} bytes)`);
  console.log("Starting upload (~757 chunks) — this takes ~10 minutes...");

  await uploadCircuit(
    provider,
    COMPUTE_MA_SIGNAL,
    PROGRAM_ID,
    raw,
    true,
    5,
    {
      skipPreflight: true,
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    },
  );

  console.log("Done — circuit uploaded successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
