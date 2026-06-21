import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin-fast text-accent", className)} />;
}

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-border bg-bg-hover text-content-secondary",
  accent: "border-accent/30 bg-accent-soft text-accent",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-2xs font-medium",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center animate-fade-in",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bg-hover text-content-tertiary">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-content-tertiary">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-bg-hover", className)}>
      <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger animate-fade-in">
      <span className="leading-snug">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-danger underline-offset-2 transition-transform duration-150 ease-out-strong hover:underline active:scale-95"
        >
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}
