// Lightweight metrics — Prometheus-shaped counters/gauges that we log via
// pino as `metric=true` events. A real Grafana sidecar can pick these up
// later by parsing the structured logs.
//
// Each metric exposes `inc`, `set`, or `observe` and a `snapshot` for
// per-tick log emission.

export type MetricKind = "counter" | "gauge";

export class Metric {
  private value: number = 0;
  constructor(public readonly name: string, public readonly kind: MetricKind) {}

  inc(delta: number = 1): void {
    if (this.kind !== "counter") {
      throw new Error(`Metric ${this.name} is not a counter`);
    }
    this.value += delta;
  }

  set(v: number): void {
    if (this.kind !== "gauge") {
      throw new Error(`Metric ${this.name} is not a gauge`);
    }
    this.value = v;
  }

  get(): number {
    return this.value;
  }
}

class MetricRegistry {
  private metrics = new Map<string, Metric>();

  counter(name: string): Metric {
    return this.getOrCreate(name, "counter");
  }
  gauge(name: string): Metric {
    return this.getOrCreate(name, "gauge");
  }

  private getOrCreate(name: string, kind: MetricKind): Metric {
    let m = this.metrics.get(name);
    if (!m) {
      m = new Metric(name, kind);
      this.metrics.set(name, m);
    } else if (m.kind !== kind) {
      throw new Error(`Metric ${name} already registered as ${m.kind}, not ${kind}`);
    }
    return m;
  }

  /** Snapshot of all metrics for per-tick log emission. */
  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [name, m] of this.metrics) out[name] = m.get();
    return out;
  }
}

export const metrics = new MetricRegistry();

// ---------------------------------------------------------------------------
// Pre-registered metrics. Names match Prometheus conventions
// (`_total` suffix for counters, no suffix for gauges, ATA pubkey labels
// would be added when we wire a real Prometheus exporter).
// ---------------------------------------------------------------------------

export const ticksTotal = metrics.counter("agent_ticks_total");
export const signalReceivedTotal = metrics.counter("agent_signal_received_total");
export const tradesExecutedTotal = metrics.counter("agent_trades_executed_total");
export const errorsTotal = metrics.counter("agent_errors_total");

export const vaultNavUsdcE6 = metrics.gauge("vault_nav_usdc_e6");
export const lastSignalGauge = metrics.gauge("agent_last_signal");
export const tickDurationMsGauge = metrics.gauge("agent_tick_duration_ms");
