import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Users,
  ThumbsUp,
  Eye,
  Zap,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  ImageOff,
  Heart,
  MessageCircle,
  Share2,
  Link2,
  Facebook,
  Instagram,
  Film,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, selectClass } from "@/components/ui/Input";
import { EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { PageTabs } from "@/components/PageTabs";
import { cn } from "@/lib/cn";
import { useAsync } from "@/lib/useAsync";
import {
  getPages,
  getPageInsights,
  getPageTopPosts,
  getPageInsightsHistory,
  getCoverageTrend,
  getDemographics,
  getIgAccount,
  getIgInsights,
} from "@/api/endpoints";
import type {
  FacebookPage,
  FollowerTrendPoint,
  PageInsights,
  PageInsightsHistory,
  PageTopPosts,
  TopPost,
  CoverageTrend,
  CoverageTrendPoint,
  Demographics,
  DemographicEntry,
  InsightSnapshot,
  IgAccountResponse,
  IgInsightsResponse,
} from "@/api/types";

// ─── Period selector ─────────────────────────────────────────────────────────

const PERIODS = [
  { value: "day", labelKey: "insights.periodDay" },
  { value: "week", labelKey: "insights.periodWeek" },
  { value: "month", labelKey: "insights.periodMonth" },
];

// ─── Number formatting helpers ────────────────────────────────────────────────

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("it-IT");
}

/** Read the value of a named metric from the metrics array; returns 0 if missing. */
function metricValue(metrics: PageInsights["metrics"], name: string): number {
  return metrics.find((m) => m.metric === name)?.value ?? 0;
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

interface KpiTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function KpiTile({ icon, label, value }: KpiTileProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-inset p-4">
      <div className="flex items-center gap-2 text-content-tertiary">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-2xl font-bold text-content-primary leading-none">{value}</span>
    </div>
  );
}

// ─── KPI row skeleton ─────────────────────────────────────────────────────────

function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

// ─── Follower trend widget (pure SVG sparkline) ───────────────────────────────

