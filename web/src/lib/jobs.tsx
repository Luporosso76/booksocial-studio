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
import { getActiveJobs } from "@/api/endpoints";
import type { BackgroundJob } from "@/api/types";

const POLL_MS = 3000;

interface JobsContextValue {
  jobs: BackgroundJob[];
  /** Solo i job di analisi AI dei libri (kind === 'analysis'). */
  analysisJobs: BackgroundJob[];
  /** Solo i job di render dei visual (kind === 'render'). */
  renderJobs: BackgroundJob[];
  /** Solo i job di generazione settimana (kind === 'weekgen'). */
  weekgenJobs: BackgroundJob[];
  /** Solo i job di generazione immagini di scena (kind === 'scenegen'). */
  sceneGenJobs: BackgroundJob[];
  /** Solo i job di rigenerazione immagini (kind === 'mediaRegen'). */
  mediaRegenJobs: BackgroundJob[];
  /** Solo i job di costruzione bibbia visiva (kind === 'visualBible'). */
  visualBibleJobs: BackgroundJob[];
  /** True se esiste un job di analisi in corso per questo libro. */
  isBookAnalyzing: (bookId: string) => boolean;
  /** Forza un poll immediato (es. subito dopo aver avviato una ri-analisi). */
  refresh: () => void;
  /**
   * Registra un callback invocato quando un libro passa da
   * "in analisi" a "non più in analisi" (job terminato).
   * Restituisce una funzione di cleanup.
   */
  onBookAnalysisDone: (bookId: string, cb: () => void) => () => void;
  /**
   * Registra un callback invocato quando un render per questa bozza esce dalla
   * coda (job terminato: completato o fallito), così la card può ricaricare il
   * media e mostrare l'anteprima. Restituisce una funzione di cleanup.
   */
  onPostRenderDone: (postId: string, cb: () => void) => () => void;
}

const JobsContext = createContext<JobsContextValue | null>(null);

export function useJobs(): JobsContextValue {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs must be used within JobsProvider");
  return ctx;
}

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);

  // Set dei bookId attualmente in analisi (snapshot precedente), per rilevare
  // le transizioni analyzing -> done senza dipendere dal ciclo di render.
  const analyzingRef = useRef<Set<string>>(new Set());
  // Listener per-libro registrati da BookDetail per ricaricare al termine.
  const doneListenersRef = useRef<Map<string, Set<() => void>>>(new Map());
  // Set dei postId con un render attivo in coda (snapshot precedente), per
  // rilevare quando un render esce dalla coda e notificare la card della bozza.
  const renderingRef = useRef<Set<string>>(new Set());
  // Listener per-bozza registrati da DraftCard per ricaricare il media al termine.
  const renderListenersRef = useRef<Map<string, Set<() => void>>>(new Map());
  // Trigger manuale di un poll immediato.
  const [pollNonce, setPollNonce] = useState(0);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    const tick = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const { jobs: next } = await getActiveJobs(controller.signal);
        if (!active) return;
        const nextAnalyzing = new Set(
          next.filter((j) => j.kind === "analysis" && j.bookId).map((j) => j.bookId as string),
        );
        // Rileva i libri che erano in analisi e ora non lo sono più.
        for (const bookId of analyzingRef.current) {
          if (!nextAnalyzing.has(bookId)) {
            const listeners = doneListenersRef.current.get(bookId);
            listeners?.forEach((cb) => cb());
          }
        }
        analyzingRef.current = nextAnalyzing;

        // Stessa logica per i render: una bozza con un render in coda che non
        // compare più ha terminato (completato o fallito) → notifica la card.
        const nextRendering = new Set(
          next.filter((j) => j.kind === "render" && j.postId).map((j) => j.postId as string),
        );
        for (const postId of renderingRef.current) {
          if (!nextRendering.has(postId)) {
            const listeners = renderListenersRef.current.get(postId);
            listeners?.forEach((cb) => cb());
          }
        }
        renderingRef.current = nextRendering;

        setJobs(next);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Errore di rete transitorio: riprova al prossimo giro, niente crash.
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(id);
    };
  }, [pollNonce]);

  const refresh = useCallback(() => setPollNonce((n) => n + 1), []);

  const analysisJobs = useMemo(() => jobs.filter((j) => j.kind === "analysis"), [jobs]);
  const renderJobs = useMemo(() => jobs.filter((j) => j.kind === "render"), [jobs]);
  const weekgenJobs = useMemo(() => jobs.filter((j) => j.kind === "weekgen"), [jobs]);
  const sceneGenJobs = useMemo(() => jobs.filter((j) => j.kind === "scenegen"), [jobs]);
  const mediaRegenJobs = useMemo(() => jobs.filter((j) => j.kind === "mediaRegen"), [jobs]);
  const visualBibleJobs = useMemo(() => jobs.filter((j) => j.kind === "visualBible"), [jobs]);

  const isBookAnalyzing = useCallback(
    (bookId: string) => jobs.some((j) => j.kind === "analysis" && j.bookId === bookId),
    [jobs],
  );

  // Factory comune: registra un listener per-chiave su una mappa di set e
  // restituisce il relativo cleanup (usata sia per analisi sia per render).
  const subscribe = useCallback(
    (mapRef: { current: Map<string, Set<() => void>> }, key: string, cb: () => void) => {
      const map = mapRef.current;
      let set = map.get(key);
      if (!set) {
        set = new Set();
        map.set(key, set);
      }
      set.add(cb);
      return () => {
        set?.delete(cb);
        if (set && set.size === 0) map.delete(key);
      };
    },
    [],
  );

  const onBookAnalysisDone = useCallback(
    (bookId: string, cb: () => void) => subscribe(doneListenersRef, bookId, cb),
    [subscribe],
  );

  const onPostRenderDone = useCallback(
    (postId: string, cb: () => void) => subscribe(renderListenersRef, postId, cb),
    [subscribe],
  );

  const value = useMemo(
    () => ({
      jobs,
      analysisJobs,
      renderJobs,
      weekgenJobs,
      sceneGenJobs,
      mediaRegenJobs,
      visualBibleJobs,
      isBookAnalyzing,
      refresh,
      onBookAnalysisDone,
      onPostRenderDone,
    }),
    [
      jobs,
      analysisJobs,
      renderJobs,
      weekgenJobs,
      sceneGenJobs,
      mediaRegenJobs,
      visualBibleJobs,
      isBookAnalyzing,
      refresh,
      onBookAnalysisDone,
      onPostRenderDone,
    ],
  );

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}
