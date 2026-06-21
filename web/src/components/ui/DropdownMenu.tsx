import type { ReactNode } from "react";
import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";

export const DropdownMenu = RadixMenu.Root;
export const DropdownMenuTrigger = RadixMenu.Trigger;

export function DropdownMenuContent({
  children,
  align = "end",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 min-w-[11rem] overflow-hidden rounded-lg border border-border-subtle bg-bg-raised p-1 shadow-popover animate-scale-in",
          className,
        )}
      >
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

export function DropdownMenuItem({
  children,
  onSelect,
  danger,
  className,
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <RadixMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors duration-150",
        danger
          ? "text-danger data-[highlighted]:bg-danger-soft"
          : "text-content-secondary data-[highlighted]:bg-bg-hover data-[highlighted]:text-content-primary",
        className,
      )}
    >
      {children}
    </RadixMenu.Item>
  );
}

export function DropdownMenuSeparator() {
  return <RadixMenu.Separator className="my-1 h-px bg-border-subtle" />;
}
