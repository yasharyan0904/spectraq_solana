"use client";

import { useQuery } from "@tanstack/react-query";

export type AgentEventKind =
  | "boot"
  | "signal"
  | "trade-attempt"
  | "trade-result"
  | "mpc-queued"
  | "mpc-callback"
  | "skip"
  | "info"
  | "error";

export interface AgentEvent {
  kind: AgentEventKind;
  ts: number;
  msg: string;
  signal?: 1 | 0 | -1;
  source?: "mock" | "forced" | "arcium";
  direction?: "usdc->sol" | "sol->usdc";
  amountIn?: string;
  signature?: string;
  realizedOut?: string;
  computationOffset?: string;
  reason?: string;
  errStr?: string;
  tick?: number;
}

export type ActivityFilter = "all" | "trades" | "arcium";

export function useAgentActivity(filter: ActivityFilter = "all", limit = 50) {
  return useQuery({
    queryKey: ["agent-activity", filter, limit],
    queryFn: async (): Promise<AgentEvent[]> => {
      const res = await fetch(
        `/api/agent-activity?filter=${filter}&limit=${limit}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`/api/agent-activity ${res.status}`);
      const json = (await res.json()) as { events: AgentEvent[] };
      return json.events;
    },
    refetchInterval: 3_000,
  });
}
