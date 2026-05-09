import Link from "next/link";
import { AgentActivity } from "@/components/AgentActivity";
import { Card, Stat } from "@/components/Card";
import { explorerAddrUrl } from "@/lib/env";

const MXE_PUBKEY =
  process.env.NEXT_PUBLIC_ARCIUM_MXE_PUBKEY ??
  "HjiD5aGYnE3unNnKh89xF7thQrF636i2RUw6jV2jNnKt";

export default function ArciumPage() {
  return (
    <div className="space-y-8">

      {/* Page header */}
      <div>
        <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--color-brand)]">
          Privacy layer
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Arcium MPC
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">
          SpectraQ uses{" "}
          <a href="https://arcium.com" target="_blank" rel="noreferrer" className="text-[var(--color-brand)] hover:underline">
            Arcium
          </a>{" "}
          threshold-encrypted MPC as the privacy backbone for all strategy
          computations. This is what enables the{" "}
          <Link href="/app/marketplace" className="text-[var(--color-cyan)] hover:underline">
            Shopify for Quants
          </Link>{" "}
          model — quants keep their alpha, investors get on-chain proof.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Stat label="Mode" value="MOCK_MPC" hint="set on agent boot" />
        </Card>
        <Card>
          <Stat
            label="MXE pubkey"
            value={
              <a
                className="text-[var(--color-brand)] hover:underline"
                href={explorerAddrUrl(MXE_PUBKEY)}
                target="_blank"
                rel="noreferrer"
              >
                {MXE_PUBKEY.slice(0, 4)}…{MXE_PUBKEY.slice(-4)}
              </a>
            }
            hint="Arcium devnet MXE"
          />
        </Card>
        <Card>
          <Stat label="Cluster offset" value="456" hint="Arcium devnet cluster" />
        </Card>
        <Card>
          <Stat label="Recovery set" value="4" hint="threshold-decryption nodes" />
        </Card>
      </div>

      {/* How a tick works */}
      <Card
        title="Signal computation flow"
        subtitle="How a quant's encrypted strategy becomes an on-chain trade"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              n: "1",
              title: "Encrypt",
              body: "Agent encrypts the 50-close price window with the MXE threshold pubkey.",
              icon: "🔐",
            },
            {
              n: "2",
              title: "Submit",
              body: "request_signal_computation lands on-chain. Arcium nodes pick it up.",
              icon: "📡",
            },
            {
              n: "3",
              title: "Compute",
              body: "MPC cluster co-computes the MA-crossover. No node sees plaintext state.",
              icon: "⚙️",
            },
            {
              n: "4",
              title: "Callback",
              body: "MXE callback writes the decrypted signal integer into vault.signal_state.",
              icon: "✅",
            },
          ].map((step) => (
            <div
              key={step.n}
              className="relative rounded-xl p-4"
              style={{
                background: "rgba(10, 10, 18, 0.5)",
                border: "1px solid rgba(139, 92, 246, 0.14)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="mono flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold"
                  style={{
                    background: "rgba(139,92,246,0.15)",
                    border: "1px solid rgba(139,92,246,0.3)",
                    color: "var(--color-brand)",
                  }}
                >
                  {step.n}
                </span>
                <span className="text-sm font-semibold">{step.title}</span>
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-[var(--color-muted)]">{step.body}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Why this enables the marketplace */}
      <div
        className="rounded-2xl p-6 md:p-8"
        style={{
          background: "linear-gradient(135deg, rgba(139,92,246,0.07), rgba(34,211,238,0.03))",
          border: "1px solid rgba(139,92,246,0.18)",
        }}
      >
        <h3 className="text-base font-semibold">Why MPC enables the Shopify for Quants</h3>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Traditional DeFi vaults face a dilemma: publish the strategy (alpha leak) or
          hide it (investor trust gap). Arcium MPC solves both sides.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          {[
            {
              title: "For quants",
              color: "var(--color-brand)",
              body: "Parameters are encrypted before leaving your machine. The on-chain program and agent never hold plaintext strategy state.",
            },
            {
              title: "For investors",
              color: "var(--color-cyan)",
              body: "The computation circuit is fixed and published. Investors can verify that the on-chain signal matches what the quant described — without seeing the parameters.",
            },
            {
              title: "For the protocol",
              color: "var(--color-positive)",
              body: "Every vault's signal path is identical. One audited MPC circuit handles all strategies — reducing attack surface.",
            },
          ].map((item) => (
            <div key={item.title}>
              <h4 className="text-sm font-semibold" style={{ color: item.color }}>
                {item.title}
              </h4>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">{item.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Link
            href="/app/marketplace"
            className="text-sm font-medium text-[var(--color-brand)] hover:opacity-80 transition-opacity"
          >
            Browse strategy vaults →
          </Link>
        </div>
      </div>

      {/* Mock mode notice */}
      <Card
        title="MOCK_MPC mode active"
        subtitle="Set MOCK_MPC=false on agent restart to see real Arcium callbacks"
      >
        <div
          className="flex items-start gap-3 rounded-lg p-4"
          style={{
            background: "rgba(254,188,46,0.05)",
            border: "1px solid rgba(254,188,46,0.2)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#febc2e" strokeWidth="2" className="mt-0.5 shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-sm font-medium">Agent is running MOCK_MPC=true</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
              The signal is computed locally by the agent instead of being sent to the
              Arcium cluster. The on-chain trade flow is identical — only the privacy
              guarantee is bypassed. Restart with{" "}
              <span className="mono">MOCK_MPC=false</span> to use the real MXE.
            </p>
          </div>
        </div>
      </Card>

      {/* Live event stream */}
      <AgentActivity
        filter="arcium"
        limit={30}
        title="Live Arcium events"
        subtitle="Queue txs and callback signals from the agent log"
        emptyMessage="No Arcium events yet — the agent is in MOCK_MPC=true mode. Restart with MOCK_MPC=false to populate this feed."
      />
    </div>
  );
}
