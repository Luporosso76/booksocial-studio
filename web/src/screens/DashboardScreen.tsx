import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  Calendar,
  AlertCircle,
  ExternalLink,
  Users,
  Eye,
  Zap,
  CalendarClock,
  Link2,
  Sparkles,
  Clapperboard,
  TrendingUp,
  Facebook,
  Instagram,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Collapsible } from "@/components/ui/Collapsible";
import { Badge, EmptyState, ErrorBanner, Skeleton, Spinner } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { UsageStatsCard } from "@/components/UsageStatsCard";
import { cn } from "@/lib/cn";
import { useAsync } from "@/lib/useAsync";
import { useJobs } from "@/lib/jobs";
import {
  getPages,
  getPagePosts,
  getPageInsights,
  getIgInsights,
  getIgAccount,
} from "@/api/endpoints";
import type {
  FacebookPage,
  PageInsights,
  IgInsightsResponse,
  IgAccountResponse,
  PostStatus,
  ScheduledPost,
} from "@/api/types";
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

type KpiColor = "indigo" | "sky" | "rose" | "amber";

const KPI_COLORS: Record<KpiColor, { chip: string; glow: string }> = {
  indigo: {
    chip: "bg-indigo-500/15 text-indigo-300",
    glow: "hover:shadow-[0_0_36px_-12px_rgba(129,140,248,0.55)]",
  },
  sky: {
    chip: "bg-sky-500/15 text-sky-300",
    glow: "hover:shadow-[0_0_36px_-12px_rgba(56,189,248,0.55)]",
  },
  rose: {
    chip: "bg-rose-500/15 text-rose-300",
    glow: "hover:shadow-[0_0_36px_-12px_rgba(251,113,133,0.55)]",
  },
  amber: {
    chip: "bg-amber-500/15 text-amber-300",
    glow: "hover:shadow-[0_0_36px_-12px_rgba(251,191,36,0.55)]",
  },
};

interface KpiTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: KpiColor;
}

function KpiTile({ icon, label, value, color }: KpiTileProps) {
  const c = KPI_COLORS[color];
  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-card p-4 shadow-card",
        "transition-[transform,box-shadow] duration-200 ease-out-strong",
        "hover:-translate-y-0.5 hover:border-border",
        c.glow,
      )}
    >
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", c.chip)}>
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-2xl font-bold leading-none text-content-primary tabular-nums">
          {value}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">
          {label}
        </span>
      </div>
    </div>
  );
}

function KpiRow({
  followers,
  coverage,
  interactions,
  scheduled,
}: {
  followers: string;
  coverage: string;
  interactions: string;
  scheduled: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile
        icon={<Users className="h-5 w-5" />}
        label={t("dashboard.kpiFollowers")}
        value={followers}
        color="indigo"
      />
      <KpiTile
        icon={<Eye className="h-5 w-5" />}
        label={t("dashboard.kpiCoverage")}
        value={coverage}
        color="sky"
      />
      <KpiTile
        icon={<Zap className="h-5 w-5" />}
        label={t("dashboard.kpiEngagements")}
        value={interactions}
        color="rose"
      />
      <KpiTile
        icon={<CalendarClock className="h-5 w-5" />}
        label={t("dashboard.kpiScheduled")}
        value={scheduled}
        color="amber"
      />
    </div>
  );
}

function KpiSkeletonRow() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[5.75rem] w-full rounded-xl" />
      ))}
    </div>
  );
}

