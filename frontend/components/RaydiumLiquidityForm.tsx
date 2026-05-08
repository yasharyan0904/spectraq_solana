"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

import { Card } from "./Card";
import { TxStatusModal, type TxStatus } from "./TxStatusModal";
import { formatSol, formatUsdc } from "@/lib/format";
import { useAddRaydiumLiquidity } from "@/lib/hooks/useAddRaydiumLiquidity";
import { useRemoveRaydiumLiquidity } from "@/lib/hooks/useRemoveRaydiumLiquidity";
import type { RaydiumPoolView } from "@/lib/hooks/useRaydiumPool";

interface Props {
  pool: RaydiumPoolView | null | undefined;
}

type Mode = "deposit" | "withdraw";

/**
 * Pool LP form for the Raydium CPMM pool the agent trades through.
 *
 * Two modes (toggled at the top of the card):
 *   - Deposit: user types USDC amount, matching wSOL is auto-derived from
 *     pool ratio, native SOL is auto-wrapped, both sides are deposited,
 *     LP tokens are minted to the user's wallet.
 *   - Withdraw: user types LP amount (or clicks "max"), Raydium pays out
 *     proportional USDC + wSOL, the wSOL ATA is closed in the same tx so
 *     the user receives native SOL.
 *
 * The pool itself is permissionless — any wallet with USDC + SOL can LP,
 * and any LP-token holder can redeem. Vault depositors do NOT need to
 * touch this page; LP and vault shares are independent positions.
 */
