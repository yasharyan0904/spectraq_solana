import Link from "next/link";

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7" : "h-8";
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5">
      <div
        className={`relative ${dim} aspect-square rounded-md bg-gradient-to-br from-[var(--color-brand)] to-[#3a2db0] flex items-center justify-center`}
      >
        <span className="mono text-[15px] font-bold text-white">σ</span>
      </div>
      <span className="text-[15px] font-semibold tracking-tight text-[var(--color-text)] group-hover:text-white">
        SpectraQ
      </span>
    </Link>
  );
}
