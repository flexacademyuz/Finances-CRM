import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { Link } from "wouter";
import { twMerge } from "tailwind-merge";
import type { StudentStatus, PaymentMethod } from "@shared/schema";
import { statusColor } from "../lib/format";
import { useI18n } from "../lib/i18n";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const v = variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "btn-ghost";
  return <button className={twMerge("btn", v, className)} {...props} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={twMerge("card", className)}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={twMerge("input", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={twMerge("select", className)} {...props}>
      {children}
    </select>
  );
}

/**
 * Compact segmented control — a slim alternative to a row of full-size buttons
 * for small either/or choices (view toggles, payment method, tabs). Pass `full`
 * to stretch the segments edge-to-edge (e.g. inside a modal).
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  full,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  full?: boolean;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={twMerge(
        // LimeTalk segmented: a soft gray pill track; the active tab is a white
        // pill floating on a subtle shadow (rather than a solid-fill highlight).
        "inline-flex rounded-pill bg-bg p-1",
        full && "flex w-full",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={twMerge(
              "rounded-pill px-3.5 py-1.5 text-sm font-semibold transition-colors",
              full && "flex-1",
              active
                ? "bg-surface text-text shadow-[0_1px_3px_rgba(16,24,40,0.12),0_1px_2px_-1px_rgba(16,24,40,0.10)]"
                : "text-muted hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatusBadge({ status }: { status: StudentStatus }) {
  const { t } = useI18n();
  // Awaiting & overdue gently pulse to draw attention (Change 3).
  const pulse = status === "awaiting_payment" || status === "overdue" ? "animate-pulse-soft" : "";
  return (
    <span
      className={twMerge(
        "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
        statusColor[status],
        pulse,
      )}
    >
      {t(status)}
    </span>
  );
}

export function MethodTag({ method }: { method: PaymentMethod }) {
  const { t } = useI18n();
  const cls =
    method === "cash"
      ? "bg-accent/10 text-accent"
      : "bg-primary/10 text-primary";
  return <span className={twMerge("rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{t(method)}</span>;
}

const ACCENTS: Record<string, string> = {
  primary: "border-l-primary",
  accent: "border-l-accent",
  warning: "border-l-warning",
  danger: "border-l-danger",
  freeze: "border-l-freeze",
  discount: "border-l-discount",
};

export function Stat({
  label,
  value,
  sub,
  accent,
  icon,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: keyof typeof ACCENTS;
  icon?: ReactNode;
  /** When set, the whole stat becomes a link with a hover affordance. */
  href?: string;
}) {
  const card = (
    <Card
      className={twMerge(
        "h-full flex-1 !p-4",
        accent && `border-l-4 ${ACCENTS[accent]}`,
        href && "cursor-pointer transition hover:border-primary/40 hover:shadow-card-hover",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
        {icon}
      </div>
      <div className="figure mt-1 text-xl font-bold">{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
  return href ? (
    <Link href={href} className="flex min-w-0 flex-1">
      {card}
    </Link>
  ) : (
    card
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return <div className="py-10 text-center text-sm text-muted">{children ?? t("noData")}</div>;
}

export function Spinner() {
  const { t } = useI18n();
  return <div className="py-10 text-center text-sm text-muted">{t("loading")}</div>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in sm:items-center"
      onClick={onClose}
    >
      {/* Capped to the dynamic viewport height with a scrollable body so tall
          forms stay fully reachable when the on-screen keyboard is open (the
          title stays pinned; fields scroll under it). */}
      <div
        className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-2xl bg-surface shadow-card-hover animate-scale-in sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pb-3 pt-5 text-lg font-bold">{title}</div>
        <div className="overflow-y-auto px-5 pb-8">{children}</div>
      </div>
    </div>
  );
}
