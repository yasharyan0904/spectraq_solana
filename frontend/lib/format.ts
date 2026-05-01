// Display formatters. All assume the underlying value is a `bigint`
// (smallest unit, e.g. USDC e6 or lamports) and convert to a UI string.

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numFmt2 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numFmt4 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export function formatUsdc(e6: bigint | number | string): string {
  const n = typeof e6 === "bigint" ? Number(e6) / 1_000_000 : Number(e6) / 1_000_000;
  return usdFmt.format(n);
}

export function formatSol(lamports: bigint | number | string): string {
  const n =
    typeof lamports === "bigint"
      ? Number(lamports) / 1_000_000_000
      : Number(lamports) / 1_000_000_000;
  return numFmt4.format(n) + " SOL";
}

export function formatShares(shares: bigint | number | string): string {
  // Share mint has 6 decimals (matches USDC).
  const n =
    typeof shares === "bigint" ? Number(shares) / 1_000_000 : Number(shares) / 1_000_000;
  return numFmt4.format(n);
}

export function formatPercent(frac: number, signed = true): string {
  const s = (frac * 100).toFixed(2);
  if (!signed) return `${s}%`;
  return frac >= 0 ? `+${s}%` : `${s}%`;
}

export function formatNumber(n: number | bigint, digits = 2): string {
  const v = typeof n === "bigint" ? Number(n) : n;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

export function shortAddr(addr: string, head = 4, tail = 4): string {
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function formatTimestamp(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function timeAgo(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Convert NAV expressed as USDC e6 BigInt to a Number-safe USD value
// (loses precision above 2^53 USDC, but the vault is bounded well below).
export function navUsdc(navE6: bigint): number {
  return Number(navE6) / 1_000_000;
}

export { numFmt2, numFmt4 };
