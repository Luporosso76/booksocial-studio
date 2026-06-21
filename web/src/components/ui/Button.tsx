import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium " +
  "transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-out-strong " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base " +
  "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-accent-glow hover:bg-accent-hover",
  secondary:
    "border border-border bg-bg-card text-content-primary hover:bg-bg-hover hover:border-border-strong",
  ghost: "text-content-secondary hover:bg-bg-hover hover:text-content-primary",
  danger: "border border-danger/30 bg-danger-soft text-danger hover:bg-danger/20",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-9 px-4 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin-fast" />}
      {children}
    </button>
  );
});
