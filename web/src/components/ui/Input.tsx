import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-lg border border-border bg-bg-inset px-3 text-sm text-content-primary " +
  "placeholder:text-content-faint transition-[border-color,box-shadow] duration-150 ease-out-strong " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(fieldBase, "h-9", className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldBase, "min-h-[5rem] resize-y py-2 leading-relaxed", className)}
      {...rest}
    />
  );
});

export const selectClass = cn(fieldBase, "h-9 appearance-none pr-8");

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  const auto = useId();
  const id = htmlFor ?? auto;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-content-secondary">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-snug text-content-tertiary">{hint}</p>}
    </div>
  );
}