export function RaydiumLiquidityForm({ pool }: Props) {
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const add = useAddRaydiumLiquidity();
  const remove = useRemoveRaydiumLiquidity();

  const [mode, setMode] = useState<Mode>("deposit");
  const [usdcInput, setUsdcInput] = useState("");
  const [lpInput, setLpInput] = useState("");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live LP balance for the connected wallet — drives the "your LP" label
  // and the "max" button on the withdraw side.
  const [userLpRaw, setUserLpRaw] = useState<bigint | null>(null);
  useEffect(() => {
    if (!publicKey || !pool?.lpMint) {
      setUserLpRaw(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ata = getAssociatedTokenAddressSync(
          new PublicKey(pool.lpMint!),
          publicKey,
        );
        const acc = await getAccount(connection, ata);
        if (!cancelled) setUserLpRaw(BigInt(acc.amount.toString()));
      } catch {
        if (!cancelled) setUserLpRaw(0n);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey, pool?.lpMint, connection, signature]);

  const lpDecimals = pool?.lpDecimals ?? 9;
  const lpScale = useMemo(() => 10n ** BigInt(lpDecimals), [lpDecimals]);
  const userLpHuman = userLpRaw === null
    ? null
    : Number(userLpRaw) / Number(lpScale);

  const depositPreview = useMemo(() => {
    if (mode !== "deposit") return null;
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
  }, [mode, pool, usdcInput]);

  const withdrawPreview = useMemo(() => {
    if (mode !== "withdraw") return null;
    if (!pool || !pool.lpSupply) return null;
    const lpAmt = parseFloat(lpInput);
    if (!isFinite(lpAmt) || lpAmt <= 0) return null;
    // Convert human → raw LP units using lpDecimals.
    const lpRaw = BigInt(Math.round(lpAmt * Number(lpScale)));
    const usdcReserve = BigInt(pool.usdcReserve);
    const wsolReserve = BigInt(pool.wsolReserve);
    const lpSupply = BigInt(pool.lpSupply);
    if (lpSupply === 0n) return null;
    const wsolLamports = (lpRaw * wsolReserve) / lpSupply;
    const usdcE6 = (lpRaw * usdcReserve) / lpSupply;
    return { lpRaw, wsolLamports, usdcE6 };
  }, [mode, pool, lpInput, lpScale]);

  const submit = async () => {
    if (!pool) return;
    setTxStatus("pending");
    setErrorMsg(null);
    setSignature(null);
    try {
      if (mode === "deposit") {
        if (!depositPreview) return;
        const res = await add.mutateAsync({
          pool,
          usdcAmount: depositPreview.usdcE6,
        });
        setSignature(res.signature);
        setUsdcInput("");
      } else {
        if (!withdrawPreview) return;
        const res = await remove.mutateAsync({
          pool,
          lpAmount: withdrawPreview.lpRaw,
        });
        setSignature(res.signature);
        setLpInput("");
      }
      setTxStatus("success");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setTxStatus("error");
    }
  };

  const isPending = add.isPending || remove.isPending;
  const canSubmit =
    connected &&
    !isPending &&
    pool?.lpMint &&
    (mode === "deposit" ? !!depositPreview : !!withdrawPreview);

  return (
    <>
      <Card
        title="Manage liquidity"
        subtitle="Deposit (mint LP) or withdraw (burn LP) on the Raydium CPMM pool"
      >
        <div className="space-y-5">
          <div className="flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 text-sm">
            {(["deposit", "withdraw"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded px-3 py-1.5 transition-colors ${
                  mode === m
                    ? "bg-[var(--color-bg)] font-medium"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                }`}
              >
                {m === "deposit" ? "Deposit" : "Withdraw"}
              </button>
            ))}
          </div>

          {!connected && (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-muted)]">
              Connect a wallet to {mode}. Raydium CPMM is permissionless —
              any wallet with USDC + SOL can deposit, and any LP-token
              holder can redeem.
            </div>
          )}

          {mode === "deposit" ? (
            <>
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
                    disabled={!connected}
                  />
                  <span className="mono text-sm text-[var(--color-muted)]">USDC</span>
                </div>
              </div>

              {depositPreview && (
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                    Matching wSOL (auto-wrapped from your SOL)
                  </div>
                  <div className="mono mt-1 text-lg">
                    {formatSol(depositPreview.wsolLamports)}
                  </div>
                  <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                    LP tokens minted (estimate)
                  </div>
                  <div className="mono mt-1 text-sm">
                    {(Number(depositPreview.lpAmount) / Number(lpScale)).toFixed(6)}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                    LP tokens to burn
                  </span>
                  {userLpHuman !== null && userLpHuman > 0 && (
                    <button
                      type="button"
                      onClick={() => setLpInput(String(userLpHuman))}
                      className="text-[11px] uppercase tracking-wider text-[var(--color-brand)] hover:underline"
                    >
                      max ({userLpHuman.toFixed(6)})
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 focus-within:border-[var(--color-brand)]">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0.000000"
                    value={lpInput}
                    onChange={(e) => setLpInput(e.target.value)}
                    className="mono flex-1 bg-transparent text-lg outline-none"
                    disabled={!connected}
                  />
                  <span className="mono text-sm text-[var(--color-muted)]">LP</span>
                </div>
              </div>

              {withdrawPreview && (
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                    You receive (estimate)
                  </div>
                  <div className="mono mt-1 text-lg">
                    {formatSol(withdrawPreview.wsolLamports)}
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      (auto-unwrapped to native SOL)
                    </span>
                  </div>
                  <div className="mono mt-1 text-lg">
                    {formatUsdc(withdrawPreview.usdcE6)}
                  </div>
                </div>
              )}
            </>
          )}

          <button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full rounded-md bg-[var(--color-brand)] py-3 font-medium text-white transition-all hover:bg-[var(--color-brand-dim)] disabled:cursor-not-allowed disabled:bg-[var(--color-border)] disabled:text-[var(--color-muted)]"
          >
            {!connected
              ? "Connect a wallet"
              : isPending
                ? "Submitting…"
                : mode === "deposit"
                  ? "Approve & deposit liquidity"
                  : "Approve & withdraw liquidity"}
          </button>

          {pool && (
            <p className="text-[11px] text-[var(--color-muted)]">
              Pool ratio:{" "}
              <span className="mono">
                {formatSol(BigInt(pool.wsolReserve))} wSOL ·{" "}
                {formatUsdc(BigInt(pool.usdcReserve))}
              </span>
              {userLpHuman !== null && userLpHuman > 0 && (
                <>
                  {" · "}your LP:{" "}
                  <span className="mono">{userLpHuman.toFixed(6)}</span>
                </>
              )}
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
            ? mode === "deposit"
              ? "Approve the liquidity deposit in your wallet…"
              : "Approve the liquidity withdrawal in your wallet…"
            : txStatus === "success"
              ? mode === "deposit"
                ? "Liquidity added. Pool reserves should refresh shortly."
                : "Liquidity withdrawn. wSOL was unwrapped back to native SOL."
              : undefined
        }
        onClose={() => setTxStatus("idle")}
      />
    </>
  );
}
