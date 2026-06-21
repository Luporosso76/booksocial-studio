import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Pannello laterale che scivola da destra (riusabile, come Modal ma laterale).
 *
 * - Overlay semitrasparente cliccabile per chiudere.
 * - Pannello con transizione translate-x (entra/esce da destra).
 * - Header con titolo + pulsante di chiusura (X).
 * - Body scrollabile (overflow-y-auto): contenuti alti non sfondano mai il viewport.
 * - Footer opzionale sticky in basso per le azioni.
 * - Chiusura con tasto Esc.
 *
 * Riusa i design token del tema scuro (bg-bg-raised, border-border-subtle, text-content-*).
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  widthClass = "w-full max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}) {
  // Stato di mount ritardato: teniamo il pannello nel DOM durante l'animazione di uscita.
  const [mounted, setMounted] = useState(open);
  // `shown` guida la classe translate-x (true = visibile/aderente al bordo destro).
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Doppio rAF: assicura che il pannello parta fuori schermo e poi animi verso l'interno.
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), 300);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-out",
          shown ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />

      {/* Pannello laterale */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex h-full flex-col overflow-hidden border-l border-border-subtle bg-bg-raised shadow-popover",
          "transition-transform duration-300 ease-drawer will-change-transform",
          widthClass,
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <h2 className="min-w-0 text-base font-semibold text-content-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-md p-1.5 text-content-tertiary transition-[transform,color] duration-150 ease-out-strong hover:text-content-primary active:scale-90"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body scrollabile */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {/* Footer sticky opzionale */}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle bg-bg-raised px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
