import { type HTMLAttributes, type ReactNode } from "react";

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 ${className}`}
    >
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h3 className="text-sm font-medium text-[var(--color-text)]">{title}</h3>
            )}
            {subtitle && (
              <p className="mt-1 text-xs text-[var(--color-muted)]">{subtitle}</p>
            )}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  positive,
  negative,
  mono = true,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  positive?: boolean;
  negative?: boolean;
  mono?: boolean;
}) {
  const valueColor = positive
    ? "text-[var(--color-positive)]"
    : negative
      ? "text-[var(--color-negative)]"
      : "text-[var(--color-text)]";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
        {label}
      </div>
      <div
        className={`mt-1 text-xl ${mono ? "mono" : ""} ${valueColor}`}
        style={{ fontWeight: 500 }}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-[var(--color-muted)]">{hint}</div>}
    </div>
  );
}
