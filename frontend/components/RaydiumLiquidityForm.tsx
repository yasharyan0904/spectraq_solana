"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { Card } from "./Card";
import { TxStatusModal, type TxStatus } from "./TxStatusModal";
import { VAULT_ADMIN } from "@/lib/env";
import { formatSol, formatUsdc } from "@/lib/format";
import { useAddRaydiumLiquidity } from "@/lib/hooks/useAddRaydiumLiquidity";
import type { RaydiumPoolView } from "@/lib/hooks/useRaydiumPool";

interface Props {
  pool: RaydiumPoolView | null | undefined;
}

/**
 * Admin-gated form for topping up the Raydium CPMM pool the agent trades
 * through. The user enters a USDC amount; the matching wSOL amount is
 * derived from the live `wsolReserve / usdcReserve` ratio. Non-admin
 * wallets see a read-only banner explaining why the form is disabled.
 */
export function RaydiumLiquidityForm({ pool }: Props) {
  const { publicKey, connected } = useWallet();
  const isAdmin = Boolean(publicKey && publicKey.equals(VAULT_ADMIN));
  const { mutateAsync, isPending } = useAddRaydiumLiquidity();

  const [usdcInput, setUsdcInput] = useState("");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live preview of the matching wSOL deposit + LP tokens minted.
  const preview = useMemo(() => {
    if (!pool || !pool.lpSupply) return null;
    const usdcAmt = parseFloat(usdcInput);
    if (!isFinite(usdcAmt) || usdcAmt <= 0) return null;
    const usdcE6 = BigInt(Math.round(usdcAmt * 1_000_000));
    const usdcReserve = BigInt(pool.usdcReserve);
    const wsolReserve = BigInt(pool.wsolReserve);
    const lpSupply = BigInt(pool.lpSupply);
    if (usdcReserve === 0n) return null;
    const wsolLamports = (usdcE6 * wsolReserve) / usdcReserve;
    const lpAmount = (usdcE6 * lpSupply) / usdcReserve;
    return { usdcE6, wsolLamports, lpAmount };
  }, [pool, usdcInput]);

  const submit = async () => {
    if (!preview || !pool) return;
    setTxStatus("pending");
    setErrorMsg(null);
    setSignature(null);
    try {
      const res = await mutateAsync({ pool, usdcAmount: preview.usdcE6 });
      setSignature(res.signature);
      setTxStatus("success");
      setUsdcInput("");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setTxStatus("error");
    }
  };

  return (
    <>
      <Card
        title="Add liquidity"
        subtitle="Top up pool reserves so the agent can keep routing trades"
      >
        <div className="space-y-5">
          {!connected && (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-muted)]">
              Connect a wallet to deposit. Only the vault admin can add
              liquidity from this UI.
            </div>
          )}
          {connected && !isAdmin && (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-muted)]">
              This wallet is not the vault admin — pool top-ups are
              restricted. Connect{" "}
              <span className="mono">{VAULT_ADMIN.toBase58().slice(0, 4)}…
              {VAULT_ADMIN.toBase58().slice(-4)}</span>{" "}
              to enable.
            </div>
          )}

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                USDC to deposit
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 focus-within:border-[var(--color-brand)]">
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={usdcInput}
                onChange={(e) => setUsdcInput(e.target.value)}
                className="mono flex-1 bg-transparent text-lg outline-none"
                disabled={!isAdmin}
              />
              <span className="mono text-sm text-[var(--color-muted)]">USDC</span>
            </div>
          </div>

          {preview && (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                Matching wSOL (auto-wrapped from your SOL)
              </div>
              <div className="mono mt-1 text-lg">
                {formatSol(preview.wsolLamports)}
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                LP tokens minted (estimate)
              </div>
              <div className="mono mt-1 text-sm">
                {(Number(preview.lpAmount) / 1_000_000_000).toFixed(6)}
              </div>
            </div>
          )}

          <button
            onClick={submit}
            disabled={!isAdmin || !preview || isPending || !pool?.lpMint}
            className="w-full rounded-md bg-[var(--color-brand)] py-3 font-medium text-white transition-all hover:bg-[var(--color-brand-dim)] disabled:cursor-not-allowed disabled:bg-[var(--color-border)] disabled:text-[var(--color-muted)]"
          >
            {!isAdmin
              ? "Admin wallet required"
              : isPending
                ? "Submitting…"
                : "Approve & deposit liquidity"}
          </button>

          {pool && (
            <p className="text-[11px] text-[var(--color-muted)]">
              Pool ratio:{" "}
              <span className="mono">
                {formatSol(BigInt(pool.wsolReserve))} wSOL ·{" "}
                {formatUsdc(BigInt(pool.usdcReserve))}
              </span>
            </p>
          )}
        </div>
      </Card>

      <TxStatusModal
        status={txStatus}
        signature={signature}
        error={errorMsg}
        message={
          txStatus === "pending"
            ? "Approve the liquidity deposit in your wallet…"
            : txStatus === "success"
              ? "Liquidity added. Pool reserves should refresh shortly."
              : undefined
        }
        onClose={() => setTxStatus("idle")}
      />
    </>
  );
}
