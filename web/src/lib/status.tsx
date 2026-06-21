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
import { getStatus } from "@/api/endpoints";
import type { AppStatus } from "@/api/types";

interface StatusContextValue {
  status: AppStatus | null;
  online: boolean;
  loading: boolean;
  refresh: () => void;
}

const StatusContext = createContext<StatusContextValue | null>(null);

export function useStatus(): StatusContextValue {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error("useStatus must be used within StatusProvider");
  return ctx;
}

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const firstLoad = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (firstLoad.current) setLoading(true);
    getStatus(controller.signal)
      .then((s) => {
        if (!active) return;
        setStatus(s);
        setOnline(true);
        setLoading(false);
        firstLoad.current = false;
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setOnline(false);
        setLoading(false);
        firstLoad.current = false;
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [tick]);

  // Light polling so the header stays fresh.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 20000);
    return () => window.clearInterval(id);
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const value = useMemo(
    () => ({ status, online, loading, refresh }),
    [status, online, loading, refresh],
  );

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}
