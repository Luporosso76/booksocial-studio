import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/api/client";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (updater: T | null | ((prev: T | null) => T | null)) => void;
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof DOMException && err.name === "AbortError") return "";
  if (err instanceof TypeError) {
    // Network-level failure: backend likely not running yet.
    return "Impossibile contattare il backend. Verifica che il server sia avviato su 127.0.0.1:8770.";
  }
  if (err instanceof Error) return err.message;
  return "Si e verificato un errore imprevisto.";
}

/**
 * Loads data via an async function on mount and whenever `deps` change.
 * Cancels in-flight requests on unmount/dep-change. Never throws to render.
 */
export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): AsyncState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    fnRef
      .current(controller.signal)
      .then((res) => {
        if (active) {
          setDataState(res);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        const msg = toMessage(err);
        if (msg) setError(msg);
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((updater: T | null | ((prev: T | null) => T | null)) => {
    setDataState((prev) =>
      typeof updater === "function" ? (updater as (p: T | null) => T | null)(prev) : updater,
    );
  }, []);

  return { data, loading, error, reload, setData };
}

export { toMessage as errorMessage };
