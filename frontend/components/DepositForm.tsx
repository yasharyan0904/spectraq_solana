"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { Card } from "./Card";
import { TxStatusModal, type TxStatus } from "./TxStatusModal";
import { formatUsdc, navUsdc } from "@/lib/format";
import { useDeposit, type DepositAsset } from "@/lib/hooks/useDeposit";
import { useVaultState } from "@/lib/hooks/useVaultState";

export function DepositForm() {
  const { connected } = useWallet();
  const { data } = useVaultState();
  const v = data?.vault;
  const { mutateAsync, isPending } = useDeposit();

  const [asset, setAsset] = useState<DepositAsset>("usdc");
  const [amount, setAmount] = useState("");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Indicative shares preview based on current NAV.
  // Share price = nav / total_shares (USDC e6 per share unit).
  const sharePreview =
    v && BigInt(v.totalShares) > 0n && amount && parseFloat(amount) > 0
      ? estimateShares(asset, parseFloat(amount), v)
      : null;

  const submit = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setTxStatus("pending");
    setErrorMsg(null);
    setSignature(null);
    try {
      const amt = asset === "usdc"
        ? BigInt(Math.round(parseFloat(amount) * 1_000_000))
        : BigInt(Math.round(parseFloat(amount) * 1_000_000_000));
      const res = await mutateAsync({
        asset,
        amount: amt,
        solUsdcPriceE6: asset === "usdc" && v?.pythPriceE6 ? BigInt(v.pythPriceE6) : undefined,
      });
      setSignature(res.signature);
      setTxStatus("success");
      setAmount("");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setTxStatus("error");
    }
  };

  return (
    <>
      <Card title="Deposit" subtitle="Mint shares against the live vault NAV">
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
              Asset
            </div>
            <div className="grid grid-cols-2 gap-2">
              <AssetCard
                selected={asset === "usdc"}
                onClick={() => setAsset("usdc")}
                label="USDC"
                detail="Stablecoin · 6 decimals"
              />
              <AssetCard
                selected={asset === "sol"}
                onClick={() => setAsset("sol")}
                label="SOL"
                detail="Native · 9 decimals"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                Amount
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 focus-within:border-[var(--color-brand)]">
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mono flex-1 bg-transparent text-lg outline-none"
              />
              <span className="mono text-sm text-[var(--color-muted)]">
                {asset === "usdc" ? "USDC" : "SOL"}
              </span>
            </div>
          </div>

          {sharePreview != null && (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                You will receive
              </div>
              <div className="mono mt-1 text-lg">
                ≈ {sharePreview.toFixed(4)} <span className="text-[var(--color-muted)]">SPQS</span>
              </div>
            </div>
          )}

          <button
            onClick={submit}
            disabled={!connected || !amount || isPending || (asset === "usdc" && !v?.pythPriceE6)}
            className="w-full rounded-md bg-[var(--color-brand)] py-3 font-medium text-white transition-all hover:bg-[var(--color-brand-dim)] disabled:cursor-not-allowed disabled:bg-[var(--color-border)] disabled:text-[var(--color-muted)]"
          >
            {!connected
              ? "Connect wallet to deposit"
              : isPending
                ? "Submitting…"
                : `Approve & deposit ${asset.toUpperCase()}`}
          </button>

          {asset === "usdc" && !v?.pythPriceE6 && (
            <p className="text-xs text-[var(--color-muted)]">
              Waiting for Pyth price update — USDC deposits need a fresh
              SOL/USDC price to value the vault.
            </p>
          )}
          {v && (
            <p className="text-[11px] text-[var(--color-muted)]">
              Current NAV: <span className="mono">{formatUsdc(BigInt(v.navUsdcE6))}</span> ·
              {" "}total shares: <span className="mono">{Number(v.totalShares) / 1_000_000}</span>
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
            ? "Approve the deposit in your wallet…"
            : txStatus === "success"
              ? "Your shares have been minted."
              : undefined
        }
        onClose={() => setTxStatus("idle")}
      />
    </>
  );
}

function AssetCard({
  selected,
  onClick,
  label,
  detail,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-left transition-all ${
        selected
          ? "border-[var(--color-brand)] bg-[var(--color-brand)]/8"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-muted)]"
      }`}
    >
      <div className="mono text-sm font-medium">{label}</div>
      <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">{detail}</div>
    </button>
  );
}

function estimateShares(
  asset: DepositAsset,
  amount: number,
  vault: { navUsdcE6: string; totalShares: string; pythPriceE6: string | null },
): number | null {
  if (BigInt(vault.totalShares) === 0n) return amount; // bootstrap 1:1
  const navUsdc_ = navUsdc(BigInt(vault.navUsdcE6));
  if (navUsdc_ <= 0) return null;
  let valueUsdc: number;
  if (asset === "usdc") valueUsdc = amount;
  else if (vault.pythPriceE6) valueUsdc = amount * navUsdc(BigInt(vault.pythPriceE6));
  else return null;
  const sharePrice = navUsdc_ / (Number(BigInt(vault.totalShares)) / 1_000_000);
  return valueUsdc / sharePrice;
}
