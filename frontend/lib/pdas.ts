// Vault PDA derivation. Mirrors the seeds in
// programs/spectraq_vault/src/state/constants.rs.

import { PublicKey } from "@solana/web3.js";

import { PROGRAM_ID, VAULT_ADMIN } from "./env";

const enc = (s: string) => new TextEncoder().encode(s);

export const VAULT_SEED = enc("vault");
export const POSITION_SEED = enc("position");
export const SHARE_MINT_SEED = enc("share_mint");

export function vaultPda(admin: PublicKey = VAULT_ADMIN): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, admin.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

export function shareMintPda(vault: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SHARE_MINT_SEED, vault.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

export function userPositionPda(vault: PublicKey, user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [POSITION_SEED, vault.toBuffer(), user.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}
