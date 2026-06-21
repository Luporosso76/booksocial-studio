import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export function Collapsible({
  title,
  summary,
  actions,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  bodyClassName?: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const bodyId = useId();

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border-subtle bg-bg-card transition-colors",
        isOpen && "border-border",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-accent-ring"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-content-tertiary transition-transform duration-150 ease-out-strong",
              isOpen ? "rotate-0" : "-rotate-90",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-content-primary">
              {title}
            </span>
            {summary != null && !isOpen && (
              <span className="mt-0.5 block truncate text-xs leading-snug text-content-tertiary">
                {summary}
              </span>
            )}
          </span>
        </button>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {isOpen && (
        <div
          id={bodyId}
          className={cn(
            "border-t border-border-subtle px-3.5 py-3 animate-fade-in",
            bodyClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