function FollowerTrendWidget({ trend }: { trend: FollowerTrendPoint[] }) {
  const { t } = useTranslation();

  if (trend.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-5 w-5" />}
        title={t("insights.noTrendTitle")}
        description={t("insights.noTrendDescription")}
      />
    );
  }

  const nets = trend.map((p) => p.follows - p.unfollows);
  const totalNet = nets.reduce((a, b) => a + b, 0);
  const maxAbs = Math.max(1, ...trend.map((p) => Math.max(p.follows, p.unfollows)));

  // SVG bar chart: one cluster of two bars per day (follows=green, unfollows=red)
  const barWidth = 6;
  const gap = 2;
  const clusterWidth = barWidth * 2 + gap + 4; // 2 bars + inner gap + outer gap
  const svgHeight = 48;
  const totalWidth = trend.length * clusterWidth;

  return (
    <div className="flex flex-col gap-4">
      {/* Net total */}
      <div className="flex items-center gap-2">
        {totalNet >= 0 ? (
          <TrendingUp className="h-4 w-4 text-success" />
        ) : (
          <TrendingDown className="h-4 w-4 text-danger" />
        )}
        <span className={`text-lg font-bold ${totalNet >= 0 ? "text-success" : "text-danger"}`}>
          {totalNet >= 0 ? "+" : ""}
          {compactNumber(totalNet)}
        </span>
        <span className="text-xs text-content-tertiary">{t("insights.netInPeriod")}</span>
      </div>

      {/* SVG mini chart */}
      <div className="overflow-x-auto">
        <svg
          width={Math.max(totalWidth, 200)}
          height={svgHeight + 20}
          aria-label={t("insights.followerTrendAria")}
          className="block"
        >
          {trend.map((point, i) => {
            const x = i * clusterWidth;
            const followsH = Math.round((point.follows / maxAbs) * svgHeight);
            const unfolllowsH = Math.round((point.unfollows / maxAbs) * svgHeight);
            const ld = new Date(point.date);
            const label = `${String(ld.getMonth() + 1).padStart(2, "0")}-${String(ld.getDate()).padStart(2, "0")}`; // MM-DD

            return (
              <g key={point.date}>
                {/* follows bar (green) */}
                <rect
                  x={x}
                  y={svgHeight - followsH}
                  width={barWidth}
                  height={followsH}
                  rx={2}
                  className="fill-success/60"
                />
                {/* unfollows bar (red) */}
                <rect
                  x={x + barWidth + gap}
                  y={svgHeight - unfolllowsH}
                  width={barWidth}
                  height={unfolllowsH}
                  rx={2}
                  className="fill-danger/50"
                />
                {/* date label */}
                <text
                  x={x + barWidth}
                  y={svgHeight + 14}
                  textAnchor="middle"
                  fontSize={8}
                  className="fill-content-faint"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-xs text-content-tertiary">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success/60" />
          {t("insights.new")}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-content-tertiary">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-danger/50" />
          {t("insights.lost")}
        </span>
      </div>

      {/* Day-by-day list */}
      <div className="flex flex-col gap-1">
        {trend.map((point) => {
          const net = point.follows - point.unfollows;
          return (
            <div
              key={point.date}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs"
            >
              <span className="text-content-tertiary">
                {new Date(point.date).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-success">+{point.follows}</span>
                <span className="text-danger">-{point.unfollows}</span>
                <span
                  className={`w-10 text-right font-semibold ${net >= 0 ? "text-success" : "text-danger"}`}
                >
                  {net >= 0 ? "+" : ""}
                  {net}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Top post item ────────────────────────────────────────────────────────────

function TopPostItem({ post }: { post: TopPost }) {
  const { t } = useTranslation();

  const excerpt =
    post.message && post.message.length > 120
      ? post.message.slice(0, 120) + "…"
      : (post.message ?? "");

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-inset p-3">
      {/* Thumbnail */}
      <div className="shrink-0">
        {post.pictureUrl ? (
          <img
            src={post.pictureUrl}
            alt=""
            className="h-14 w-14 rounded-md object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-bg-hover text-content-faint">
            <ImageOff className="h-5 w-5" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {excerpt && (
          <p className="mb-1.5 text-xs leading-relaxed text-content-secondary line-clamp-2">
            {excerpt}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1 text-2xs text-content-faint">
            <Eye className="h-3 w-3" />
            {t("insights.views", { count: compactNumber(post.impressions) })}
          </span>
          {post.reach > 0 && (
            <span className="flex items-center gap-1 text-2xs text-content-faint">
              <Users className="h-3 w-3" />
              {t("insights.coverage", { count: compactNumber(post.reach) })}
            </span>
          )}
          <span className="flex items-center gap-1 text-2xs text-content-faint">
            <Heart className="h-3 w-3" />
            {t("insights.reactions", { count: compactNumber(post.reactions ?? 0) })}
          </span>
          <span className="flex items-center gap-1 text-2xs text-content-faint">
            <MessageCircle className="h-3 w-3" />
            {t("insights.comments", { count: compactNumber(post.comments ?? 0) })}
          </span>
          <span className="flex items-center gap-1 text-2xs text-content-faint">
            <Share2 className="h-3 w-3" />
            {t("insights.shares", { count: compactNumber(post.shares ?? 0) })}
          </span>
        </div>
      </div>

      {/* External link */}
      {post.permalinkUrl && (
        <a
          href={post.permalinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md p-1 text-content-tertiary transition-colors hover:text-accent"
          aria-label={t("insights.openPostAria")}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

// ─── B1: Storico nel tempo (line chart SVG) ─────────────────────────────────────

// Metriche storiche che vogliamo tracciare, con etichetta e colore Tailwind.
const HISTORY_SERIES: { metric: string; labelKey: string; stroke: string }[] = [
  {
    metric: "page_total_media_view_unique",
    labelKey: "insights.seriesCoverage",
    stroke: "stroke-accent",
  },
  { metric: "page_follows", labelKey: "insights.seriesFollowers", stroke: "stroke-success" },
];

interface SeriesPoint {
  t: number; // epoch ms
  value: number;
}

/** Raggruppa gli snapshot per metrica in serie ordinate per data. */
function buildSeries(snapshots: InsightSnapshot[], metric: string): SeriesPoint[] {
  return snapshots
    .filter((s) => s.metric === metric)
    .map((s) => ({ t: new Date(s.periodEnd).getTime(), value: s.value }))
    .filter((p) => !Number.isNaN(p.t))
    .sort((a, b) => a.t - b.t);
}

function HistoryChart({ snapshots }: { snapshots: InsightSnapshot[] }) {
  const { t } = useTranslation();

  const series = HISTORY_SERIES.map((s) => ({
    ...s,
    points: buildSeries(snapshots, s.metric),
  })).filter((s) => s.points.length > 0);

  // Servono almeno 2 punti su almeno una serie per disegnare un andamento.
  const hasTrend = series.some((s) => s.points.length >= 2);

  if (!hasTrend) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-content-tertiary">
        {t("insights.historyEmpty")}
      </div>
    );
  }

  // Dominio temporale e valori comuni a tutte le serie.
  const allTimes = series.flatMap((s) => s.points.map((p) => p.t));
  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const minT = Math.min(...allTimes);
  const maxT = Math.max(...allTimes);
  const maxV = Math.max(1, ...allValues);

  const W = 480;
  const H = 140;
  const padX = 8;
  const padY = 10;
  const spanT = Math.max(1, maxT - minT);

  function xOf(tv: number): number {
    return padX + ((tv - minT) / spanT) * (W - padX * 2);
  }
  function yOf(v: number): number {
    return H - padY - (v / maxV) * (H - padY * 2);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          aria-label={t("insights.historyChartAria")}
          className="block"
        >
          {/* baseline */}
          <line
            x1={padX}
            y1={H - padY}
            x2={W - padX}
            y2={H - padY}
            className="stroke-border-subtle"
            strokeWidth={1}
          />
          {series.map((s) => {
            const d = s.points
              .map(
                (p, i) =>
                  `${i === 0 ? "M" : "L"} ${xOf(p.t).toFixed(1)} ${yOf(p.value).toFixed(1)}`,
              )
              .join(" ");
            return (
              <g key={s.metric}>
                <path
                  d={d}
                  fill="none"
                  className={s.stroke}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.points.map((p) => (
                  <circle
                    key={p.t}
                    cx={xOf(p.t)}
                    cy={yOf(p.value)}
                    r={2.5}
                    className={s.stroke.replace("stroke-", "fill-")}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      {/* Legenda + intervallo date */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4">
          {series.map((s) => (
            <span
              key={s.metric}
              className="flex items-center gap-1.5 text-xs text-content-tertiary"
            >
              <span
                className={`inline-block h-2.5 w-2.5 rounded-sm ${s.stroke.replace("stroke-", "bg-")}`}
              />
              {t(s.labelKey)}
            </span>
          ))}
        </div>
        <span className="text-2xs text-content-faint">
          {new Date(minT).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
          {" — "}
          {new Date(maxT).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

// ─── B3: Copertura trend (sparkline SVG) ────────────────────────────────────────

function CoverageSparkline({ points }: { points: CoverageTrendPoint[] }) {
  const { t } = useTranslation();
  const sorted = [...points].sort((a, b) => a.date - b.date);

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-content-tertiary">
        {t("insights.coverageEmpty")}
      </div>
    );
  }

  const values = sorted.map((p) => p.value);
  const total = values.reduce((a, b) => a + b, 0);
  const maxV = Math.max(1, ...values);

  const W = 320;
  const H = 56;
  const padY = 4;
  const stepX = sorted.length > 1 ? W / (sorted.length - 1) : 0;

  function yOf(v: number): number {
    return H - padY - (v / maxV) * (H - padY * 2);
  }

  const line = sorted
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${yOf(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${((sorted.length - 1) * stepX).toFixed(1)} ${H} L 0 ${H} Z`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-content-primary">{compactNumber(total)}</span>
        <span className="text-xs text-content-tertiary">{t("insights.coverageTotalInPeriod")}</span>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          aria-label={t("insights.coverageTrendAria")}
          className="block"
        >
          <path d={area} className="fill-accent/10" />
          <path
            d={line}
            fill="none"
            className="stroke-accent"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex items-center justify-between text-2xs text-content-faint">
        <span>
          {new Date(sorted[0].date).toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "2-digit",
          })}
        </span>
        <span>
          {new Date(sorted[sorted.length - 1].date).toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

// ─── B5: Demografia (barre orizzontali) ─────────────────────────────────────────

function DemographicBars({ entries }: { entries: DemographicEntry[] }) {
  const top = [...entries].sort((a, b) => b.value - a.value).slice(0, 6);
  const maxV = Math.max(1, ...top.map((e) => e.value));

  return (
    <div className="flex flex-col gap-2">
      {top.map((e) => (
        <div key={e.key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-content-secondary">{e.key}</span>
            <span className="shrink-0 font-medium text-content-tertiary">
              {compactNumber(e.value)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bg-hover">
            <div
              className="h-full rounded-full bg-accent/70"
              style={{ width: `${Math.max(2, (e.value / maxV) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DemographicsWidget({ data }: { data: Demographics }) {
  const { t } = useTranslation();

  const isEmpty =
    data.countries.length === 0 && data.genderAge.length === 0 && data.cities.length === 0;

  if (isEmpty) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-content-tertiary">
        {t("insights.demographicsEmpty")}
      </div>
    );
  }

  const groups: { title: string; entries: DemographicEntry[] }[] = [
    { title: t("insights.demoCountries"), entries: data.countries },
    { title: t("insights.demoCities"), entries: data.cities },
    { title: t("insights.demoAgeGender"), entries: data.genderAge },
  ].filter((g) => g.entries.length > 0);

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">
            {g.title}
          </h4>
          <DemographicBars entries={g.entries} />
        </div>
      ))}
    </div>
  );
}

// ─── Per-page section ─────────────────────────────────────────────────────────

function PageInsightSection({ page, period }: { page: FacebookPage; period: string }) {
  const { t } = useTranslation();

  const insightsState = useAsync<PageInsights>(
    (s) => getPageInsights(page.id, period, s),
    [page.id, period],
  );

  const topPostsState = useAsync<PageTopPosts>((s) => getPageTopPosts(page.id, 10, s), [page.id]);

  const historyState = useAsync<PageInsightsHistory>(
    (s) => getPageInsightsHistory(page.id, s),
    [page.id],
  );

  const coverageState = useAsync<CoverageTrend>((s) => getCoverageTrend(page.id, 28, s), [page.id]);

  const demographicsState = useAsync<Demographics>((s) => getDemographics(page.id, s), [page.id]);

  const insights = insightsState.data;
  const totals = insights?.totals ?? null;
  const metrics = insights?.metrics ?? [];
  const followerTrend = insights?.followerTrend ?? [];
  const topPosts = topPostsState.data?.posts ?? [];
  const snapshots = historyState.data?.snapshots ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-6">
      {/* ── Page header ── */}
      <div className="flex items-center gap-2 xl:col-span-2">
        <h3 className="text-base font-semibold text-content-primary">{page.name}</h3>
        {page.category && <span className="text-xs text-content-tertiary">{page.category}</span>}
        {insights?.fetchedAt && (
          <span className="ml-auto text-2xs text-content-faint">
            {t("insights.updated")}{" "}
            {new Date(insights.fetchedAt).toLocaleString("it-IT", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      {/* ── KPI tiles (full-width row) ── */}
      <Card className="min-w-0 xl:col-span-2">
        <CardHeader title={t("insights.mainMetrics")} />
        <CardBody>
          {insightsState.loading ? (
            <KpiRowSkeleton />
          ) : insightsState.error ? (
            <ErrorBanner message={insightsState.error} onRetry={insightsState.reload} />
          ) : insights?.error ? (
            <ErrorBanner message={insights.error} onRetry={insightsState.reload} />
          ) : !insights || (metrics.length === 0 && totals === null) ? (
            <EmptyState
              icon={<BarChart3 className="h-5 w-5" />}
              title={t("insights.noMetricsTitle")}
              description={t("insights.noMetricsDescription")}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile
                icon={<Users className="h-4 w-4" />}
                label={t("insights.kpiFollowers")}
                value={totals !== null ? compactNumber(totals.followersCount) : "—"}
              />
              <KpiTile
                icon={<ThumbsUp className="h-4 w-4" />}
                label={t("insights.kpiLikes")}
                value={totals !== null ? compactNumber(totals.fanCount) : "—"}
              />
              <KpiTile
                icon={<Eye className="h-4 w-4" />}
                label={t("insights.kpiCoverage")}
                value={compactNumber(metricValue(metrics, "page_total_media_view_unique"))}
              />
              <KpiTile
                icon={<Zap className="h-4 w-4" />}
                label={t("insights.kpiEngagements")}
                value={compactNumber(metricValue(metrics, "page_post_engagements"))}
              />
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Follower trend (pairs with Storico beneath it on xl) ── */}
      <Card className="min-w-0">
        <CardHeader
          title={t("insights.followerTrendTitle")}
          description={t("insights.followerTrendDescription")}
        />
        <CardBody>
          {insightsState.loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : insightsState.error ? (
            <ErrorBanner message={insightsState.error} onRetry={insightsState.reload} />
          ) : insights?.error ? (
            <ErrorBanner message={insights.error} onRetry={insightsState.reload} />
          ) : (
            <FollowerTrendWidget trend={followerTrend} />
          )}
        </CardBody>
      </Card>

      {/* ── Top post (tall list, sits beside Trend follower on xl) ── */}
      <Card className="min-w-0">
        <CardHeader
          title={t("insights.topPostTitle")}
          description={t("insights.topPostDescription")}
        />
        <CardBody>
          {topPostsState.loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : topPostsState.error ? (
            <ErrorBanner message={topPostsState.error} onRetry={topPostsState.reload} />
          ) : topPostsState.data?.error ? (
            <ErrorBanner message={topPostsState.data.error} onRetry={topPostsState.reload} />
          ) : topPosts.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="h-5 w-5" />}
              title={t("insights.noPostTitle")}
              description={t("insights.noPostDescription")}
            />
          ) : (
            <div className="flex flex-col gap-2 stagger">
              {topPosts.map((post) => (
                <TopPostItem key={post.id} post={post} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── B1: Storico nel tempo (under Trend follower on xl) ── */}
      <Card className="min-w-0">
        <CardHeader
          title={t("insights.historyTitle")}
          description={t("insights.historyDescription")}
        />
        <CardBody>
          {historyState.loading ? (
            <Skeleton className="h-40 w-full" />
          ) : historyState.error ? (
            <ErrorBanner message={historyState.error} onRetry={historyState.reload} />
          ) : (
            <HistoryChart snapshots={snapshots} />
          )}
        </CardBody>
      </Card>

      {/* ── B3: Copertura giornaliera ── */}
      <Card className="min-w-0">
        <CardHeader
          title={t("insights.coverageTitle")}
          description={t("insights.coverageDescription")}
        />
        <CardBody>
          {coverageState.loading ? (
            <Skeleton className="h-32 w-full" />
          ) : coverageState.error ? (
            <ErrorBanner message={coverageState.error} onRetry={coverageState.reload} />
          ) : coverageState.data?.error ? (
            <ErrorBanner message={coverageState.data.error} onRetry={coverageState.reload} />
          ) : (
            <CoverageSparkline points={coverageState.data?.points ?? []} />
          )}
        </CardBody>
      </Card>

      {/* ── B5: Demografia (full-width row) ── */}
      <Card className="min-w-0 xl:col-span-2">
        <CardHeader
          title={t("insights.demographicsTitle")}
          description={t("insights.demographicsDescription")}
        />
        <CardBody>
          {demographicsState.loading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : demographicsState.error ? (
            <ErrorBanner message={demographicsState.error} onRetry={demographicsState.reload} />
          ) : demographicsState.data?.error ? (
            <ErrorBanner
              message={demographicsState.data.error}
              onRetry={demographicsState.reload}
            />
          ) : demographicsState.data ? (
            <DemographicsWidget data={demographicsState.data} />
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-content-tertiary">
              {t("insights.demographicsEmpty")}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ─── B4: Confronto pagine ───────────────────────────────────────────────────────

function ComparisonRow({ page, period }: { page: FacebookPage; period: string }) {
  const state = useAsync<PageInsights>(
    (s) => getPageInsights(page.id, period, s),
    [page.id, period],
  );

  const insights = state.data;
  const totals = insights?.totals ?? null;
  const metrics = insights?.metrics ?? [];

  const followers = totals !== null ? totals.followersCount : null;
  const coverage = insights ? metricValue(metrics, "page_total_media_view_unique") : null;
  const engagements = insights ? metricValue(metrics, "page_post_engagements") : null;

  function cell(v: number | null): string {
    if (state.loading) return "…";
    if (state.error || insights?.error) return "—";
    return v === null ? "—" : compactNumber(v);
  }

  return (
    <tr className="border-t border-border-subtle">
      <td className="py-2 pr-3">
        <span className="text-sm font-medium text-content-primary line-clamp-1">{page.name}</span>
      </td>
      <td className="px-3 py-2 text-right text-sm tabular-nums text-content-secondary">
        {cell(followers)}
      </td>
      <td className="px-3 py-2 text-right text-sm tabular-nums text-content-secondary">
        {cell(coverage)}
      </td>
      <td className="py-2 pl-3 text-right text-sm tabular-nums text-content-secondary">
        {cell(engagements)}
      </td>
    </tr>
  );
}

function PageComparison({ pages, period }: { pages: FacebookPage[]; period: string }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader
        title={t("insights.comparisonTitle")}
        description={t("insights.comparisonDescription")}
      />
      <CardBody>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse">
            <thead>
              <tr className="text-2xs font-medium uppercase tracking-wide text-content-faint">
                <th className="pb-2 pr-3 text-left">{t("insights.tablePage")}</th>
                <th className="px-3 pb-2 text-right">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {t("insights.tableFollowers")}
                  </span>
                </th>
                <th className="px-3 pb-2 text-right">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {t("insights.tableCoverage")}
                  </span>
                </th>
                <th className="pb-2 pl-3 text-right">
                  <span className="inline-flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {t("insights.tableEngagements")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <ComparisonRow key={p.id} page={p} period={period} />
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

// ─── Insight Instagram ──────────────────────────────────────────────────────────

const IG_METRIC_KEYS: Record<string, string> = {
  reach: "metricReach",
  profile_views: "metricProfileViews",
  follower_count: "metricFollowerCount",
  impressions: "metricImpressions",
};

// IG accetta period = day | week | days_28 per le metriche di account: mappiamo i periodi UI.
function igPeriodFor(period: string): string {
  if (period === "week") return "week";
  if (period === "month") return "days_28";
  return "day";
}

function IgInsightSection({ page, period }: { page: FacebookPage; period: string }) {
  const { t } = useTranslation();
  const accState = useAsync<IgAccountResponse>((s) => getIgAccount(page.id, s), [page.id]);
  const insState = useAsync<IgInsightsResponse>(
    (s) => getIgInsights(page.id, igPeriodFor(period), s),
    [page.id, period],
  );

  const account = accState.data?.account;
  const metrics = (insState.data?.metrics ?? []).filter((m) => m.value != null);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-6">
      <div className="flex items-center gap-2 xl:col-span-2">
        <h3 className="text-base font-semibold text-content-primary">
          {account?.username ? `@${account.username}` : page.name}
        </h3>
        {account?.name && <span className="text-xs text-content-tertiary">{account.name}</span>}
      </div>

      <Card className="min-w-0 xl:col-span-2">
        <CardHeader title={t("instagram.accountTitle")} />
        <CardBody>
          {accState.loading ? (
            <KpiRowSkeleton />
          ) : accState.error ? (
            <ErrorBanner message={accState.error} onRetry={accState.reload} />
          ) : accState.data?.error ? (
            <ErrorBanner message={accState.data.error} onRetry={accState.reload} />
          ) : !account ? (
            <EmptyState
              icon={<Instagram className="h-5 w-5" />}
              title={t("instagram.accountUnavailableTitle")}
              description={t("instagram.accountUnavailableDesc")}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KpiTile
                icon={<Users className="h-4 w-4" />}
                label={t("instagram.followers")}
                value={account.followersCount != null ? compactNumber(account.followersCount) : "—"}
              />
              <KpiTile
                icon={<Heart className="h-4 w-4" />}
                label={t("instagram.following")}
                value={account.followsCount != null ? compactNumber(account.followsCount) : "—"}
              />
              <KpiTile
                icon={<Film className="h-4 w-4" />}
                label={t("instagram.media")}
                value={account.mediaCount != null ? compactNumber(account.mediaCount) : "—"}
              />
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="min-w-0 xl:col-span-2">
        <CardHeader
          title={t("instagram.metricsAccountTitle")}
          description={t("instagram.metricsAccountDesc")}
        />
        <CardBody>
          {insState.loading ? (
            <KpiRowSkeleton />
          ) : insState.error ? (
            <ErrorBanner message={insState.error} onRetry={insState.reload} />
          ) : insState.data?.error ? (
            <ErrorBanner message={insState.data.error} onRetry={insState.reload} />
          ) : metrics.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-content-tertiary">
              {t("instagram.noMetrics")}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {metrics.map((m) => (
                <KpiTile
                  key={m.metric}
                  icon={<Zap className="h-4 w-4" />}
                  label={
                    IG_METRIC_KEYS[m.metric] ? t(`instagram.${IG_METRIC_KEYS[m.metric]}`) : m.metric
                  }
                  value={m.value != null ? compactNumber(m.value) : "—"}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ─── Tab piattaforma (Facebook / Instagram) ─────────────────────────────────────

type Platform = "facebook" | "instagram";

function PlatformTabs({
  active,
  onChange,
  showInstagram,
}: {
  active: Platform;
  onChange: (p: Platform) => void;
  showInstagram: boolean;
}) {
  const { t } = useTranslation();
  const items: { id: Platform; label: string; icon: React.ReactNode; show: boolean }[] = [
    {
      id: "facebook",
      label: t("instagram.tabFacebook"),
      icon: <Facebook className="h-4 w-4" />,
      show: true,
    },
    {
      id: "instagram",
      label: t("instagram.tabInstagram"),
      icon: <Instagram className="h-4 w-4" />,
      show: showInstagram,
    },
  ];
  return (
    <div
      role="tablist"
      aria-label="Facebook / Instagram"
      className="flex items-center gap-2 border-b border-border-subtle"
    >
      {items
        .filter((i) => i.show)
        .map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(item.id)}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium",
                "-mb-px border-b-2 transition-colors duration-150 ease-out-strong",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
                isActive
                  ? "border-accent text-content-primary"
                  : "border-transparent text-content-tertiary hover:text-content-secondary",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
    </div>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function InsightsScreen() {
  const { t } = useTranslation();
  const pagesState = useAsync<FacebookPage[]>((s) => getPages(s), []);
  const [period, setPeriod] = useState("day");
  const [activeId, setActiveId] = useState("");
  const [platform, setPlatform] = useState<Platform>("facebook");

  const pages = useMemo(() => pagesState.data ?? [], [pagesState.data]);
  const activePage = pages.find((p) => p.id === activeId) ?? pages[0] ?? null;
  const hasInstagram = activePage?.igUserId != null;

  // Default alla prima pagina al caricamento (o se la selezione non è più valida),
  // così il dettaglio della pagina attiva compare subito.
  useEffect(() => {
    if (pages.length === 0) return;
    if (!activeId || !pages.some((p) => p.id === activeId)) {
      setActiveId(pages[0].id);
    }
  }, [pages, activeId]);

  // Se la pagina attiva non ha un account Instagram, torna sul tab Facebook.
  useEffect(() => {
    if (!hasInstagram && platform === "instagram") setPlatform("facebook");
  }, [hasInstagram, platform]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header card with period selector */}
      <Card>
        <CardHeader title={t("insights.title")} description={t("insights.description")} />
        <CardBody>
          {pagesState.error ? (
            <ErrorBanner message={pagesState.error} onRetry={pagesState.reload} />
          ) : pagesState.loading ? (
            <Skeleton className="h-9 w-48" />
          ) : pages.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="h-5 w-5" />}
              title={t("insights.noPagesTitle")}
              description={t("insights.noPagesDescription")}
              action={
                <NavLink
                  to="/connessione"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out-strong hover:bg-accent-hover"
                >
                  <Link2 className="h-4 w-4" />
                  {t("insights.goToConnection")}
                </NavLink>
              }
            />
          ) : (
            <Field label={t("insights.periodField")} className="max-w-xs">
              <select
                className={selectClass}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {t(p.labelKey)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </CardBody>
      </Card>

      {/* B4 — Confronto pagine (solo con ≥2 pagine) */}
      {!pagesState.loading && !pagesState.error && pages.length >= 2 && (
        <PageComparison pages={pages} period={period} />
      )}

      {/* Selettore pagina + tab piattaforma + dettaglio della sola pagina attiva. */}
      {!pagesState.loading && !pagesState.error && pages.length > 0 && activePage && (
        <div className="flex flex-col gap-4">
          {pages.length > 1 && (
            <PageTabs pages={pages} activeId={activePage.id} onChange={setActiveId} />
          )}
          <PlatformTabs active={platform} onChange={setPlatform} showInstagram={hasInstagram} />
          {platform === "instagram" && hasInstagram ? (
            <IgInsightSection key={`ig-${activePage.id}`} page={activePage} period={period} />
          ) : (
            <PageInsightSection key={activePage.id} page={activePage} period={period} />
          )}
        </div>
      )}
    </div>
  );
}
