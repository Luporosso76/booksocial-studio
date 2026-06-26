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
  EyeOff,
  Images,
  RefreshCw,
  BookOpen,
  Clock,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Collapsible } from "@/components/ui/Collapsible";
import { useToast } from "@/components/ui/toast";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { DashboardCalendar } from "@/components/DashboardCalendar";
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
  hidePostFromDashboard,
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

// ─── KPI per pagina + account Instagram (niente totale aggregato) ───────────────
//
// Una PAGINA = UNA riga compatta: [Nome pagina] | [blocco Facebook] | [blocco Instagram].
// Ogni metrica è ICONA + valore (niente etichette lunghe): l'icona è neutra
// (text-content-tertiary), il valore porta il peso (text-content-secondary, ≥4.5:1).
// Solo l'icona-brand è colorata (sky=FB, rose=IG) per ancorare il blocco senza
// trasformare la riga in un "albero di Natale".

// Singola metrica icona+valore. `title` mostra il nome completo in hover/screen-reader.
function KpiMetric({
  icon: Icon,
  value,
  title,
}: {
  icon: typeof Users;
  value: string;
  title: string;
}) {
  return (
    <span className="flex items-center gap-1" title={title}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden />
      <span className="text-sm font-medium tabular-nums text-content-secondary">{value}</span>
    </span>
  );
}

// Blocco per piattaforma: icona-brand colorata + (opzionale) @username + metriche.
function KpiPlatformBlock({
  brandIcon: BrandIcon,
  brandClass,
  handle,
  children,
}: {
  brandIcon: typeof Facebook;
  brandClass: string;
  handle?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandIcon className={cn("h-4 w-4 shrink-0", brandClass)} aria-hidden />
      {handle && <span className="truncate text-xs text-content-tertiary">{handle}</span>}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">{children}</div>
    </div>
  );
}

// Skeleton compatto di un blocco-piattaforma: icona-brand + N pill metrica.
function KpiBlockSkeleton({
  count,
  brandIcon: BrandIcon,
  brandClass,
}: {
  count: number;
  brandIcon: typeof Facebook;
  brandClass: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandIcon className={cn("h-4 w-4 shrink-0 opacity-40", brandClass)} aria-hidden />
      <div className="flex items-center gap-3 sm:gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <span key={i} className="flex items-center gap-1">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3.5 w-8 rounded" />
          </span>
        ))}
      </div>
    </div>
  );
}

// Una pagina = una riga: nome pagina + blocco FB + (se collegato) blocco IG.
// Su <lg diventa una card a 2 livelli: riga1 nome, riga2 grid-cols-2 FB | IG.
function PageKpiSection({ page }: { page: FacebookPage }) {
  const { t } = useTranslation();
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

  const fbLoading = insState.loading || postsState.loading;
  const igLoading = igAccState.loading || igInsState.loading || postsState.loading;

  const fbBlock = fbLoading ? (
    <KpiBlockSkeleton count={4} brandClass="text-sky-300" brandIcon={Facebook} />
  ) : (
    <KpiPlatformBlock brandIcon={Facebook} brandClass="text-sky-300">
      <KpiMetric
        icon={Users}
        title={t("dashboard.kpiFollowers")}
        value={compactNumber(insState.data?.totals?.followersCount ?? 0)}
      />
      <KpiMetric
        icon={Eye}
        title={t("dashboard.kpiCoverage")}
        value={compactNumber(metricValue(fbMetrics, "page_total_media_view_unique"))}
      />
      <KpiMetric
        icon={Zap}
        title={t("dashboard.kpiEngagements")}
        value={compactNumber(metricValue(fbMetrics, "page_post_engagements"))}
      />
      <KpiMetric
        icon={CalendarClock}
        title={t("dashboard.kpiScheduled")}
        value={compactNumber(fbScheduled)}
      />
    </KpiPlatformBlock>
  );

  const igBlock = igLoading ? (
    <KpiBlockSkeleton count={3} brandClass="text-rose-300" brandIcon={Instagram} />
  ) : (
    <KpiPlatformBlock
      brandIcon={Instagram}
      brandClass="text-rose-300"
      handle={igUsername ? `@${igUsername}` : null}
    >
      <KpiMetric
        icon={Users}
        title={t("dashboard.kpiFollowers")}
        value={compactNumber(igAccState.data?.account?.followersCount ?? 0)}
      />
      <KpiMetric
        icon={Eye}
        title={t("dashboard.kpiCoverage")}
        value={compactNumber(igMetric("reach"))}
      />
      <KpiMetric
        icon={CalendarClock}
        title={t("dashboard.kpiScheduled")}
        value={compactNumber(igScheduled)}
      />
    </KpiPlatformBlock>
  );

  return (
    <div
      className={cn(
        "rounded-lg bg-bg-inset px-3 py-2.5 transition-colors duration-150 ease-out hover:bg-bg-hover",
        // Desktop: una riga sola. Mobile: card a 2 livelli (nome sopra, blocchi sotto).
        "lg:flex lg:items-center lg:gap-4",
      )}
    >
      <span className="block min-w-0 truncate text-sm font-semibold text-content-primary lg:w-44 lg:shrink-0">
        {page.name}
      </span>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 lg:mt-0 lg:flex lg:flex-1 lg:items-center lg:gap-0">
        <div className="min-w-0 lg:flex-1">{fbBlock}</div>
        {hasIg && (
          <div className="min-w-0 border-l border-border-subtle/60 pl-4 lg:flex-1">{igBlock}</div>
        )}
      </div>
    </div>
  );
}

