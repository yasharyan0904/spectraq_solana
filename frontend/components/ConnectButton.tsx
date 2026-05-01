"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

/**
 * Thin wrapper so any cosmetic adjustments live in one place. The
 * adapter component already handles connect/connected state internally.
 */
export function ConnectButton() {
  return <WalletMultiButton />;
}
