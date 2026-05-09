"use client";

import { useState } from "react";
import Link from "next/link";

const STEPS = [
  { n: 1, label: "Strategy" },
  { n: 2, label: "Parameters" },
  { n: 3, label: "Encryption" },
  { n: 4, label: "Deploy" },
];

const CATEGORIES = ["Trend Following", "Momentum", "Mean Reversion", "Arbitrage", "Market Making", "Other"];

export default function LaunchPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    category: "",
    description: "",
    fastN: "5",
    slowN: "50",
    thresholdBps: "30",
    riskPct: "20",
    encrypted: true,
  });

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="mx-auto max-w-2xl space-y-8">

      {/* Header */}
      <div>
        <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--color-brand)]">
          Shopify for Quants
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Launch your vault</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Deploy a non-custodial trading vault on Solana. Your strategy runs inside
          Arcium MPC — investors see on-chain returns, your alpha stays private.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center gap-0 flex-1 last:flex-none">
            <button
              onClick={() => setStep(s.n)}
              className="flex flex-col items-center gap-1.5 group"
              disabled={s.n > step + 1}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all"
                style={
                  s.n === step
                    ? {
                        background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                        boxShadow: "0 0 16px rgba(139,92,246,0.5)",
                        color: "white",
                      }
                    : s.n < step
                    ? {
                        background: "rgba(139,92,246,0.2)",
                        border: "1px solid rgba(139,92,246,0.4)",
                        color: "var(--color-brand)",
                      }
                    : {
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(139,92,246,0.15)",
                        color: "var(--color-muted)",
                      }
                }
              >
                {s.n < step ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  s.n
                )}
              </div>
              <span
                className="hidden text-[10px] font-medium sm:block"
                style={{ color: s.n === step ? "var(--color-text)" : "var(--color-muted)" }}
              >
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className="mx-2 h-px flex-1"
                style={{
                  background:
                    step > s.n
                      ? "rgba(139,92,246,0.4)"
                      : "rgba(139,92,246,0.12)",
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div
        className="glass rounded-2xl p-6 md:p-8"
        style={{ border: "1px solid rgba(139, 92, 246, 0.2)" }}
      >

        {/* Step 1 — Strategy identity */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">Strategy identity</h2>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
                Vault name
              </label>
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. MA Crossover Alpha"
                className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-all"
                style={{
                  background: "rgba(10, 10, 18, 0.7)",
                  border: "1px solid rgba(139, 92, 246, 0.2)",
                  color: "var(--color-text)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(139, 92, 246, 0.5)")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(139, 92, 246, 0.2)")}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => set("category", c)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                    style={
                      form.category === c
                        ? {
                            background: "rgba(139, 92, 246, 0.2)",
                            border: "1px solid rgba(139, 92, 246, 0.4)",
                            color: "var(--color-brand)",
                          }
                        : {
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(139, 92, 246, 0.15)",
                            color: "var(--color-muted)",
                          }
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
                Strategy description (public)
              </label>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Describe your approach at a high level. This is shown to investors — strategy specifics remain encrypted."
                rows={4}
                className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-all resize-none"
                style={{
                  background: "rgba(10, 10, 18, 0.7)",
                  border: "1px solid rgba(139, 92, 246, 0.2)",
                  color: "var(--color-text)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(139, 92, 246, 0.5)")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(139, 92, 246, 0.2)")}
              />
              <p className="text-[11px] text-[var(--color-muted)]">
                Specific parameters (fast/slow windows, thresholds) are encrypted to the
                Arcium MXE and never exposed on-chain.
              </p>
            </div>
          </div>
        )}

        {/* Step 2 — Strategy parameters */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">Strategy parameters</h2>
            <p className="text-sm text-[var(--color-muted)]">
              These values are encrypted before being stored. Only the Arcium MXE cluster
              can access them during computation — not the program, not the agent, not us.
            </p>

            <div
              className="flex items-center gap-2 rounded-lg px-4 py-3"
              style={{
                background: "rgba(16,217,140,0.06)",
                border: "1px solid rgba(16,217,140,0.2)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-positive)" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="text-xs text-[var(--color-positive)]">
                Encrypted with Arcium MXE threshold key — parameters are write-only to the vault
              </span>
            </div>

            {[
              { key: "fastN", label: "Fast MA window", hint: "Shorter lookback period (e.g. 5 candles)" },
              { key: "slowN", label: "Slow MA window", hint: "Longer lookback period (e.g. 50 candles)" },
              { key: "thresholdBps", label: "Signal threshold (bps)", hint: "Min crossover gap before triggering a trade" },
              { key: "riskPct", label: "Max position size (%)", hint: "Maximum % of vault NAV per trade" },
            ].map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
                  {field.label}
                </label>
                <input
                  type="number"
                  value={form[field.key as keyof typeof form] as string}
                  onChange={(e) => set(field.key, e.target.value)}
                  className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-all mono"
                  style={{
                    background: "rgba(10, 10, 18, 0.7)",
                    border: "1px solid rgba(139, 92, 246, 0.2)",
                    color: "var(--color-text)",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(139, 92, 246, 0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(139, 92, 246, 0.2)")}
                />
                <p className="text-[11px] text-[var(--color-muted)]">{field.hint}</p>
              </div>
            ))}
          </div>
        )}

        {/* Step 3 — Encryption */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">Arcium MPC configuration</h2>
            <p className="text-sm text-[var(--color-muted)]">
              Your strategy parameters are threshold-encrypted to the Arcium MXE before
              being submitted on-chain. The MPC cluster co-computes the signal each tick
              without any node seeing the plaintext.
            </p>

            {/* How it works */}
            <div
              className="space-y-3 rounded-xl p-5"
              style={{
                background: "rgba(10, 10, 18, 0.5)",
                border: "1px solid rgba(139, 92, 246, 0.15)",
              }}
            >
              {[
                ["1. Encrypt", "Your parameters are encrypted to the Arcium MXE threshold pubkey client-side."],
                ["2. Submit", "Encrypted parameters are posted on-chain via initialize_vault — never plaintext."],
                ["3. Compute", "Each tick, the agent calls request_signal_computation. The MXE cluster co-computes your MA crossover under MPC."],
                ["4. Callback", "The decrypted signal integer lands back on-chain via callback_signal. Agent executes the trade."],
              ].map(([title, body]) => (
                <div key={title} className="flex gap-3">
                  <span
                    className="mono mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background: "rgba(139,92,246,0.12)",
                      border: "1px solid rgba(139,92,246,0.25)",
                      color: "var(--color-brand)",
                    }}
                  >
                    {title}
                  </span>
                  <p className="text-xs leading-relaxed text-[var(--color-muted)]">{body}</p>
                </div>
              ))}
            </div>

            {/* MXE config display */}
            <div className="space-y-3">
              {[
                ["MXE pubkey", "HjiD5aGYnE3unNnKh89xF7thQrF636i2RUw6jV2jNnKt"],
                ["Cluster offset", "456"],
                ["Recovery set size", "4 nodes"],
                ["Network", "Solana Devnet"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-lg px-4 py-2.5"
                  style={{ background: "rgba(10,10,18,0.5)", border: "1px solid rgba(139,92,246,0.12)" }}>
                  <span className="text-xs text-[var(--color-muted)]">{label}</span>
                  <span className="mono text-xs text-[var(--color-text)]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4 — Deploy */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">Review & deploy</h2>

            {/* Summary */}
            <div
              className="space-y-2 rounded-xl p-5"
              style={{
                background: "rgba(10,10,18,0.6)",
                border: "1px solid rgba(139,92,246,0.18)",
              }}
            >
              {[
                ["Vault name", form.name || "—"],
                ["Category", form.category || "—"],
                ["Fast MA window", form.fastN],
                ["Slow MA window", form.slowN],
                ["Threshold (bps)", form.thresholdBps],
                ["Max position (%)", form.riskPct],
                ["MPC encryption", "Arcium MXE · devnet"],
                ["Program", "96fHw6FzHUB8gAPPUUWRpyZuWo2NRPHJtJYcm7ERfugN"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4">
                  <span className="text-xs text-[var(--color-muted)]">{k}</span>
                  <span className="mono text-xs text-[var(--color-text)] truncate max-w-xs text-right">{v}</span>
                </div>
              ))}
            </div>

            {/* Cost notice */}
            <div
              className="flex items-start gap-2.5 rounded-lg px-4 py-3"
              style={{
                background: "rgba(254,188,46,0.06)",
                border: "1px solid rgba(254,188,46,0.2)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#febc2e" strokeWidth="2" className="mt-0.5 shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-xs leading-relaxed text-[var(--color-muted)]">
                Deployment costs ~0.01 SOL in rent for the vault PDA, share mint, and
                two ATAs. The transaction is irreversible — your vault will be visible in
                the marketplace immediately after confirmation.
              </p>
            </div>

            {/* Deploy CTA — disabled, shown as coming soon for hackathon */}
            <div className="space-y-3">
              <button
                className="w-full rounded-xl py-3.5 text-sm font-semibold text-white transition-all relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                  border: "1px solid rgba(196,181,253,0.15)",
                  boxShadow: "0 0 24px rgba(139,92,246,0.4)",
                }}
                onClick={() => alert("Multi-vault deployment coming in the next sprint — the SpectraQ Labs vault is live now on devnet.")}
              >
                Deploy vault to devnet
              </button>
              <p className="text-center text-[11px] text-[var(--color-muted)]">
                Multi-quant vault factory launching post-hackathon ·{" "}
                <Link href="/app/deposit" className="text-[var(--color-brand)] hover:underline">
                  Deposit into the live SpectraQ vault →
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div className="mt-8 flex justify-between">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="rounded-lg px-5 py-2 text-sm font-medium transition-all disabled:opacity-30"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(139,92,246,0.15)",
              color: "var(--color-muted)",
            }}
          >
            ← Back
          </button>
          {step < 4 && (
            <button
              onClick={() => setStep((s) => Math.min(4, s + 1))}
              className="btn-glow rounded-lg px-5 py-2 text-sm font-semibold text-white transition-all"
              style={{
                background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                border: "1px solid rgba(196,181,253,0.15)",
              }}
            >
              Continue →
            </button>
          )}
        </div>
      </div>

      {/* Why launch here */}
      <div
        className="rounded-2xl p-6"
        style={{
          background: "linear-gradient(135deg, rgba(139,92,246,0.07), rgba(34,211,238,0.03))",
          border: "1px solid rgba(139,92,246,0.15)",
        }}
      >
        <h3 className="text-sm font-semibold">Why launch on SpectraQ?</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            ["Alpha stays private", "Arcium MPC encrypts your parameters end-to-end. No node, no employee, no auditor sees your signals."],
            ["Investors trust the code", "Withdrawals are enforced by the program — no manager key can block redemptions."],
            ["Validation framework", "Our four-stage MCPT pipeline helps you ship strategies with statistical rigour, not just backtests."],
          ].map(([title, body]) => (
            <div key={title}>
              <h4 className="text-xs font-semibold text-[var(--color-text)]">{title}</h4>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
