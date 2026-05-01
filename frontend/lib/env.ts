// Environment-variable accessors. Two distinct sets:
//
//   - SERVER (process.env.*) — used by API routes that talk to RPC with
//     write or rate-limited credentials. Never sent to the browser.
//   - CLIENT (NEXT_PUBLIC_*) — embedded in the bundle. Public RPC URL,
//     public program ID.
//
// Defaults aim to make the dev experience cheap: the public Solana
// devnet endpoint works for reads without an API key.

import { PublicKey } from "@solana/web3.js";

export const CLIENT_RPC_URL: string =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export const CLUSTER: string = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_SPECTRAQ_PROGRAM_ID ??
    "96fHw6FzHUB8gAPPUUWRpyZuWo2NRPHJtJYcm7ERfugN",
);

// Devnet USDC mint (Circle's faucet-issued devnet USDC).
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

// Wrapped SOL — same mint on every cluster.
export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

// Vault admin pubkey — used to derive the vault PDA. The vault admin is
// the keypair that called `initialize_vault` (separate from the program
// upgrade authority by design). Pulled from `.env.demo` ADMIN_PUBKEY.
export const VAULT_ADMIN = new PublicKey(
  process.env.NEXT_PUBLIC_VAULT_ADMIN ??
    "7jZq8iHEEFiPJJCo4araesoi5obvPYMa3SZ68atAA9Eb",
);

// Server-only RPC URL with the write/Helius API key. Falls back to the
// public client URL so reads still work in dev without secrets.
export function serverRpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? CLIENT_RPC_URL;
}

// Explorer URL prefix for the active cluster.
export function explorerTxUrl(signature: string): string {
  const cluster = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

export function explorerAddrUrl(addr: string): string {
  const cluster = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`;
  return `https://explorer.solana.com/address/${addr}${cluster}`;
}
