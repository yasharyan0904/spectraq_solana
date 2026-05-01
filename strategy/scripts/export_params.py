"""Export validated strategy parameters to `agent/config/strategy_params.json`.

The agent reads this file at boot to pick MA window sizes. The file
ALWAYS records the validation outcome — including failed validations —
so any operator running the agent in production can see exactly what
the strategy was vetted against.

If the validation passed (`verdict.ship == true`), we export the IS-best
(fast_n, slow_n). If it failed, we still export the agent's hardcoded
default (10, 30) so the agent boots, but flag `verdict: "no_ship"` and
populate `recommendation` with operator guidance.

Run after `scripts/run_validation.py`.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULT_FILE = ROOT / "data" / "validation_result.json"
OUT_FILE = ROOT.parent / "agent" / "config" / "strategy_params.json"

# Agent-side defaults, hardcoded in agent/src/config.ts. We mirror them
# here as the no-ship fallback so the agent's behavior remains
# deterministic regardless of validation outcome.
DEFAULT_FAST_N = 10
DEFAULT_SLOW_N = 30


def main() -> int:
    if not RESULT_FILE.exists():
        print(
            f"ERROR: {RESULT_FILE} not found — run scripts/run_validation.py first",
            file=sys.stderr,
        )
        return 2
    result = json.loads(RESULT_FILE.read_text())
    ship = bool(result["verdict"]["ship"])

    if ship:
        fast_n = int(result["is"]["best_fast_n"])
        slow_n = int(result["is"]["best_slow_n"])
        recommendation = (
            "All four MCPT gates passed. The agent may be deployed with these "
            "parameters. Re-run validation if the data window is extended."
        )
    else:
        fast_n = DEFAULT_FAST_N
        slow_n = DEFAULT_SLOW_N
        recommendation = (
            "Validation FAILED — strategy did not clear the four-stage MCPT "
            "gate. The exported parameters are the agent's hardcoded "
            "defaults; the agent will compute MA crossover signals but "
            "those signals have no demonstrated edge over random. "
            "Operator should either (a) keep the strategy disabled in "
            "production, (b) retune the search space and re-run "
            "validation, or (c) use SpectraQ as a demo only with this "
            "verdict surfaced to depositors."
        )

    payload = {
        "fast_n": fast_n,
        "slow_n": slow_n,
        "threshold_bps": 0,
        "validation": {
            "validated_at": result.get("validated_at")
            or datetime.now(timezone.utc).isoformat(),
            "verdict": "ship" if ship else "no_ship",
            "is_pvalue": float(result["is_perm"]["p_value"]),
            "wf_pvalue": float(result["wf_perm"]["p_value"]),
            "is_sharpe": float(result["is"]["sharpe"]),
            "wf_sharpe": float(result["wf"]["sharpe"]),
            "wf_total_return": float(result["wf"]["total_return"]),
            "wf_max_dd": float(result["wf"]["max_dd"]),
            "is_best_fast_n": int(result["is"]["best_fast_n"]),
            "is_best_slow_n": int(result["is"]["best_slow_n"]),
            "data_window": result["data_window"],
            "n_is_permutations": int(result["is_perm"]["n_permutations"]),
            "n_wf_permutations": int(result["wf_perm"]["n_permutations"]),
        },
        "recommendation": recommendation,
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {OUT_FILE}")
    print(f"  verdict:   {payload['validation']['verdict']}")
    print(f"  fast_n:    {payload['fast_n']}")
    print(f"  slow_n:    {payload['slow_n']}")
    print(f"  is_pvalue: {payload['validation']['is_pvalue']:.4f}")
    print(f"  wf_pvalue: {payload['validation']['wf_pvalue']:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
