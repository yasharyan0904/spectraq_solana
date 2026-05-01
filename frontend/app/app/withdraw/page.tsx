import { WithdrawForm } from "@/components/WithdrawForm";

export default function WithdrawPage() {
  return (
    <div className="mx-auto max-w-md py-4 md:py-8">
      <h1 className="text-2xl font-medium tracking-tight">Withdraw</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Burn shares for a pro-rata claim on the vault's USDC and SOL
        balances. The withdrawal is atomic and bypasses the agent.
      </p>
      <div className="mt-6">
        <WithdrawForm />
      </div>
    </div>
  );
}
