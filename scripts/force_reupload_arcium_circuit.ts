// Force-rewrite all bytes of the v2 circuit, bypassing the SDK's
// "skip if size matches" early-return. Use this when a previous uploadCircuit
// crashed mid-chunks but the resize had already grown the account so the
// SDK considers the upload done. Will write all 757 chunks (~15 min) and
// re-call finalizeComputationDefinition.
//
// Usage:
//   ANCHOR_PROVIDER_URL="$HELIUS_RPC_URL" ANCHOR_WALLET="$HOME/.config/solana/id.json" \
//   pnpm exec ts-node --transpile-only scripts/force_reupload_arcium_circuit.ts

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getArciumProgram,
  getCompDefAccOffset,
  getArciumProgramId,
  getArciumAccountBaseSeed,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const COMPUTE_MA_SIGNAL = "compute_ma_signal_v3";
const PROGRAM_ID = new PublicKey(
  process.env.SPECTRAQ_PROGRAM_ID ?? "96fHw6FzHUB8gAPPUUWRpyZuWo2NRPHJtJYcm7ERfugN",
);

const MAX_UPLOAD_PER_TX_BYTES = 814;
const RAW_CIRCUIT_INDEX = 0;
const PARALLELISM = 5;

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
        msg.includes("Block height exceeded") ||
        msg.includes("not found") ||
        msg.includes("network") ||
        msg.includes("timed out");
      if (!transient || i === attempts - 1) throw e;
      const backoff = 500 * Math.pow(2, Math.min(i, 5));
      console.log(`[retry] ${label} attempt ${i + 1}/${attempts} after ${backoff}ms — ${msg.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const conn = provider.connection;

  const arcium = getArciumProgram(provider);
  const offsetBytes = getCompDefAccOffset(COMPUTE_MA_SIGNAL);
  const offsetU32 = Buffer.from(offsetBytes).readUInt32LE();
  const compDefPda = PublicKey.findProgramAddressSync(
    [getArciumAccountBaseSeed("ComputationDefinitionAccount"), PROGRAM_ID.toBuffer(), offsetBytes],
    getArciumProgramId(),
  )[0];

  console.log("payer    :", wallet.publicKey.toBase58());
  console.log("comp_def :", compDefPda.toBase58());
  console.log("offsetU32:", offsetU32);

  const circuitPath = path.resolve("build/compute_ma_signal_v3.arcis");
  const raw = fs.readFileSync(circuitPath);
  console.log(`circuit  : ${raw.length} bytes`);

  const totalChunks = Math.ceil(raw.length / MAX_UPLOAD_PER_TX_BYTES);
  console.log(`chunks   : ${totalChunks}`);

  // Issue a probe tx (chunk 0) first; if program rejects post-finalize writes, this will fail loudly.
  console.log("\n[probe] sending chunk 0 to test if writes are allowed post-finalize...");
  const probeBytes = Buffer.alloc(MAX_UPLOAD_PER_TX_BYTES);
  raw.copy(probeBytes, 0, 0, Math.min(MAX_UPLOAD_PER_TX_BYTES, raw.length));
  try {
    const ix = await (arcium.methods as any)
      .uploadCircuit(
        offsetU32,
        PROGRAM_ID,
        RAW_CIRCUIT_INDEX,
        Array.from(probeBytes),
        0,
      )
      .accounts({ signer: wallet.publicKey })
      .instruction();
    const tx = new Transaction().add(ix);
    const block = await withRetry("blockhash", () => conn.getLatestBlockhash("confirmed"));
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = block.blockhash;
    const signed = await wallet.signTransaction(tx);
    const sig = await withRetry("send-probe", () =>
      conn.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" }),
    );
    const conf = await withRetry("confirm-probe", () =>
      conn.confirmTransaction(
        { signature: sig, blockhash: block.blockhash, lastValidBlockHeight: block.lastValidBlockHeight },
        "confirmed",
      ),
    );
    if (conf.value.err) {
      console.error(`[probe] FAILED: ${JSON.stringify(conf.value.err)}`);
      console.error("Probe tx err means upload_circuit ix rejects writes post-finalize.");
      console.error("→ Cannot recover this v2 comp_def. Rename to v3 and start over.");
      process.exit(2);
    }
    console.log(`[probe] OK: ${sig}`);
  } catch (e: any) {
    console.error(`[probe] threw: ${e.message ?? e}`);
    console.error("→ Cannot recover this v2 comp_def. Rename to v3 and start over.");
    process.exit(2);
  }

  // Probe succeeded — write all 757 chunks.
  console.log(`\n[full] writing all ${totalChunks} chunks (~10 min)...`);
  let lastBlock = await withRetry("blockhash-init", () => conn.getLatestBlockhash("confirmed"));
  let lastBlockAt = Date.now();

  let i = 0;
  let nextLog = 0;
  while (i < totalChunks) {
    const batch = [] as Promise<string>[];
    for (let j = 0; j < PARALLELISM && i + j < totalChunks; j++) {
      const idx = i + j;
      const off = idx * MAX_UPLOAD_PER_TX_BYTES;
      const slice = Buffer.alloc(MAX_UPLOAD_PER_TX_BYTES);
      raw.copy(slice, 0, off, Math.min(off + MAX_UPLOAD_PER_TX_BYTES, raw.length));

      batch.push((async () => {
        const ix = await (arcium.methods as any)
          .uploadCircuit(offsetU32, PROGRAM_ID, RAW_CIRCUIT_INDEX, Array.from(slice), off)
          .accounts({ signer: wallet.publicKey })
          .instruction();
        const tx = new Transaction().add(ix);
        // refresh blockhash every 30s to avoid expiry under heavy load
        if (Date.now() - lastBlockAt > 30_000) {
          lastBlock = await withRetry("blockhash-refresh", () => conn.getLatestBlockhash("confirmed"));
          lastBlockAt = Date.now();
        }
        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = lastBlock.blockhash;
        const signed = await wallet.signTransaction(tx);
        const sig = await withRetry(`send-${idx}`, () =>
          conn.sendRawTransaction(signed.serialize(), {
            skipPreflight: true,
            preflightCommitment: "confirmed",
            maxRetries: 3,
          }),
        );
        const conf = await withRetry(`confirm-${idx}`, () =>
          conn.confirmTransaction(
            { signature: sig, blockhash: lastBlock.blockhash, lastValidBlockHeight: lastBlock.lastValidBlockHeight },
            "confirmed",
          ),
        );
        if (conf.value.err) {
          throw new Error(`chunk ${idx} failed on-chain: ${JSON.stringify(conf.value.err)}`);
        }
        return sig;
      })());
    }
    await Promise.all(batch);
    i += batch.length;
    if (i >= nextLog || i === totalChunks) {
      console.log(`[progress] ${i}/${totalChunks} chunks written`);
      nextLog = i + 50;
    }
  }

  console.log("\n[finalize] re-finalizing comp def...");
  const finalSig = await (arcium.methods as any)
    .finalizeComputationDefinition(offsetU32, PROGRAM_ID)
    .accounts({ signer: wallet.publicKey })
    .rpc({ commitment: "confirmed", skipPreflight: false });
  console.log(`[finalize] OK: ${finalSig}`);

  console.log("\nDone — all chunks rewritten and finalize re-issued.");
}

main().catch((e) => { console.error(e); process.exit(1); });
