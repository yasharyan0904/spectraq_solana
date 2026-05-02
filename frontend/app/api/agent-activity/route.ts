// GET /api/agent-activity?limit=N&filter=all|trades|arcium
//
// Reads structured pino events the agent writes to logs/agent.jsonl
// (multistream — see agent/src/index.ts:makeLogger). Returns the most
// recent N events as a typed feed for the dashboard's <AgentActivity />
// panel.
//
// Cached for 2 seconds — frequent enough that the panel feels live, lazy
// enough that we don't re-read the file on every poll from every tab.

import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  ts: number; // unix ms
  msg: string;
  // Variant-specific payload, kept loose so the UI can pick what to render.
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

interface CacheEntry {
  events: AgentEvent[];
  fetchedAt: number;
}
let cache: CacheEntry | null = null;
const CACHE_MS = 2_000;

const JSONL_PATH = path.resolve(process.cwd(), "..", "logs", "agent.jsonl");

const TAIL_BYTES = 256 * 1024; // last 256 KiB is enough for hundreds of ticks

interface PinoLine {
  level?: string;
  time?: string;
  msg?: string;
  tick?: number;
  signal?: number;
  mode?: string;
  action?: string;
  amountIn?: string;
  signature?: string;
  realizedOut?: string;
  computationOffset?: string;
  position?: string;
  reason?: string;
  err?: string;
}

function classify(line: PinoLine): AgentEvent | null {
  if (!line.msg) return null;
  const ts = line.time ? Date.parse(line.time) : Date.now();
  const base = { ts, msg: line.msg, tick: line.tick };

  if (line.msg === "agent boot") return { ...base, kind: "boot" };

  if (
    line.msg === "computed signal locally" ||
    line.msg === "FORCE_SIGNAL override" ||
    line.msg === "received signal from cluster"
  ) {
    const source: AgentEvent["source"] =
      line.mode === "forced"
        ? "forced"
        : line.mode === "real"
          ? "arcium"
          : "mock";
    const sig =
      line.signal === 1 ? 1 : line.signal === 0 ? 0 : line.signal === -1 ? -1 : undefined;
    return { ...base, kind: "signal", source, signal: sig as AgentEvent["signal"] };
  }

  if (line.msg === "queued MPC") {
    return { ...base, kind: "mpc-queued", computationOffset: line.computationOffset };
  }

  if (line.msg === "executing trade") {
    const direction =
      line.action === "long_open"
        ? "usdc->sol"
        : line.action === "long_close" || line.action === "long_close_split"
          ? "sol->usdc"
          : undefined;
    return { ...base, kind: "trade-attempt", direction, amountIn: line.amountIn };
  }

  if (line.msg === "trade landed") {
    return {
      ...base,
      kind: "trade-result",
      signature: line.signature,
      realizedOut: line.realizedOut,
    };
  }

  if (line.msg === "trade failed (ignored)") {
    return { ...base, kind: "error", errStr: line.err, reason: "trade-failed" };
  }

  if (
    line.msg === "skip tick: pyth stale" ||
    line.msg === "skip trade: NAV floor breach" ||
    line.msg === "skip trade: kill switch"
  ) {
    return { ...base, kind: "skip", reason: line.reason ?? line.msg };
  }

  if (line.msg === "no-churn") {
    return {
      ...base,
      kind: "info",
      msg: "no-churn — signal already matches position",
      signal:
        line.signal === 1 ? 1 : line.signal === 0 ? 0 : undefined,
    };
  }

  return null;
}

async function tailJsonl(filePath: string): Promise<PinoLine[]> {
  let fh: fs.FileHandle | null = null;
  try {
    fh = await fs.open(filePath, "r");
    const stat = await fh.stat();
    const size = stat.size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    const text = buf.toString("utf8");
    const lines = text.split("\n").filter(Boolean);
    // If we started mid-line, drop the first (probably partial) entry.
    if (start > 0 && lines.length > 0) lines.shift();
    const parsed: PinoLine[] = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line) as PinoLine);
      } catch {
        // Ignore non-JSON noise (shouldn't happen but be tolerant).
      }
    }
    return parsed;
  } catch {
    return [];
  } finally {
    if (fh) await fh.close().catch(() => undefined);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const filter = (url.searchParams.get("filter") ?? "all") as
    | "all"
    | "trades"
    | "arcium";
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_MS) {
    return respond(cache.events, filter, limit, now);
  }

  const lines = await tailJsonl(JSONL_PATH);
  const events: AgentEvent[] = [];
  for (const line of lines) {
    const evt = classify(line);
    if (evt) events.push(evt);
  }
  cache = { events, fetchedAt: now };
  return respond(events, filter, limit, now);
}

function respond(
  events: AgentEvent[],
  filter: "all" | "trades" | "arcium",
  limit: number,
  now: number,
) {
  let out = events;
  if (filter === "trades") {
    out = events.filter((e) =>
      ["signal", "trade-attempt", "trade-result", "skip", "error"].includes(e.kind),
    );
  } else if (filter === "arcium") {
    out = events.filter(
      (e) =>
        e.kind === "mpc-queued" ||
        e.kind === "mpc-callback" ||
        (e.kind === "signal" && e.source === "arcium"),
    );
  }
  // Most recent first, capped to limit.
  const tail = out.slice(-limit).reverse();
  return NextResponse.json({ events: tail, fetchedAt: now });
}
