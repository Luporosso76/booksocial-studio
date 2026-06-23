import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Il titolo della sezione è mostrato dalla topbar globale (Header), quindi qui NON si ripete.
// `title` resta accettato per compatibilità ma non viene reso. Senza descrizione né azioni non
// renderizza nulla.
export function PageHeader({
  description,
  actions,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  if (!description && !actions) return null;
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center",
        description ? "sm:justify-between" : "sm:justify-end",
        className,
      )}
    >
      {description && (
        <div className="min-w-0">
          <p className="text-sm text-content-tertiary">{description}</p>
        </div>
      )}
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
