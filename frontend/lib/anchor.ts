// Anchor program client. The IDL ships at build time from
// `target/idl/spectraq_vault.json` (committed via the prompt-2 build).
//
// We support two callers:
//   - Browser (read-only or wallet-signed): uses the WalletContext from
//     `@solana/wallet-adapter-react`. See `useAnchorProgram` in
//     `lib/hooks/useAnchorProgram.ts`.
//   - Server (API routes, read-only): uses an unsigned dummy wallet. The
//     IDL accounts coder works without a real signer for `fetch` calls.

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import idlJson from "./idl/spectraq_vault.json";

import { PROGRAM_ID } from "./env";

// `as unknown as anchor.Idl` — the JSON shape matches but TS can't
// narrow without a generated IDL type module.
export const IDL = idlJson as unknown as anchor.Idl;

if ((IDL as { address?: string }).address !== PROGRAM_ID.toBase58()) {
  // Loud at runtime if the bundled IDL drifts from the configured
  // program id — easy to catch during dev.
  console.warn(
    `[anchor] IDL address (${(IDL as { address?: string }).address}) ` +
      `!= NEXT_PUBLIC_SPECTRAQ_PROGRAM_ID (${PROGRAM_ID.toBase58()})`,
  );
}

/** Server-only program client — read-only with a throwaway keypair. */
export function readonlyProgram(connection: Connection): anchor.Program {
  const dummy = Keypair.generate();
  const wallet: anchor.Wallet = {
    publicKey: dummy.publicKey,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
    payer: dummy,
  };
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new anchor.Program(IDL, provider);
}

export { PROGRAM_ID };
export type { anchor };