function PageKpiSection({ page }: { page: FacebookPage }) {
  const insState = useAsync<PageInsights>((s) => getPageInsights(page.id, "day", s), [page.id]);
  const postsState = useAsync<ScheduledPost[]>((s) => getPagePosts(page.id, s), [page.id]);
  const hasIg = !!page.igUserId;
  const igAccState = useAsync<IgAccountResponse | null>(
    (s) => (hasIg ? getIgAccount(page.id, s) : Promise.resolve(null)),
    [page.id, hasIg],
  );
  const igInsState = useAsync<IgInsightsResponse | null>(
    (s) => (hasIg ? getIgInsights(page.id, "day", s) : Promise.resolve(null)),
    [page.id, hasIg],
  );

  const allPosts = postsState.data ?? [];
  const fbMetrics = insState.data?.metrics ?? [];
  const fbScheduled = allPosts.filter(
    (p) => p.status === "SCHEDULED" && p.platform !== "instagram",
  ).length;
  const igScheduled = allPosts.filter(
    (p) => p.status === "SCHEDULED" && p.platform === "instagram",
  ).length;
  const igMetric = (name: string) =>
    igInsState.data?.metrics.find((m) => m.metric === name)?.value ?? 0;
  const igUsername = igAccState.data?.account?.username ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2.5 flex items-center gap-2 text-sm">
          <Facebook className="h-4 w-4 text-sky-300" />
          <span className="truncate font-semibold text-content-primary">{page.name}</span>
          <span className="text-content-tertiary">· Facebook</span>
        </div>
        {insState.loading || postsState.loading ? (
          <KpiSkeletonRow />
        ) : (
          <KpiRow
            followers={compactNumber(insState.data?.totals?.followersCount ?? 0)}
            coverage={compactNumber(metricValue(fbMetrics, "page_total_media_view_unique"))}
            interactions={compactNumber(metricValue(fbMetrics, "page_post_engagements"))}
            scheduled={compactNumber(fbScheduled)}
          />
        )}
      </div>

      {hasIg && (
        <div>
          <div className="mb-2.5 flex items-center gap-2 text-sm">
            <Instagram className="h-4 w-4 text-rose-300" />
            <span className="truncate font-semibold text-content-primary">
              {igUsername ? `@${igUsername}` : page.name}
            </span>
            <span className="text-content-tertiary">· Instagram</span>
          </div>
          {igAccState.loading || igInsState.loading || postsState.loading ? (
            <KpiSkeletonRow />
          ) : (
            <KpiRow
              followers={compactNumber(igAccState.data?.account?.followersCount ?? 0)}
              coverage={compactNumber(igMetric("reach"))}
              interactions="—"
              scheduled={compactNumber(igScheduled)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function KpiTopBar({ pages }: { pages: FacebookPage[] }) {
  if (pages.length === 0) return null;
  return (
    <div className="flex flex-col gap-6">
      {pages.map((p) => (
        <PageKpiSection key={p.id} page={p} />
      ))}
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
        <div className="flex flex-wrap gap-2">
          {insightsState.data.metrics.map((m) => (
            <div
              key={m.metric}
              className="flex flex-col items-start gap-1 rounded-md bg-bg-hover px-2 py-1.5"
            >
              <span className="text-2xs uppercase tracking-wide text-content-tertiary">
                {metricLabel(m.metric)}
              </span>
              <span className="text-sm font-semibold text-content-secondary">
                {m.value.toLocaleString("it-IT")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

type DashSection = "post" | "usage" | "insight";

function DashSectionTabs({
  active,
  onChange,
}: {
  active: DashSection;
  onChange: (s: DashSection) => void;
}) {
  const { t } = useTranslation();
  const tabs: { id: DashSection; label: string; icon: typeof FileText; activeColor: string }[] = [
    {
      id: "post",
      label: t("dashboard.sectionPost"),
      icon: FileText,
      activeColor: "text-indigo-300",
    },
    {
      id: "usage",
      label: t("dashboard.sectionUsage"),
      icon: BarChart3,
      activeColor: "text-sky-300",
    },
    {
      id: "insight",
      label: t("dashboard.sectionInsight"),
      icon: TrendingUp,
      activeColor: "text-rose-300",
    },
  ];
  return (
    <div
      role="tablist"
      aria-label={t("dashboard.sectionsAria")}
      className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 -mb-px border-b-2 px-3.5 pb-2.5 pt-1 text-sm font-medium",
              "transition-colors duration-150 ease-out-strong",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
              isActive
                ? "border-accent text-content-primary"
                : "border-transparent text-content-tertiary hover:text-content-primary",
            )}
          >
            <Icon className={cn("h-4 w-4", isActive ? tab.activeColor : "")} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

type Platform = "fb" | "ig";

function PlatformSubTabs({
  active,
  onChange,
  hasInstagram,
}: {
  active: Platform;
  onChange: (p: Platform) => void;
  hasInstagram: boolean;
}) {
  const { t } = useTranslation();
  const tabs = [
    { id: "fb" as const, label: "Facebook", icon: Facebook, color: "text-sky-300" },
    ...(hasInstagram
      ? [{ id: "ig" as const, label: "Instagram", icon: Instagram, color: "text-rose-300" }]
      : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <div
      role="tablist"
      aria-label={t("dashboard.platformAria")}
      className="inline-flex items-center gap-1 self-start rounded-lg border border-border-subtle bg-bg-inset p-1"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
              "transition-colors duration-150 ease-out-strong",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
              isActive
                ? "bg-bg-card text-content-primary shadow-card"
                : "text-content-tertiary hover:text-content-primary",
            )}
          >
            <Icon className={cn("h-4 w-4", isActive ? tab.color : "")} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function IgInsightRow({ page }: { page: FacebookPage }) {
  const { t } = useTranslation();
  const state = useAsync<IgInsightsResponse>((s) => getIgInsights(page.id, "day", s), [page.id]);
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-inset px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Instagram className="h-4 w-4 text-rose-300" />
        <span className="text-sm font-semibold text-content-primary">{page.name}</span>
      </div>
      {state.loading ? (
        <Skeleton className="h-6 w-full" />
      ) : state.error ? (
        <ErrorBanner message={state.error} onRetry={state.reload} />
      ) : state.data?.error ? (
        <ErrorBanner message={state.data.error} onRetry={state.reload} />
      ) : !state.data || state.data.metrics.length === 0 ? (
        <p className="text-xs text-content-tertiary">{t("dashboard.noIgMetrics")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {state.data.metrics.map((m) => (
            <div
              key={m.metric}
              className="flex flex-col items-start gap-1 rounded-md bg-bg-hover px-2 py-1.5"
            >
              <span className="text-2xs uppercase tracking-wide text-content-tertiary">
                {metricLabel(m.metric)}
              </span>
              <span className="text-sm font-semibold text-content-secondary">
                {(m.value ?? 0).toLocaleString("it-IT")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PostList({ posts }: { posts: ScheduledPost[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 stagger">
      {posts.map((p) => {
        const when = formatWhen(p.scheduledAt);
        return (
          <div key={p.id} className="rounded-lg border border-border-subtle bg-bg-inset p-4">
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
              <p className="mt-2 flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {p.errorMessage}
              </p>
            )}
            {p.baseHashtags?.length || p.specificHashtags?.length || p.finalHashtags?.length ? (
              <Collapsible
                title={t("dashboard.hashtagsTitle")}
                summary={p.finalHashtags?.slice(0, 3).join(" ")}
                className="mt-2"
              >
                <HashtagBreakdown
                  base={p.baseHashtags}
                  specific={p.specificHashtags}
                  final={p.finalHashtags}
                />
              </Collapsible>
            ) : (
              <HashtagBreakdown
                base={p.baseHashtags}
                specific={p.specificHashtags}
                final={p.finalHashtags}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DashboardScreen() {
  const { t } = useTranslation();
  const pagesState = useAsync<FacebookPage[]>((s) => getPages(s), []);
  const [pageId, setPageId] = useState("");
  const [section, setSection] = useState<DashSection>("post");
  const [postPlatform, setPostPlatform] = useState<Platform>("fb");
  const [insightPlatform, setInsightPlatform] = useState<Platform>("fb");

  const postsState = useAsync<ScheduledPost[]>(
    (s) => (pageId ? getPagePosts(pageId, s) : Promise.resolve([])),
    [pageId],
  );

  const pages = useMemo(() => pagesState.data ?? [], [pagesState.data]);
  const posts = postsState.data ?? [];

  const activePage = pages.find((p) => p.id === pageId) ?? null;
  const pageHasIg = !!activePage?.igUserId;
  const igPages = pages.filter((p) => p.igUserId);
  const hasAnyIg = igPages.length > 0;
  const effPostPlatform: Platform = postPlatform === "ig" && pageHasIg ? "ig" : "fb";
  const effInsightPlatform: Platform = insightPlatform === "ig" && hasAnyIg ? "ig" : "fb";

  const fbPosts = posts.filter((p) => p.platform !== "instagram");
  const igPosts = posts.filter((p) => p.platform === "instagram");
  const shownPosts = effPostPlatform === "ig" ? igPosts : fbPosts;

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
      <PageHeader title={t("dashboard.title")} description={t("dashboard.headerDescription")} />

      {pagesState.loading ? <KpiSkeletonRow /> : <KpiTopBar pages={pages} />}

      <ActiveJobsCard />

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-indigo-300" />
              {t("dashboard.selectPageTitle")}
            </span>
          }
          description={t("dashboard.selectPageDescription")}
        />
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

      <DashSectionTabs active={section} onChange={setSection} />

      {section === "post" &&
        (pageId && activePage ? (
          <div className="flex flex-col gap-4 animate-fade-in">
            <PlatformSubTabs
              active={effPostPlatform}
              onChange={setPostPlatform}
              hasInstagram={pageHasIg}
            />
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {effPostPlatform === "ig" ? (
                      <Instagram className="h-4 w-4 text-rose-300" />
                    ) : (
                      <FileText className="h-4 w-4 text-indigo-300" />
                    )}
                    {effPostPlatform === "ig"
                      ? t("dashboard.postsIgTitle")
                      : t("dashboard.postsFbTitle")}
                  </span>
                }
                description={
                  effPostPlatform === "ig"
                    ? t("dashboard.postsIgDescription")
                    : t("dashboard.postsFbDescription")
                }
              />
              <CardBody>
                {postsState.loading ? (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : postsState.error ? (
                  <ErrorBanner message={postsState.error} onRetry={postsState.reload} />
                ) : shownPosts.length === 0 ? (
                  <EmptyState
                    icon={
                      effPostPlatform === "ig" ? (
                        <Instagram className="h-5 w-5" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )
                    }
                    title={
                      effPostPlatform === "ig"
                        ? t("dashboard.noPostsIgTitle")
                        : t("dashboard.noPostsFbTitle")
                    }
                    description={
                      effPostPlatform === "ig"
                        ? t("dashboard.noPostsIgDescription")
                        : t("dashboard.noPostsFbDescription")
                    }
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
                  <PostList posts={shownPosts} />
                )}
              </CardBody>
            </Card>
          </div>
        ) : (
          <Card className="animate-fade-in">
            <CardBody>
              <p className="text-sm text-content-tertiary">{t("dashboard.selectPageForPosts")}</p>
            </CardBody>
          </Card>
        ))}

      {section === "usage" &&
        (pageId ? (
          <div className="animate-fade-in">
            <UsageStatsCard pageId={pageId} />
          </div>
        ) : (
          <Card className="animate-fade-in">
            <CardBody>
              <p className="text-sm text-content-tertiary">{t("dashboard.selectPageForUsage")}</p>
            </CardBody>
          </Card>
        ))}

      {section === "insight" && (
        <div className="flex flex-col gap-4 animate-fade-in">
          <PlatformSubTabs
            active={effInsightPlatform}
            onChange={setInsightPlatform}
            hasInstagram={hasAnyIg}
          />
          <Card className="min-w-0">
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-rose-300" />
                  {t("dashboard.insightsTitle")}
                </span>
              }
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
              {effInsightPlatform === "ig" ? (
                igPages.length === 0 ? (
                  <p className="text-sm text-content-tertiary">{t("dashboard.noIgPages")}</p>
                ) : (
                  <div className="flex flex-col gap-3 stagger">
                    {igPages.map((p) => (
                      <IgInsightRow key={p.id} page={p} />
                    ))}
                  </div>
                )
              ) : pagesState.loading ? (
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
        </div>
      )}
    </div>
  );
}
