import { DepositForm } from "@/components/DepositForm";

export default function DepositPage() {
  return (
    <div className="mx-auto max-w-md py-4 md:py-8">
      <h1 className="text-2xl font-medium tracking-tight">Deposit</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Add USDC or SOL to the vault. You receive vault shares (SPQS) at the
        live NAV; redeem any time on the withdraw page.
      </p>
      <div className="mt-6">
        <DepositForm />
      </div>
    </div>
  );
}