// Skeleton dell'intera barra KPI mentre si carica l'elenco pagine: 2 righe compatte.
function KpiTopBarSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg bg-bg-inset px-3 py-2.5 lg:flex lg:items-center lg:gap-4"
        >
          <Skeleton className="h-4 w-32 rounded lg:w-44 lg:shrink-0" />
          <div className="mt-2 grid grid-cols-2 gap-x-4 lg:mt-0 lg:flex lg:flex-1 lg:items-center lg:gap-0">
            <div className="lg:flex-1">
              <KpiBlockSkeleton count={4} brandClass="text-sky-300" brandIcon={Facebook} />
            </div>
            <div className="border-l border-border-subtle/60 pl-4 lg:flex-1">
              <KpiBlockSkeleton count={3} brandClass="text-rose-300" brandIcon={Instagram} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// KPI per ogni pagina/account, impilate in righe compatte. Nessun conteggio totale.
function KpiTopBar({ pages }: { pages: FacebookPage[] }) {
  if (pages.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
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

// Tempo trascorso da `startedAt` in mm:ss (o h:mm:ss oltre l'ora), aggiornato ogni secondo.
// Deriva da un timestamp del server, quindi sopravvive ai cambi pagina (si riallinea al mount).
function useElapsed(startedAt?: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!startedAt) return "";
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

// Riga di un'attività in background: icona-tipo (pulsa) + titolo + dettaglio (cosa sta facendo)
// + avanzamento (fatte/totali) + cronometro live. Una riga per ogni job attivo.
function JobRow({
  icon: Icon,
  title,
  detail,
  progress,
  startedAt,
}: {
  icon: typeof Sparkles;
  title: string;
  detail: string;
  progress?: string;
  startedAt?: number;
}) {
  const elapsed = useElapsed(startedAt);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icon
        className="h-4 w-4 shrink-0 text-accent-light animate-pulse motion-reduce:animate-none"
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-content-primary" title={title}>
          {title}
        </span>
        <span className="truncate text-xs text-content-secondary" title={detail}>
          {detail}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {progress && (
          <span className="text-xs font-medium tabular-nums text-content-secondary">
            {progress}
          </span>
        )}
        {elapsed && (
          <span className="inline-flex items-center gap-1 text-xs tabular-nums text-content-tertiary">
            <Clock className="h-3 w-3" aria-hidden />
            {elapsed}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Sezione "Attività in corso": elenca TUTTE le operazioni in background (analisi libro,
 * generazione settimana, generazione e rigenerazione immagini, render visual, bibbia visiva)
 * dal contesto globale, ognuna con cosa sta facendo, l'avanzamento e un cronometro live.
 * Nascosta quando non ci sono attività.
 */
function ActiveJobsCard() {
  const { t } = useTranslation();
  const { jobs } = useJobs();
  if (jobs.length === 0) return null;

  return (
    <Card className="border-accent/30 animate-fade-in">
      <CardHeader
        title={t("dashboard.activeJobsTitle")}
        description={t("dashboard.activeJobsDescription")}
        action={<Badge tone="accent">{jobs.length}</Badge>}
      />
      <CardBody>
        <div role="status" aria-live="polite" className="divide-y divide-border-subtle stagger">
          {jobs.map((job, i) => {
            const key = `${job.kind}-${job.bookId ?? job.pageId ?? job.postId ?? job.mediaId ?? i}-${job.startedAt}`;
            const progress =
              job.planned != null && job.created != null
                ? `${job.created}/${job.planned}`
                : undefined;
            switch (job.kind) {
              case "analysis":
                return (
                  <JobRow
                    key={key}
                    icon={Sparkles}
                    title={job.title ?? t("dashboard.jobAnalysis")}
                    detail={t("dashboard.bookAnalysisRunning")}
                    startedAt={job.startedAt}
                  />
                );
              case "render":
                return (
                  <JobRow
                    key={key}
                    icon={Clapperboard}
                    title={job.renderKind ? visualKindLabel(job.renderKind) : t("dashboard.visual")}
                    detail={t("dashboard.visualRendering")}
                    startedAt={job.startedAt}
                  />
                );
              case "weekgen":
                return (
                  <JobRow
                    key={key}
                    icon={CalendarClock}
                    title={t("dashboard.jobWeekgen")}
                    detail={t("dashboard.weekgenInProgress")}
                    progress={progress}
                    startedAt={job.startedAt}
                  />
                );
              case "scenegen":
                return (
                  <JobRow
                    key={key}
                    icon={Images}
                    title={t("dashboard.jobScenegen")}
                    detail={t("dashboard.scenegenInProgress")}
                    progress={progress}
                    startedAt={job.startedAt}
                  />
                );
              case "mediaRegen": {
                const queued =
                  job.planned != null && job.created != null
                    ? Math.max(0, job.planned - job.created - 1)
                    : 0;
                const detail =
                  (job.mediaId != null
                    ? t("dashboard.regenImage", { id: job.mediaId })
                    : t("dashboard.mediaRegenInProgress")) +
                  (queued > 0 ? ` · ${t("dashboard.jobQueued", { count: queued })}` : "");
                return (
                  <JobRow
                    key={key}
                    icon={RefreshCw}
                    title={t("dashboard.jobMediaRegen")}
                    detail={detail}
                    progress={progress}
                    startedAt={job.startedAt}
                  />
                );
              }
              case "visualBible": {
                const running = job.steps?.find((s) => s.status === "running");
                const detail = running
                  ? `${running.label} (${running.done}/${running.total})`
                  : t("dashboard.visualBibleInProgress");
                return (
                  <JobRow
                    key={key}
                    icon={BookOpen}
                    title={t("dashboard.jobVisualBible")}
                    detail={detail}
                    startedAt={job.startedAt}
                  />
                );
              }
              default:
                return null;
            }
          })}
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
      className="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-border-subtle"
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

// Lista dei post: nasconde quelli rimossi dalla vista (published nascosti), poi ordina i
// SCHEDULED per data CRESCENTE (il prossimo programmato per primo), gli altri in coda.
function PostList({ posts, onChanged }: { posts: ScheduledPost[]; onChanged: () => void }) {
  const visible = posts
    .filter((p) => p.dashboardHidden !== true)
    .sort((a, b) => {
      const aSched = a.status === "SCHEDULED";
      const bSched = b.status === "SCHEDULED";
      if (aSched && bSched) {
        return (
          (a.scheduledAt ?? Number.POSITIVE_INFINITY) - (b.scheduledAt ?? Number.POSITIVE_INFINITY)
        );
      }
      if (aSched) return -1;
      if (bSched) return 1;
      return 0;
    });

  return (
    <div className="flex flex-col gap-3 stagger">
      {visible.map((p) => (
        <DashboardPostCard key={p.id} post={p} onChanged={onChanged} />
      ))}
    </div>
  );
}

function DashboardPostCard({ post: p, onChanged }: { post: ScheduledPost; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [confirmHide, setConfirmHide] = useState(false);
  const [hiding, setHiding] = useState(false);
  const when = formatWhen(p.scheduledAt);
  const canHide = p.status === "PUBLISHED";

  async function handleHide() {
    setHiding(true);
    try {
      await hidePostFromDashboard(Number(p.id));
      toast.success(t("dashboard.removeFromViewDone"));
      setConfirmHide(false);
      onChanged();
    } catch {
      toast.error(t("dashboard.removeFromViewFailed"));
      setHiding(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-inset p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
          {p.angle && <Badge tone="accent">{p.angle}</Badge>}
          {p.mediaType && <Badge>{mediaTypeLabel(p.mediaType)}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {when && (
            <span className="inline-flex items-center gap-1 text-xs text-content-tertiary">
              <Calendar className="h-3 w-3" />
              {when}
            </span>
          )}
          {canHide && (
            <button
              type="button"
              onClick={() => setConfirmHide(true)}
              title={t("dashboard.removeFromView")}
              aria-label={t("dashboard.removeFromView")}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-content-tertiary transition-colors hover:text-danger"
            >
              <EyeOff className="h-3.5 w-3.5" />
              {t("dashboard.removeFromView")}
            </button>
          )}
        </div>
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

      {/* Conferma: nasconde il post pubblicato dalla vista SENZA cancellarlo (resta su FB/IG). */}
      <Modal
        open={confirmHide}
        onClose={() => {
          if (hiding) return;
          setConfirmHide(false);
        }}
        size="sm"
        title={t("dashboard.removeFromView")}
        description={t("dashboard.removeFromViewConfirm")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmHide(false)} disabled={hiding}>
              {t("dashboard.removeFromViewCancel")}
            </Button>
            <Button variant="danger" onClick={handleHide} loading={hiding}>
              <EyeOff className="h-4 w-4" />
              {t("dashboard.removeFromViewConfirmBtn")}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-2 rounded-lg border border-border-subtle bg-bg-inset px-3 py-2.5">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-content-tertiary" />
          <p className="text-sm leading-snug text-content-primary">
            {t("dashboard.removeFromViewNote")}
          </p>
        </div>
      </Modal>
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

      {/* KPI per ogni pagina Facebook + account Instagram (niente totale aggregato). */}
      {pagesState.loading ? <KpiTopBarSkeleton /> : <KpiTopBar pages={pages} />}

      {/* Attività in background in corso (es. analisi AI): nascosta se nessuna. */}
      <ActiveJobsCard />

      {/* Calendario dei post programmati (tutte le pagine), colorati per libro. */}
      <DashboardCalendar />

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
            <Skeleton className="h-9 w-full max-w-xs" />
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
                  <PostList posts={shownPosts} onChanged={postsState.reload} />
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
