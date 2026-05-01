"use client";

import { explorerTxUrl } from "@/lib/env";
import { shortAddr } from "@/lib/format";

export type TxStatus = "idle" | "pending" | "success" | "error";

interface Props {
  status: TxStatus;
  signature?: string | null;
  error?: string | null;
  message?: string;
  onClose: () => void;
}

/**
 * Backdrop modal showing the lifecycle of a vault transaction:
 *   pending  — wallet signing or confirmation
 *   success  — confirmed signature, link to explorer
 *   error    — RPC or program error string
 */
export function TxStatusModal({ status, signature, error, message, onClose }: Props) {
  if (status === "idle") return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {status === "pending" && (
          <>
            <div className="flex items-center gap-3">
              <Spinner />
              <h3 className="text-base font-medium">Submitting transaction</h3>
            </div>
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              {message ?? "Approve in your wallet, then wait for confirmation on-chain."}
            </p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="flex items-center gap-3">
              <CheckIcon />
              <h3 className="text-base font-medium text-[var(--color-positive)]">
                Confirmed
              </h3>
            </div>
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              {message ?? "Your transaction landed on-chain."}
            </p>
            {signature && (
              <a
                href={explorerTxUrl(signature)}
                target="_blank"
                rel="noreferrer"
                className="mono mt-4 block text-sm text-[var(--color-brand)] hover:underline"
              >
                {shortAddr(signature, 8, 8)} ↗
              </a>
            )}
          </>
        )}
        {status === "error" && (
          <>
            <div className="flex items-center gap-3">
              <XIcon />
              <h3 className="text-base font-medium text-[var(--color-negative)]">
                Transaction failed
              </h3>
            </div>
            <p className="mt-3 break-words text-sm text-[var(--color-muted)]">
              {error ?? "Unknown error."}
            </p>
          </>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[#22222a]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-[var(--color-brand)]"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CheckIcon() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-positive)]/15 text-[var(--color-positive)]">
      ✓
    </div>
  );
}
function XIcon() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-negative)]/15 text-[var(--color-negative)]">
      ✕
    </div>
  );
}
