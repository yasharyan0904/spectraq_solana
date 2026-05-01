"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { Card } from "./Card";
import { TxStatusModal, type TxStatus } from "./TxStatusModal";
import { formatSol, formatUsdc, navUsdc } from "@/lib/format";
import { useUserPosition } from "@/lib/hooks/useUserPosition";
import { useVaultState } from "@/lib/hooks/useVaultState";
import { useWithdraw } from "@/lib/hooks/useWithdraw";

export function WithdrawForm() {
  const { connected } = useWallet();
  const { data: vaultRes } = useVaultState();
  const { data: position } = useUserPosition();
  const { mutateAsync, isPending } = useWithdraw();

  const v = vaultRes?.vault;
  const userShares = position?.shares ?? 0n;
  const [pct, setPct] = useState(50);
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sharesToBurn = userShares > 0n ? (userShares * BigInt(pct)) / 100n : 0n;

  // Estimate USDC + SOL out by pro-rata distribution.
  let usdcOutE6 = 0n;
  let solOutLamports = 0n;
  if (v && BigInt(v.totalShares) > 0n && sharesToBurn > 0n) {
    usdcOutE6 = (BigInt(v.usdcBalance) * sharesToBurn) / BigInt(v.totalShares);
    solOutLamports = (BigInt(v.solBalance) * sharesToBurn) / BigInt(v.totalShares);
  }

  const submit = async () => {
    if (sharesToBurn <= 0n) return;
    setTxStatus("pending");
    setErrorMsg(null);
    setSignature(null);
    try {
      const res = await mutateAsync({ sharesToBurn });
      setSignature(res.signature);
      setTxStatus("success");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setTxStatus("error");
    }
  };

  return (
    <>
      <Card title="Withdraw" subtitle="Burn shares for pro-rata USDC + SOL">
        <div className="space-y-5">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
              Your shares
            </div>
            <div className="mono mt-1 text-lg">
              {connected ? (Number(userShares) / 1_000_000).toFixed(4) : "—"}{" "}
              <span className="text-[var(--color-muted)] text-sm">SPQS</span>
            </div>
            {v && userShares > 0n && (
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                ≈ {formatUsdc(
                  (BigInt(v.navUsdcE6) * userShares) / BigInt(v.totalShares || "1"),
                )} of NAV
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                Burn percentage
              </span>
              <span className="mono text-sm">{pct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct}
              onChange={(e) => setPct(parseInt(e.target.value, 10))}
              className="w-full accent-[var(--color-brand)]"
              disabled={!connected || userShares === 0n}
            />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  onClick={() => setPct(p)}
                  className={`rounded-md border py-1 text-xs ${
                    pct === p
                      ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                      : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
              You will receive
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-[var(--color-muted)]">USDC</div>
                <div className="mono">{formatUsdc(usdcOutE6)}</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--color-muted)]">SOL</div>
                <div className="mono">{formatSol(solOutLamports)}</div>
              </div>
            </div>
            {v?.pythPriceE6 && (
              <div className="mt-2 text-[11px] text-[var(--color-muted)]">
                Total ≈ {formatUsdc(
                  usdcOutE6 +
                    (solOutLamports * BigInt(v.pythPriceE6)) / 1_000_000_000n,
                )}
              </div>
            )}
          </div>

          <button
            onClick={submit}
            disabled={!connected || sharesToBurn === 0n || isPending}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-3 font-medium hover:border-[var(--color-brand)] hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {!connected
              ? "Connect wallet to withdraw"
              : userShares === 0n
                ? "No shares to withdraw"
                : isPending
                  ? "Submitting…"
                  : `Withdraw ${pct}%`}
          </button>
        </div>
      </Card>

      <TxStatusModal
        status={txStatus}
        signature={signature}
        error={errorMsg}
        onClose={() => setTxStatus("idle")}
      />
    </>
  );
}

export { navUsdc };
