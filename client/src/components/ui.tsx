import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
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
    <select className={twMerge("input appearance-none", className)} {...props}>
      {children}
    </select>
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
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: keyof typeof ACCENTS;
  icon?: ReactNode;
}) {
  return (
    <Card className={twMerge("flex-1", accent && `border-l-4 ${ACCENTS[accent]}`)}>
      <div className="flex items-start justify-between">
        <div className="text-xs text-muted">{label}</div>
        {icon}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
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
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface p-5 pb-8 shadow-card-hover animate-scale-in sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-lg font-bold">{title}</div>
        {children}
      </div>
    </div>
  );
}
