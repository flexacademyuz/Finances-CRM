import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";
import type { StudentStatus } from "@shared/schema";
import { statusColor } from "../lib/format";
import { useI18n } from "../lib/i18n";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      className={twMerge("btn", variant === "primary" ? "btn-primary" : "btn-ghost", className)}
      {...props}
    />
  );
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
  return (
    <span className={twMerge("rounded-full px-2.5 py-0.5 text-xs font-semibold", statusColor[status])}>
      {t(status)}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="flex-1">
      <div className="text-xs text-tg-hint">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-tg-hint">{sub}</div>}
    </Card>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return <div className="py-10 text-center text-sm text-tg-hint">{children ?? t("noData")}</div>;
}

export function Spinner() {
  const { t } = useI18n();
  return <div className="py-10 text-center text-sm text-tg-hint">{t("loading")}</div>;
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-tg-bg p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-lg font-bold">{title}</div>
        {children}
      </div>
    </div>
  );
}
