import Image from "next/image";
import { promises as fs } from "node:fs";
import path from "node:path";

import { Card, Stat } from "@/components/Card";
import { AppShell } from "@/components/AppShell";

interface StrategyParams {
  fast_n: number;
  slow_n: number;
  threshold_bps: number;
  validation: {
    validated_at: string;
    verdict: "ship" | "no_ship";
    is_pvalue: number;
    wf_pvalue: number;
    is_sharpe: number;
    wf_sharpe: number;
    wf_total_return: number;
    wf_max_dd: number;
    is_best_fast_n: number;
    is_best_slow_n: number;
    data_window: { start: string; end: string; timeframe: string; bars: number };
    n_is_permutations: number;
    n_wf_permutations: number;
  };
  recommendation: string;
}

async function loadParams(): Promise<StrategyParams> {
  const file = path.join(process.cwd(), "public", "strategy", "strategy_params.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as StrategyParams;
}

const ACCEPT_P = 0.05;

export default async function StrategyPage() {
  const params = await loadParams();
  const v = params.validation;
  const isShip = v.verdict === "ship";
  const isPass = v.is_pvalue < ACCEPT_P;
  const wfPos = v.wf_sharpe > 0;
  const wfPass = v.wf_pvalue < ACCEPT_P;

  return (
    <AppShell>
      <div className="space-y-8">
        <header>
          <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--color-brand)]">
            Validation
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">
            Strategy transparency
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--color-muted)]">
            The MA-crossover strategy used by the agent runs through a
            four-stage Monte Carlo Permutation Test framework. Every
            stage's result is published below — including failures.
          </p>
        </header>

        <Card
          className={
            isShip
              ? "border-[var(--color-positive)]/40"
              : "border-[var(--color-negative)]/40"
          }
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mono text-xs uppercase tracking-wider text-[var(--color-muted)]">
                Verdict
              </div>
              <div
                className="mt-1 text-3xl font-medium"
                style={{
                  color: isShip
                    ? "var(--color-positive)"
                    : "var(--color-negative)",
                }}
              >
                {isShip ? "SHIP" : "NO SHIP"}
              </div>
              <div className="mt-2 text-xs text-[var(--color-muted)]">
                Validated {new Date(v.validated_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                {" · "}
                {v.data_window.bars.toLocaleString()} bars of {v.data_window.timeframe} SOL/USDC
                {" "}({v.data_window.start} → {v.data_window.end})
              </div>
            </div>
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-sm md:max-w-md">
              {params.recommendation}
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card title="Stage 2 — IS permutation">
            <Stat
              label={`p-value · ${v.n_is_permutations} perms`}
              value={v.is_pvalue.toFixed(4)}
              positive={isPass}
              negative={!isPass}
              hint={isPass ? `< ${ACCEPT_P} acceptance` : `≥ ${ACCEPT_P} — fails gate`}
            />
            <div className="mt-4 text-xs text-[var(--color-muted)] leading-relaxed">
              Real IS Sharpe vs distribution of best-of-grid Sharpes on
              shuffled price series.
            </div>
          </Card>
          <Card title="Stage 3 — Walk-forward">
            <Stat
              label="OOS Sharpe (annualized)"
              value={(v.wf_sharpe >= 0 ? "+" : "") + v.wf_sharpe.toFixed(3)}
              positive={wfPos}
              negative={!wfPos}
              hint={`return ${(v.wf_total_return * 100).toFixed(1)}% · dd ${(v.wf_max_dd * 100).toFixed(1)}%`}
            />
            <div className="mt-4 text-xs text-[var(--color-muted)] leading-relaxed">
              Rolling re-optimization on training window, params applied
              unchanged to test window.
            </div>
          </Card>
          <Card title="Stage 4 — WF permutation">
            <Stat
              label={`p-value · ${v.n_wf_permutations} perms`}
              value={v.wf_pvalue.toFixed(4)}
              positive={wfPass}
              negative={!wfPass}
              hint={wfPass ? `< ${ACCEPT_P} acceptance` : `≥ ${ACCEPT_P} — fails gate`}
            />
            <div className="mt-4 text-xs text-[var(--color-muted)] leading-relaxed">
              Real WF Sharpe vs distribution of WF Sharpes on shuffled
              series. The strongest gate.
            </div>
          </Card>
        </div>

        <Card title="Walk-forward OOS equity" subtitle="Concatenated test-window log returns, exp-cumsum">
          <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
            <Image
              src="/strategy/wf_equity.png"
              alt="Walk-forward OOS equity curve"
              width={1500}
              height={675}
              className="block w-full h-auto"
              priority
            />
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="In-sample optimization">
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="IS-best fast / slow"
                value={`${v.is_best_fast_n} / ${v.is_best_slow_n}`}
              />
              <Stat
                label="IS Sharpe"
                value={(v.is_sharpe >= 0 ? "+" : "") + v.is_sharpe.toFixed(3)}
                positive={v.is_sharpe > 0}
                negative={v.is_sharpe < 0}
              />
            </div>
          </Card>
          <Card title="Live agent params">
            <div className="grid grid-cols-2 gap-4">
              <Stat label="fast_n" value={params.fast_n} />
              <Stat label="slow_n" value={params.slow_n} />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
              The agent currently runs MA({params.fast_n}, {params.slow_n})
              {isShip
                ? " — these are the validated parameters."
                : ". This is the hardcoded default; given the failed verdict, treat the live signal as a demonstration only."}
            </p>
          </Card>
        </div>

        <Card title="Reproduce">
          <p className="text-sm text-[var(--color-muted)]">
            All four stages can be reproduced from the open-source pipeline.
          </p>
          <pre className="mono mt-3 overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-xs text-[var(--color-text)]">
{`cd strategy
source .venv/bin/activate
python scripts/run_validation.py    # writes data/validation_result.json
python scripts/export_params.py     # publishes to agent + frontend
jupyter lab notebooks/01_validate_ma_crossover.ipynb`}
          </pre>
        </Card>
      </div>
    </AppShell>
  );
}
