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
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

const TITLE_KEYS: Record<string, string> = {
  "/connessione": "nav.connection",
  "/libri": "nav.books",
  "/pianificatore": "nav.planner",
  "/dashboard": "nav.dashboard",
};

export function Header() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { status, online, loading } = useStatus();

  const titleKey = Object.keys(TITLE_KEYS).find((k) => pathname.startsWith(k));
  const sectionTitle = titleKey ? t(TITLE_KEYS[titleKey]) : t("header.appTitle");

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-raised/80 px-6 backdrop-blur">
      <h1 className="text-sm font-semibold text-content-primary">{sectionTitle}</h1>

      <div className="flex items-center gap-2">
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
            <Badge tone="accent">
              <Cpu className="h-3 w-3" />
              {status.provider || t("header.engineFallback")}
            </Badge>
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
        <LanguageSwitcher />
      </div>
    </header>
  );
}

/**
 * Indicatore globale delle attività in background (es. analisi AI dei libri).
 * Visibile su ogni pagina finché esiste almeno un job in corso; al passaggio
 * del mouse / focus rivela l'elenco dei titoli. Si nasconde quando non ci sono job.
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
  if (jobs.length === 0) return null;

  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={t("header.jobsRunning", { count: jobs.length })}
        className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2 py-0.5 text-2xs font-medium text-accent transition-colors duration-150 ease-out-strong hover:bg-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      >
        <Spinner className="h-3 w-3" />
        {t("header.jobsRunning", { count: jobs.length })}
      </button>

      <div className="invisible absolute right-0 top-full z-50 mt-2 w-72 origin-top-right scale-95 opacity-0 transition-[opacity,transform] duration-150 ease-out-strong group-hover:visible group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:scale-100 group-focus-within:opacity-100">
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-raised shadow-card">
          <div className="border-b border-border-subtle px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-content-faint">
            {t("header.jobsPanelTitle")}
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
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
    </div>
  );
}
