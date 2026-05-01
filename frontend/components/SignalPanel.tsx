"use client";

import { Card, Stat } from "./Card";
import { useVaultState } from "@/lib/hooks/useVaultState";

const signalLabel = (n: number): "LONG" | "FLAT" | "—" => {
  if (n === 1) return "LONG";
  if (n === 0) return "FLAT";
  return "—";
};

export function SignalPanel() {
  const { data, isLoading } = useVaultState();
  const v = data?.vault;
  const signalText = v ? signalLabel(v.lastSignal) : "—";
  const isPending = v?.signalState === "pending";
  const dotColor =
    signalText === "LONG"
      ? "var(--color-positive)"
      : signalText === "FLAT"
        ? "var(--color-muted)"
        : "var(--color-border)";

  return (
    <Card
      title="Signal"
      subtitle={isPending ? "MPC computation in progress" : "Last computed signal"}
      right={
        <div className="flex items-center gap-2">
          <span
            className={`block h-2.5 w-2.5 rounded-full ${isPending ? "pulse-dot" : ""}`}
            style={{ background: dotColor }}
          />
          <span className="mono text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
            {isPending ? "computing" : "ready"}
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Stat
          label="Direction"
          value={isLoading ? "…" : signalText}
          positive={signalText === "LONG"}
        />
        <Stat
          label="Last slot"
          value={
            isLoading
              ? "…"
              : v?.lastSignalSlot && v.lastSignalSlot !== "0"
                ? Number(v.lastSignalSlot).toLocaleString()
                : "—"
          }
        />
      </div>
    </Card>
  );
}
