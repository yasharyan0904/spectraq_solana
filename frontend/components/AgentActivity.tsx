"use client";

import { Card } from "./Card";
import { explorerTxUrl } from "@/lib/env";
import { formatSol, formatUsdc, shortAddr, timeAgo } from "@/lib/format";
import {
  useAgentActivity,
  type ActivityFilter,
  type AgentEvent,
  type AgentEventKind,
} from "@/lib/hooks/useAgentActivity";

interface Props {
  filter?: ActivityFilter;
  limit?: number;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
}

export function AgentActivity({
  filter = "trades",
  limit = 30,
  title = "Agent activity",
  subtitle = "Live tick stream from the off-chain agent",
  emptyMessage = "Waiting for the first agent tick…",
}: Props) {
  const { data, isLoading, error } = useAgentActivity(filter, limit);

  return (
    <Card
      title={title}
      subtitle={subtitle}
      right={
        <span className="mono text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
          {data?.length ?? 0} events
        </span>
      }
    >
      {isLoading && (
        <div className="py-6 text-center text-sm text-[var(--color-muted)]">
          Loading agent log…
        </div>
      )}
      {error && (
        <div className="py-6 text-center text-sm text-[var(--color-negative)]">
          {String(error)}
        </div>
      )}
      {data && data.length === 0 && (
        <div className="py-6 text-center text-sm text-[var(--color-muted)]">
          {emptyMessage}
        </div>
      )}
      {data && data.length > 0 && (
        <ul className="-my-1 divide-y divide-[var(--color-border)]/50">
          {data.map((e, i) => (
            <li key={`${e.ts}-${i}`} className="flex items-start gap-3 py-3">
              <Dot kind={e.kind} signal={e.signal} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm">{describe(e)}</span>
                  {e.tick != null && (
                    <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                      tick #{e.tick}
                    </span>
                  )}
                </div>
                {detail(e)}
              </div>
              <span className="mono whitespace-nowrap text-[11px] text-[var(--color-muted)]">
                {timeAgo(Math.floor(e.ts / 1000))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function describe(e: AgentEvent): string {
  switch (e.kind) {
    case "boot":
      return "Agent booted";
    case "signal": {
      const dir =
        e.signal === 1 ? "BUY" : e.signal === 0 ? "FLAT / SELL" : "—";
      const src =
        e.source === "arcium"
          ? "from Arcium MPC"
          : e.source === "forced"
            ? "FORCE_SIGNAL override"
            : "computed locally";
      return `Signal: ${dir} (${src})`;
    }
    case "trade-attempt": {
      if (e.direction === "usdc->sol") return "Executing trade: BUY (USDC → SOL)";
      if (e.direction === "sol->usdc") return "Executing trade: SELL (SOL → USDC)";
      return "Executing trade";
    }
    case "trade-result":
      return "Trade landed on chain";
    case "mpc-queued":
      return "Queued MPC computation on Arcium";
    case "mpc-callback":
      return "Arcium MPC returned signal";
    case "skip":
      return `Skipped tick — ${e.reason ?? "guard"}`;
    case "error":
      return e.reason === "trade-failed"
        ? "Trade failed (expected on devnet — Jupiter routes mainnet only)"
        : "Error";
    case "info":
      return e.msg;
  }
}

function detail(e: AgentEvent) {
  if (e.kind === "trade-attempt" && e.amountIn) {
    const fmt =
      e.direction === "usdc->sol"
        ? formatUsdc(BigInt(e.amountIn))
        : formatSol(BigInt(e.amountIn));
    return (
      <div className="mono mt-0.5 text-xs text-[var(--color-muted)]">
        amount in: {fmt}
      </div>
    );
  }
  if (e.kind === "trade-result" && e.signature) {
    return (
      <div className="mt-0.5 text-xs">
        <a
          className="mono text-[var(--color-brand)] hover:underline"
          href={explorerTxUrl(e.signature)}
          target="_blank"
          rel="noreferrer"
        >
          {shortAddr(e.signature, 6, 6)} on Explorer
        </a>
      </div>
    );
  }
  if (e.kind === "mpc-queued" && e.computationOffset) {
    return (
      <div className="mono mt-0.5 text-xs text-[var(--color-muted)]">
        computation offset: {e.computationOffset}
      </div>
    );
  }
  if (e.kind === "error" && e.errStr) {
    return (
      <div className="mono mt-0.5 line-clamp-2 text-xs text-[var(--color-muted)]">
        {e.errStr}
      </div>
    );
  }
  return null;
}

function Dot({
  kind,
  signal,
}: {
  kind: AgentEventKind;
  signal?: 1 | 0 | -1;
}) {
  let color = "var(--color-muted)";
  if (kind === "signal") {
    color =
      signal === 1
        ? "var(--color-positive)"
        : signal === 0
          ? "var(--color-negative)"
          : "var(--color-muted)";
  } else if (kind === "trade-attempt") {
    color = "var(--color-brand)";
  } else if (kind === "trade-result") {
    color = "var(--color-positive)";
  } else if (kind === "error" || kind === "skip") {
    color = "var(--color-negative)";
  } else if (kind === "mpc-queued" || kind === "mpc-callback") {
    color = "var(--color-brand)";
  }
  return (
    <span
      className="mt-1.5 block h-2 w-2 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

