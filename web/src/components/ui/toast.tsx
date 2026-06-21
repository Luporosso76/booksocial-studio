import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const ICONS: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-success" />,
  error: <AlertTriangle className="h-4 w-4 text-danger" />,
  info: <Info className="h-4 w-4 text-accent" />,
};

const DURATION = 4200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, kind, message }]);
      // Gli errori NON si auto-chiudono: restano finche' l'utente non li chiude (X).
      if (kind !== "error") {
        const handle = window.setTimeout(() => dismiss(id), DURATION);
        timers.current.set(id, handle);
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((h) => window.clearTimeout(h));
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border bg-bg-card/95 px-4 py-3 shadow-popover backdrop-blur",
              "animate-slide-up-in",
              t.kind === "error" && "border-danger/40",
              t.kind === "success" && "border-success/30",
            )}
            style={{ transformOrigin: "bottom right" }}
          >
            <span className="mt-0.5 shrink-0">{ICONS[t.kind]}</span>
            <p className="flex-1 text-sm leading-snug text-content-primary">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-mr-1 -mt-0.5 rounded-md p-1 text-content-tertiary transition-[transform,color] duration-150 ease-out-strong hover:text-content-primary active:scale-90"
              aria-label="Chiudi notifica"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
