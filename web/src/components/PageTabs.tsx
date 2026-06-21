import { cn } from "@/lib/cn";
import type { FacebookPage } from "@/api/types";

interface PageTabsProps {
  pages: FacebookPage[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Iniziale della pagina per il piccolo avatar tondo. */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/**
 * Barra di tab orizzontale, una tab per pagina Facebook connessa.
 * Sostituisce il vecchio <select> di selezione pagina su più schermate.
 *
 * - Tab attiva: pill morbida (bg-accent-soft) con testo accent.
 * - Tab inattiva: testo secondario, hover su bg-bg-hover.
 * - Overflow: scroll orizzontale senza wrap; scrollbar nascosta con discrezione.
 * - Accessibile: role="tablist" / "tab" con aria-selected.
 */
export function PageTabs({ pages, activeId, onChange, className }: PageTabsProps) {
  if (pages.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Seleziona pagina"
      className={cn(
        "flex items-center gap-1 overflow-x-auto border-b border-border-subtle pb-px",
        // Nasconde la scrollbar mantenendo lo scroll orizzontale.
        "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {pages.map((page) => {
        const active = page.id === activeId;
        return (
          <button
            key={page.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={page.name}
            onClick={() => onChange(page.id)}
            className={cn(
              "group flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-2",
              "text-sm font-medium transition-all duration-150 ease-out-strong",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
              active
                ? "border-accent bg-accent-soft text-accent"
                : "border-transparent text-content-secondary hover:bg-bg-hover hover:text-content-primary",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold transition-colors duration-150 ease-out-strong",
                active
                  ? "bg-accent text-white"
                  : "bg-bg-hover text-content-tertiary group-hover:text-content-secondary",
              )}
              aria-hidden="true"
            >
              {initial(page.name)}
            </span>
            <span className="max-w-[12rem] truncate">{page.name}</span>
          </button>
        );
      })}
    </div>
  );
}
