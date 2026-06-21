import type { ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <RadixTooltip.Provider delayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className="z-50 max-w-xs rounded-md border border-border-subtle bg-bg-raised px-2.5 py-1.5 text-xs leading-snug text-content-secondary shadow-popover animate-scale-in"
          >
            {content}
            <RadixTooltip.Arrow className="fill-bg-raised" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
