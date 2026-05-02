import { AgentActivity } from "@/components/AgentActivity";
import { Card, Stat } from "@/components/Card";
import { explorerAddrUrl } from "@/lib/env";

const MXE_PUBKEY =
  process.env.NEXT_PUBLIC_ARCIUM_MXE_PUBKEY ??
  "HjiD5aGYnE3unNnKh89xF7thQrF636i2RUw6jV2jNnKt";

export default function ArciumPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Arcium MPC</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted)]">
          The agent computes the trading signal under threshold-encrypted MPC
          using Arcium. Each tick: encrypt the price window → submit to the
          MXE → Arcium nodes co-compute the MA-crossover → callback returns
          the decrypted signal back into the vault. Below is the live event
          stream.
        </p>
      </div>

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
          <Stat
            label="Cluster offset"
            value="456"
            hint="Arcium devnet cluster"
          />
        </Card>
        <Card>
          <Stat
            label="Recovery set"
            value="4"
            hint="threshold-decryption nodes"
          />
        </Card>
      </div>

      <Card
        title="How a real-MPC tick lands"
        subtitle="Set MOCK_MPC=false on agent restart to see this stream populate"
      >
        <ol className="space-y-3 text-sm text-[var(--color-muted)]">
          <li>
            <span className="text-[var(--color-text)]">
              1. Agent encrypts the 50-close price window
            </span>{" "}
            with the MXE's threshold pubkey and submits a{" "}
            <span className="mono text-xs">request_signal_computation</span>{" "}
            instruction.
          </li>
          <li>
            <span className="text-[var(--color-text)]">
              2. Arcium nodes co-compute the MA-crossover signal
            </span>{" "}
            without ever seeing the plaintext window.
          </li>
          <li>
            <span className="text-[var(--color-text)]">
              3. The MXE callback signs into the vault&apos;s{" "}
              <span className="mono text-xs">callback_signal</span>{" "}
              instruction, stamping the decrypted{" "}
              <span className="mono text-xs">last_signal</span> on chain.
            </span>
          </li>
          <li>
            <span className="text-[var(--color-text)]">
              4. The agent reads the on-chain signal and proceeds to{" "}
              <span className="mono text-xs">decideTrade</span> just like in
              MOCK_MPC=true mode.
            </span>
          </li>
        </ol>
      </Card>

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
