"use client";

import { useMemo } from "react";
import * as anchor from "@coral-xyz/anchor";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";

import { IDL } from "@/lib/anchor";

/**
 * Returns an Anchor `Program` bound to the connected wallet's
 * `AnchorWallet`. Returns `null` if the wallet is not yet connected
 * (most read-only flows can use the API routes instead).
 */
export function useAnchorProgram(): anchor.Program | null {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    return new anchor.Program(IDL, provider);
  }, [connection, wallet]);
}
