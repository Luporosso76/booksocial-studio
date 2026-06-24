import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  Clapperboard,
  Cpu,
  Image as ImageIcon,
  Lock,
  RefreshCw,
  Sparkles,
  Unlock,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useStatus } from "@/lib/status";
import { useJobs } from "@/lib/jobs";
import { Badge, Spinner } from "@/components/ui/misc";
import { visualKindLabel } from "@/lib/labels";
import { cn } from "@/lib/cn";

const TITLE_KEYS: Record<string, string> = {
  "/connessione": "nav.connection",
  "/libri": "nav.books",
  "/pianificatore": "nav.planner",
  "/programmati": "nav.scheduled",
  "/insight": "nav.insights",
  "/gestione": "nav.pageManagement",
  "/impostazioni": "nav.settings",
  "/dashboard": "nav.dashboard",
};

export function Header() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { status, online, loading } = useStatus();

  const titleKey = Object.keys(TITLE_KEYS).find((k) => pathname.startsWith(k));
  const sectionTitle = titleKey ? t(TITLE_KEYS[titleKey]) : t("header.appTitle");

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-raised/80 px-6 backdrop-blur">
      <h1 className="text-base font-semibold text-content-primary">{sectionTitle}</h1>

      <div className="flex flex-wrap items-center gap-2">
        <JobsIndicator />
        {!online ? (
          <Badge tone="danger">
            <WifiOff className="h-3 w-3" /> {t("header.backendOffline")}
          </Badge>
        ) : loading && !status ? (
          <Badge tone="neutral">
            <Wifi className="h-3 w-3" /> {t("header.connecting")}
          </Badge>
        ) : status ? (
          <>
            {(() => {
              const textEngine = status.textActive ?? status.textProvider ?? status.provider;
              const textFallback = textEngine?.includes("(fallback)") ?? false;
              return (
                <Badge tone={textFallback ? "warning" : "accent"}>
                  <Cpu className="h-3 w-3" />
                  {textEngine || t("header.engineFallback")}
                </Badge>
              );
            })()}
            {(() => {
              const imageEngine = status.imageActive ?? status.imageProvider;
              const imageFallback = imageEngine?.includes("(fallback)") ?? false;
              return imageEngine ? (
                <Badge tone={imageFallback ? "warning" : "accent"}>
                  <ImageIcon className="h-3 w-3" />
                  {imageEngine}
                </Badge>
              ) : null;
            })()}
            <Badge tone={status.secretsUnlocked ? "success" : "warning"}>
              {status.secretsUnlocked ? (
                <Unlock className="h-3 w-3" />
              ) : (
                <Lock className="h-3 w-3" />
              )}
              {status.secretsUnlocked ? t("header.vaultOpen") : t("header.vaultLocked")}
            </Badge>
            <span
              className={cn("ml-1 hidden items-center gap-1 text-xs text-content-tertiary sm:flex")}
            >
              {t("header.stats", { pages: status.pages, books: status.books })}
            </span>
          </>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Indicatore globale delle attività in background (es. analisi AI dei libri).
 * Visibile su ogni pagina finché esiste almeno un job in corso; al click rivela
 * l'elenco dei titoli. Si chiude con Escape o click fuori. Si nasconde quando
 * non ci sono job.
 */
function JobsIndicator() {
  const { t } = useTranslation();
  const {
    jobs,
    analysisJobs,
    renderJobs,
    weekgenJobs,
    sceneGenJobs,
    mediaRegenJobs,
    visualBibleJobs,
  } = useJobs();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  if (jobs.length === 0) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("header.jobsRunning", { count: jobs.length })}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2 py-0.5 text-2xs font-medium text-accent transition-colors duration-150 ease-out-strong hover:bg-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      >
        <Spinner className="h-3 w-3" />
        {t("header.jobsRunning", { count: jobs.length })}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 min-w-[16rem] max-w-[calc(100vw-2rem)] origin-top-right">
          <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-raised shadow-card">
            <div className="border-b border-border-subtle px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-content-faint">
              {t("header.jobsPanelTitle")}
            </div>
            <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
              {analysisJobs.map((job) => (
                <li
                  key={`a-${job.bookId}-${job.startedAt}`}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-content-secondary"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="min-w-0 truncate">
                    {t("header.jobAnalysis")}{" "}
                    <span className="font-medium text-content-primary">«{job.title}»</span>
                  </span>
                </li>
              ))}
              {renderJobs.map((job) => (
                <li
                  key={`r-${job.jobId ?? job.postId}-${job.startedAt}`}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-content-secondary"
                >
                  <Clapperboard className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="min-w-0 truncate">
                    {t("header.jobRendering")}{" "}
                    <span className="font-medium text-content-primary">
                      {job.renderKind ? visualKindLabel(job.renderKind) : "visual"}
                    </span>
                  </span>
                </li>
              ))}
              {weekgenJobs.map((job) => (
                <li
                  key={`w-${job.pageId}-${job.startedAt}`}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-content-secondary"
                >
                  <CalendarClock className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="min-w-0 truncate">
                    {t("header.jobWeekGen")}
                    {typeof job.planned === "number" && job.planned > 0 && (
                      <span className="font-medium text-content-primary">
                        {" "}
                        {job.created ?? 0}/{job.planned}
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {sceneGenJobs.map((job) => (
                <li
                  key={`s-${job.bookId}-${job.startedAt}`}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-content-secondary"
                >
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="min-w-0 truncate">
                    {t("header.jobSceneGen")}
                    {typeof job.planned === "number" && job.planned > 0 && (
                      <span className="font-medium text-content-primary">
                        {" "}
                        {job.created ?? 0}/{job.planned}
                      </span>
                    )}
                    {job.waiting && (
                      <span className="text-content-faint"> {t("header.jobWaiting")}</span>
                    )}
                  </span>
                </li>
              ))}
              {mediaRegenJobs.map((job) => (
                <li
                  key={`mr-${job.startedAt}`}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-content-secondary"
                >
                  <RefreshCw className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="min-w-0 truncate">
                    {t("header.jobMediaRegen")}
                    {typeof job.planned === "number" && job.planned > 0 && (
                      <span className="font-medium text-content-primary">
                        {" "}
                        {job.created ?? 0}/{job.planned}
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {visualBibleJobs.map((job) => {
                const runningStep = job.steps?.find((s) => s.status === "running");
                return (
                  <li
                    key={`vb-${job.bookId}-${job.startedAt}`}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-content-secondary"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
                    <span className="min-w-0 truncate">
                      {t("header.jobVisualBible")}
                      {runningStep ? (
                        <span className="font-medium text-content-primary">
                          {" — "}
                          {t("visualBible.step." + runningStep.key, {
                            defaultValue: runningStep.label,
                          })}
                          {runningStep.total > 1 && ` ${runningStep.done}/${runningStep.total}`}
                        </span>
                      ) : (
                        <span className="font-medium text-content-primary">
                          {" "}
                          — {t("header.jobVisualBibleRunning")}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
