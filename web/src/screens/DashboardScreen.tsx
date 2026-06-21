import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  Calendar,
  AlertCircle,
  Clock,
  ExternalLink,
  Users,
  Eye,
  Zap,
  CalendarClock,
  Link2,
  Sparkles,
  Clapperboard,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge, EmptyState, ErrorBanner, Skeleton, Spinner } from "@/components/ui/misc";
import { PageTabs } from "@/components/PageTabs";
import { UsageStatsCard } from "@/components/UsageStatsCard";
import { useAsync } from "@/lib/useAsync";
import { useJobs } from "@/lib/jobs";
import { getPages, getPagePosts, getPageInsights } from "@/api/endpoints";
import type { FacebookPage, PageInsights, PostStatus, ScheduledPost } from "@/api/types";
import { metricLabel, statusLabel, mediaTypeLabel, visualKindLabel } from "@/lib/labels";
import { HashtagBreakdown } from "./HashtagBreakdown";

// Formattazione numeri compatta (riusa lo stesso pattern di InsightsScreen).
function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("it-IT");
}

/** Valore di una metrica per nome dall'array metrics; 0 se assente. */
function metricValue(metrics: PageInsights["metrics"], name: string): number {
  return metrics.find((m) => m.metric === name)?.value ?? 0;
}

// ─── KPI top bar (aggregata su tutte le pagine) ─────────────────────────────────

interface AggregatedKpis {
  followers: number;
  coverage: number;
  engagements: number;
  scheduled: number;
}

/**
 * Carica tutte le pagine e, per ciascuna, insight e post; somma i valori.
 * I singoli errori per-pagina vengono ignorati silenziosamente (fallback 0):
 * la barra mostra il totale parziale anziché fallire del tutto.
 */
async function loadAggregatedKpis(signal: AbortSignal): Promise<AggregatedKpis> {
  const pages = await getPages(signal);

  const perPage = await Promise.all(
    pages.map(async (page) => {
      const [insights, posts] = await Promise.all([
        getPageInsights(page.id, "day", signal).catch(() => null),
        getPagePosts(page.id, signal).catch(() => [] as ScheduledPost[]),
      ]);

      const followers = insights?.totals?.followersCount ?? 0;
      const metrics = insights?.metrics ?? [];
      const coverage = metricValue(metrics, "page_total_media_view_unique");
      const engagements = metricValue(metrics, "page_post_engagements");
      const scheduled = posts.filter((p) => p.status === "SCHEDULED").length;

      return { followers, coverage, engagements, scheduled };
    }),
  );

  return perPage.reduce<AggregatedKpis>(
    (acc, p) => ({
      followers: acc.followers + p.followers,
      coverage: acc.coverage + p.coverage,
      engagements: acc.engagements + p.engagements,
      scheduled: acc.scheduled + p.scheduled,
    }),
    { followers: 0, coverage: 0, engagements: 0, scheduled: 0 },
  );
}

interface KpiTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function KpiTile({ icon, label, value }: KpiTileProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-content-tertiary">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-2xl font-bold leading-none text-content-primary">{value}</span>
    </div>
  );
}

function KpiTopBar() {
  const { t } = useTranslation();
  const kpisState = useAsync<AggregatedKpis>((s) => loadAggregatedKpis(s), []);

  if (kpisState.loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (kpisState.error) {
    return <ErrorBanner message={kpisState.error} onRetry={kpisState.reload} />;
  }

  const kpis = kpisState.data ?? {
    followers: 0,
    coverage: 0,
    engagements: 0,
    scheduled: 0,
  };

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiTile
        icon={<Users className="h-4 w-4" />}
        label={t("dashboard.kpiFollowers")}
        value={compactNumber(kpis.followers)}
      />
      <KpiTile
        icon={<Eye className="h-4 w-4" />}
        label={t("dashboard.kpiCoverage")}
        value={compactNumber(kpis.coverage)}
      />
      <KpiTile
        icon={<Zap className="h-4 w-4" />}
        label={t("dashboard.kpiEngagements")}
        value={compactNumber(kpis.engagements)}
      />
      <KpiTile
        icon={<CalendarClock className="h-4 w-4" />}
        label={t("dashboard.kpiScheduled")}
        value={compactNumber(kpis.scheduled)}
      />
    </div>
  );
}

// Compact per-page insight row used in the cross-page summary.
function PageInsightRow({ page }: { page: FacebookPage }) {
  const { t } = useTranslation();
  const insightsState = useAsync<PageInsights>(
    (s) => getPageInsights(page.id, "day", s),
    [page.id],
  );

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-inset px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-content-primary">{page.name}</span>
        {insightsState.data?.fetchedAt && (
          <span className="text-2xs text-content-faint">
            {new Date(insightsState.data.fetchedAt).toLocaleString("it-IT", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
      {insightsState.loading ? (
        <Skeleton className="h-6 w-full" />
      ) : insightsState.error ? (
        <ErrorBanner message={insightsState.error} onRetry={insightsState.reload} />
      ) : insightsState.data?.error ? (
        <ErrorBanner message={insightsState.data.error} onRetry={insightsState.reload} />
      ) : !insightsState.data || insightsState.data.metrics.length === 0 ? (
        <p className="text-xs text-content-tertiary">{t("dashboard.noMetrics")}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {insightsState.data.metrics.map((m) => (
            <div key={m.metric} className="flex flex-col items-start gap-0.5">
              <span className="text-2xs uppercase tracking-wide text-content-faint">
                {metricLabel(m.metric)}
              </span>
              <span className="text-sm font-semibold text-content-primary">
                {m.value.toLocaleString("it-IT")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Static best-time heuristics — TODO: sostituire con dati reali di performance per orario
// quando saranno disponibili dall'API (es. GET /pages/:id/insights/best-hours).
const BEST_HOURS: { slot: string; noteKey: string }[] = [
  { slot: "09:00 – 10:00", noteKey: "dashboard.bestHour1" },
  { slot: "12:30 – 13:30", noteKey: "dashboard.bestHour2" },
  { slot: "19:00 – 21:00", noteKey: "dashboard.bestHour3" },
];

function statusTone(status: PostStatus): "neutral" | "accent" | "success" | "warning" | "danger" {
  switch (status) {
    case "PUBLISHED":
      return "success";
    case "SCHEDULED":
      return "accent";
    case "FAILED":
      return "danger";
    case "DRAFT":
      return "warning";
    default:
      return "neutral";
  }
}

function formatWhen(ts?: number | null): string | null {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleString("it-IT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

/**
 * Sezione "Attività in corso": elenca i job in background (es. analisi AI dei
 * libri) presi dal contesto globale. Nascosta quando non ci sono attività.
 */
function ActiveJobsCard() {
  const { t } = useTranslation();
  const { jobs, analysisJobs, renderJobs } = useJobs();
  if (jobs.length === 0) return null;

  return (
    <Card className="border-accent/30 animate-fade-in">
      <CardHeader
        title={t("dashboard.activeJobsTitle")}
        description={t("dashboard.activeJobsDescription")}
        action={<Badge tone="accent">{jobs.length}</Badge>}
      />
      <CardBody>
        <div className="flex flex-col gap-2 stagger">
          {analysisJobs.map((job) => (
            <div
              key={`a-${job.bookId}-${job.startedAt}`}
              className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent-soft px-4 py-3"
            >
              <Spinner className="h-4 w-4 shrink-0" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-content-primary">
                  {job.title}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-content-tertiary">
                  <Sparkles className="h-3 w-3" />
                  {t("dashboard.bookAnalysisRunning")}
                </span>
              </div>
            </div>
          ))}
          {renderJobs.map((job) => (
            <div
              key={`r-${job.jobId ?? job.postId}-${job.startedAt}`}
              className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent-soft px-4 py-3"
            >
              <Spinner className="h-4 w-4 shrink-0" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-content-primary">
                  {job.renderKind ? visualKindLabel(job.renderKind) : t("dashboard.visual")}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-content-tertiary">
                  <Clapperboard className="h-3 w-3" />
                  {t("dashboard.visualRendering")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

export function DashboardScreen() {
  const { t } = useTranslation();
  const pagesState = useAsync<FacebookPage[]>((s) => getPages(s), []);
  const [pageId, setPageId] = useState("");

  const postsState = useAsync<ScheduledPost[]>(
    (s) => (pageId ? getPagePosts(pageId, s) : Promise.resolve([])),
    [pageId],
  );

  const pages = pagesState.data ?? [];
  const posts = postsState.data ?? [];

  // Imposta la prima pagina come attiva al caricamento (o se quella selezionata
  // non è più valida), così il dettaglio post compare subito senza scelta manuale.
  useEffect(() => {
    if (pages.length === 0) return;
    if (!pageId || !pages.some((p) => p.id === pageId)) {
      setPageId(pages[0].id);
    }
  }, [pages, pageId]);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI top bar: quadro immediato aggregato su tutte le pagine connesse. */}
      <KpiTopBar />

      {/* Attività in background in corso (es. analisi AI): nascosta se nessuna. */}
      <ActiveJobsCard />

      <Card>
        <CardHeader title={t("dashboard.title")} description={t("dashboard.description")} />
        <CardBody>
          {pagesState.error ? (
            <ErrorBanner message={pagesState.error} onRetry={pagesState.reload} />
          ) : pagesState.loading ? (
            <Skeleton className="h-9 w-64" />
          ) : pages.length === 0 ? (
            <EmptyState
              icon={<LayoutDashboard className="h-5 w-5" />}
              title={t("dashboard.noPagesTitle")}
              description={t("dashboard.noPagesDescription")}
              action={
                <NavLink
                  to="/connessione"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out-strong hover:bg-accent-hover"
                >
                  <Link2 className="h-4 w-4" />
                  {t("dashboard.goToConnection")}
                </NavLink>
              }
            />
          ) : (
            <PageTabs pages={pages} activeId={pageId} onChange={setPageId} />
          )}
        </CardBody>
      </Card>

      {pageId && (
        <Card>
          <CardHeader
            title={t("dashboard.postsTitle")}
            description={t("dashboard.postsDescription")}
          />
          <CardBody>
            {postsState.loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : postsState.error ? (
              <ErrorBanner message={postsState.error} onRetry={postsState.reload} />
            ) : posts.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title={t("dashboard.noPostsTitle")}
                description={t("dashboard.noPostsDescription")}
                action={
                  <NavLink
                    to="/pianificatore"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out-strong hover:bg-accent-hover"
                  >
                    <CalendarClock className="h-4 w-4" />
                    {t("dashboard.goToPlanner")}
                  </NavLink>
                }
              />
            ) : (
              <div className="flex flex-col gap-3 stagger">
                {posts.map((p) => {
                  const when = formatWhen(p.scheduledAt);
                  return (
                    <div
                      key={p.id}
                      className="rounded-lg border border-border-subtle bg-bg-inset p-4"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
                          {p.angle && <Badge tone="accent">{p.angle}</Badge>}
                          {p.mediaType && <Badge>{mediaTypeLabel(p.mediaType)}</Badge>}
                        </div>
                        {when && (
                          <span className="inline-flex items-center gap-1 text-xs text-content-tertiary">
                            <Calendar className="h-3 w-3" />
                            {when}
                          </span>
                        )}
                      </div>
                      {p.body && (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-content-secondary">
                          {p.body}
                        </p>
                      )}
                      {p.errorMessage && (
                        <p className="mt-2 inline-flex items-center gap-1 text-xs text-danger">
                          <AlertCircle className="h-3 w-3" />
                          {p.errorMessage}
                        </p>
                      )}
                      <HashtagBreakdown
                        base={p.baseHashtags}
                        specific={p.specificHashtags}
                        final={p.finalHashtags}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Statistiche d'uso del motore di varietà: formati/immagini/citazioni usati. */}
      {pageId && <UsageStatsCard pageId={pageId} />}

      {/* Riepilogo insight + Migliori orari: affiancati su schermi xl. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
        <Card className="min-w-0">
          <CardHeader
            title={t("dashboard.insightsTitle")}
            description={t("dashboard.insightsDescription")}
            action={
              <NavLink
                to="/insight"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline underline-offset-2"
              >
                {t("dashboard.fullDetail")}
                <ExternalLink className="h-3 w-3" />
              </NavLink>
            }
          />
          <CardBody>
            {pagesState.loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : pagesState.error ? (
              <ErrorBanner message={pagesState.error} onRetry={pagesState.reload} />
            ) : pages.length === 0 ? (
              <EmptyState
                icon={<BarChart3 className="h-5 w-5" />}
                title={t("dashboard.noPagesTitle")}
                description={t("dashboard.noPagesInsightsDescription")}
                action={
                  <NavLink
                    to="/connessione"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out-strong hover:bg-accent-hover"
                  >
                    <Link2 className="h-4 w-4" />
                    {t("dashboard.goToConnection")}
                  </NavLink>
                }
              />
            ) : (
              <div className="flex flex-col gap-3 stagger">
                {pages.map((p) => (
                  <PageInsightRow key={p.id} page={p} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="min-w-0">
          <CardHeader
            title={t("dashboard.bestHoursTitle")}
            description={t("dashboard.bestHoursDescription")}
          />
          <CardBody>
            {/* Suggerimento: dati statici — TODO: agganciare dati reali di performance per orario
                quando saranno disponibili dall'API (es. GET /pages/:id/insights/best-hours). */}
            <div className="mb-3 flex items-center gap-2">
              <Badge tone="accent">{t("dashboard.suggestion")}</Badge>
              <span className="text-xs text-content-tertiary">{t("dashboard.bestHoursNote")}</span>
            </div>
            <div className="flex flex-col gap-2 stagger">
              {BEST_HOURS.map(({ slot, noteKey }) => (
                <div
                  key={slot}
                  className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-inset px-4 py-3"
                >
                  <Clock className="h-4 w-4 shrink-0 text-content-tertiary" />
                  <span className="text-sm font-semibold text-content-primary">{slot}</span>
                  <span className="text-xs text-content-tertiary">{t(noteKey)}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
