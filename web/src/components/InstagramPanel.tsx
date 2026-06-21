import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Instagram,
  Users,
  Image as ImageIcon,
  Film,
  MessageCircle,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Heart,
  EyeOff,
  Eye,
  Trash2,
  ExternalLink,
  CalendarClock,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useAsync, errorMessage } from "@/lib/useAsync";
import {
  getIgAccount,
  getIgInsights,
  getIgMedia,
  getIgComments,
  replyIgComment,
  hideIgComment,
  deleteIgComment,
  getPagePosts,
} from "@/api/endpoints";
import type {
  FacebookPage,
  IgAccountResponse,
  IgInsightsResponse,
  IgMediaResponse,
  IgComments,
  IgComment,
  IgMedia,
  ScheduledPost,
} from "@/api/types";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatIgDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEpoch(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function excerpt(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

// Mappa nome-metrica Graph → chiave i18n leggibile.
const IG_METRIC_KEYS: Record<string, string> = {
  reach: "metricReach",
  profile_views: "metricProfileViews",
  follower_count: "metricFollowerCount",
  impressions: "metricImpressions",
};

// ─── Sotto-tab IG ─────────────────────────────────────────────────────────────────

type IgTab = "media" | "scheduled" | "account";

function IgSubTabs({ active, onChange }: { active: IgTab; onChange: (t: IgTab) => void }) {
  const { t } = useTranslation();
  const items: { id: IgTab; label: string; icon: ReactNode }[] = [
    {
      id: "media",
      label: t("instagram.subPosts"),
      icon: <MessageCircle className="h-3.5 w-3.5" />,
    },
    {
      id: "scheduled",
      label: t("instagram.subScheduled"),
      icon: <CalendarClock className="h-3.5 w-3.5" />,
    },
    { id: "account", label: t("instagram.subAccount"), icon: <Users className="h-3.5 w-3.5" /> },
  ];
  return (
    <div role="tablist" aria-label="Instagram" className="flex items-center gap-1.5">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
              "transition-[background-color,color] duration-150 ease-out-strong",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
              isActive
                ? "bg-bg-hover text-content-primary"
                : "text-content-tertiary hover:bg-bg-hover/60 hover:text-content-secondary",
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

// ─── Commento IG (con risposte annidate) ────────────────────────────────────────

function IgCommentRow({
  pageId,
  comment,
  onChanged,
  depth = 0,
}: {
  pageId: string;
  comment: IgComment;
  onChanged: () => void;
  depth?: number;
}) {
  const { t } = useTranslation();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<null | "reply" | "hide" | "delete">(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    kind: "reply" | "hide" | "delete",
    fn: () => Promise<{ ok: boolean; error?: string | null }>,
    after?: () => void,
  ) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Error");
        return;
      }
      after?.();
      onChanged();
    } catch (err) {
      setError(errorMessage(err) || "Error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className={cn("rounded-lg border border-border-subtle bg-bg-inset p-3", depth > 0 && "ml-5")}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-content-primary">
          {comment.username || t("instagram.user")}
        </span>
        <span className="text-2xs text-content-faint">{formatIgDate(comment.timestamp)}</span>
        {comment.hidden && (
          <Badge tone="warning">
            <EyeOff className="h-3 w-3" />
            {t("instagram.hidden")}
          </Badge>
        )}
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-content-secondary">
        {comment.text || <span className="italic text-content-faint">{t("instagram.noText")}</span>}
      </p>
      <div className="mt-1 flex items-center gap-1 text-2xs text-content-faint">
        <Heart className="h-3 w-3" />
        {comment.likeCount}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {depth === 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setReplyOpen((v) => !v)}
            disabled={busy !== null}
          >
            <CornerDownRight className="h-3.5 w-3.5" />
            {t("instagram.reply")}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => run("hide", () => hideIgComment(pageId, comment.id, !comment.hidden))}
          loading={busy === "hide"}
          disabled={busy !== null && busy !== "hide"}
        >
          {comment.hidden ? (
            <>
              <Eye className="h-3.5 w-3.5" />
              {t("instagram.show")}
            </>
          ) : (
            <>
              <EyeOff className="h-3.5 w-3.5" />
              {t("instagram.hide")}
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-danger hover:bg-danger-soft hover:text-danger"
          onClick={() => setConfirmDelete(true)}
          disabled={busy !== null}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("instagram.delete")}
        </Button>
      </div>

      {replyOpen && (
        <div className="mt-2 flex flex-col gap-2 animate-slide-up-in">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t("instagram.replyPlaceholder")}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setReplyOpen(false);
                setReplyText("");
              }}
              disabled={busy === "reply"}
            >
              {t("instagram.cancel")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!replyText.trim() || busy !== null}
              loading={busy === "reply"}
              onClick={() =>
                run(
                  "reply",
                  () => replyIgComment(pageId, comment.id, replyText.trim()),
                  () => {
                    setReplyText("");
                    setReplyOpen(false);
                  },
                )
              }
            >
              {t("instagram.sendReply")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2">
          <ErrorBanner message={error} />
        </div>
      )}

      {comment.replies.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {comment.replies.map((r) => (
            <IgCommentRow
              key={r.id}
              pageId={pageId}
              comment={r}
              onChanged={onChanged}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="mt-2 rounded-lg border border-danger/40 bg-danger-soft/40 p-3">
          <p className="text-xs text-content-secondary">{t("instagram.deleteCommentConfirm")}</p>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={busy === "delete"}
            >
              {t("instagram.cancel")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={busy === "delete"}
              onClick={() =>
                run(
                  "delete",
                  () => deleteIgComment(pageId, comment.id),
                  () => setConfirmDelete(false),
                )
              }
            >
              {t("instagram.delete")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function IgCommentsPanel({ pageId, mediaId }: { pageId: string; mediaId: string }) {
  const { t } = useTranslation();
  const state = useAsync<IgComments>((s) => getIgComments(pageId, mediaId, s), [pageId, mediaId]);
  const comments = state.data?.comments ?? [];
  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      {state.loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : state.error ? (
        <ErrorBanner message={state.error} onRetry={state.reload} />
      ) : state.data?.error ? (
        <ErrorBanner message={state.data.error} onRetry={state.reload} />
      ) : comments.length === 0 ? (
        <p className="py-2 text-center text-xs text-content-faint">
          {t("instagram.noCommentsMedia")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {comments.map((c) => (
            <IgCommentRow key={c.id} pageId={pageId} comment={c} onChanged={state.reload} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Riga media IG ────────────────────────────────────────────────────────────────

function IgMediaRow({ pageId, media }: { pageId: string; media: IgMedia }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const thumb = media.thumbnailUrl || media.mediaUrl;
  const isVideo = media.mediaType === "VIDEO";
  return (
    <div className="min-w-0 rounded-xl border border-border-subtle bg-bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          {thumb ? (
            <img src={thumb} alt="" className="h-16 w-16 rounded-lg object-cover" loading="lazy" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-bg-hover text-content-faint">
              {isVideo ? <Film className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{media.mediaProductType || media.mediaType || "MEDIA"}</Badge>
            <span className="text-2xs text-content-faint">{formatIgDate(media.timestamp)}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-content-secondary">
            {media.caption ? (
              excerpt(media.caption, 220)
            ) : (
              <span className="italic text-content-faint">{t("instagram.noCaption")}</span>
            )}
          </p>
          <div className="mt-1.5 flex items-center gap-3 text-2xs text-content-faint">
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3" />
              {media.likeCount ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              {media.commentsCount ?? 0}
            </span>
          </div>
        </div>
        {media.permalink && (
          <a
            href={media.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md p-1 text-content-tertiary transition-colors hover:text-accent"
            aria-label={t("instagram.openOnInstagram")}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      <div className="mt-2">
        <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {expanded
            ? t("instagram.hideComments")
            : `${t("instagram.comments")} (${media.commentsCount ?? 0})`}
        </Button>
      </div>

      {expanded && <IgCommentsPanel pageId={pageId} mediaId={media.id} />}
    </div>
  );
}

// ─── Sezione media + commenti IG ────────────────────────────────────────────────

function IgMediaSection({ page }: { page: FacebookPage }) {
  const { t } = useTranslation();
  const state = useAsync<IgMediaResponse>((s) => getIgMedia(page.id, 25, s), [page.id]);
  const media = state.data?.media ?? [];
  return (
    <Card>
      <CardHeader
        title={t("instagram.postsTitle")}
        description={t("instagram.postsDesc")}
        action={
          <Button size="sm" variant="ghost" onClick={state.reload} disabled={state.loading}>
            {t("instagram.refresh")}
          </Button>
        }
      />
      <CardBody>
        {state.loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : state.error ? (
          <ErrorBanner message={state.error} onRetry={state.reload} />
        ) : state.data?.error ? (
          <ErrorBanner message={state.data.error} onRetry={state.reload} />
        ) : media.length === 0 ? (
          <EmptyState
            icon={<Instagram className="h-5 w-5" />}
            title={t("instagram.noMediaTitle")}
            description={t("instagram.noMediaDesc")}
          />
        ) : (
          <div className="grid grid-cols-1 items-start gap-3 stagger 2xl:grid-cols-2">
            {media.map((m) => (
              <IgMediaRow key={m.id} pageId={page.id} media={m} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ─── Sezione job IG programmati ─────────────────────────────────────────────────

function IgScheduledSection({ page }: { page: FacebookPage }) {
  const { t } = useTranslation();
  const state = useAsync<ScheduledPost[]>((s) => getPagePosts(page.id, s), [page.id]);
  const jobs = (state.data ?? []).filter(
    (p) => p.platform === "instagram" && p.status !== "PUBLISHED",
  );
  return (
    <Card>
      <CardHeader
        title={t("instagram.scheduledTitle")}
        description={t("instagram.scheduledDesc")}
        action={
          <Button size="sm" variant="ghost" onClick={state.reload} disabled={state.loading}>
            {t("instagram.refresh")}
          </Button>
        }
      />
      <CardBody>
        {state.loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : state.error ? (
          <ErrorBanner message={state.error} onRetry={state.reload} />
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-5 w-5" />}
            title={t("instagram.noJobsTitle")}
            description={t("instagram.noJobsDesc")}
          />
        ) : (
          <div className="flex flex-col gap-3 stagger">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-border-subtle bg-bg-inset p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone="accent">
                    <Instagram className="h-3 w-3" />
                    {job.mediaType || "IG"}
                  </Badge>
                  <Badge tone={job.status === "SCHEDULED" ? "neutral" : "warning"}>
                    {job.status}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-content-faint">
                    <Clock className="h-3.5 w-3.5" />
                    {formatEpoch(job.scheduledAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-content-secondary">
                  {job.body ? (
                    excerpt(job.body, 160)
                  ) : (
                    <span className="italic text-content-faint">{t("instagram.noText")}</span>
                  )}
                </p>
                {job.errorMessage && (
                  <p className="mt-1.5 flex items-center gap-1 text-2xs text-danger">
                    <AlertTriangle className="h-3 w-3" />
                    {job.errorMessage}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ─── Sezione account IG ──────────────────────────────────────────────────────────

function IgAccountSection({ page }: { page: FacebookPage }) {
  const { t } = useTranslation();
  const accState = useAsync<IgAccountResponse>((s) => getIgAccount(page.id, s), [page.id]);
  const insState = useAsync<IgInsightsResponse>((s) => getIgInsights(page.id, "day", s), [page.id]);
  const account = accState.data?.account;
  const metrics = (insState.data?.metrics ?? []).filter((m) => m.value != null);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title={t("instagram.accountTitle")} description={t("instagram.accountDesc")} />
        <CardBody>
          {accState.loading ? (
            <Skeleton className="h-24 w-full" />
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
            <div className="flex items-start gap-4">
              {account.profilePictureUrl ? (
                <img
                  src={account.profilePictureUrl}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-hover text-content-faint">
                  <Instagram className="h-6 w-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-content-primary">
                    @{account.username || "—"}
                  </span>
                  {account.name && (
                    <span className="text-xs text-content-tertiary">{account.name}</span>
                  )}
                </div>
                {account.biography && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-content-secondary">
                    {account.biography}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-content-secondary">
                  <span>
                    <strong className="text-content-primary">
                      {account.followersCount ?? "—"}
                    </strong>{" "}
                    {t("instagram.followers")}
                  </span>
                  <span>
                    <strong className="text-content-primary">{account.followsCount ?? "—"}</strong>{" "}
                    {t("instagram.following")}
                  </span>
                  <span>
                    <strong className="text-content-primary">{account.mediaCount ?? "—"}</strong>{" "}
                    {t("instagram.media")}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("instagram.insightsTitle")}
          description={t("instagram.insightsDesc")}
          action={
            <Button size="sm" variant="ghost" onClick={insState.reload} disabled={insState.loading}>
              {t("instagram.refresh")}
            </Button>
          }
        />
        <CardBody>
          {insState.loading ? (
            <Skeleton className="h-16 w-full" />
          ) : insState.error ? (
            <ErrorBanner message={insState.error} onRetry={insState.reload} />
          ) : insState.data?.error ? (
            <ErrorBanner message={insState.data.error} onRetry={insState.reload} />
          ) : metrics.length === 0 ? (
            <p className="py-2 text-center text-xs text-content-faint">
              {t("instagram.noMetrics")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {metrics.map((m) => (
                <div
                  key={m.metric}
                  className="rounded-lg border border-border-subtle bg-bg-inset p-3"
                >
                  <p className="text-2xs uppercase tracking-wide text-content-faint">
                    {IG_METRIC_KEYS[m.metric]
                      ? t(`instagram.${IG_METRIC_KEYS[m.metric]}`)
                      : m.metric}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-content-primary">
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ─── Pannello Instagram (entry point del tab IG) ────────────────────────────────

export function InstagramPanel({ page }: { page: FacebookPage }) {
  const [tab, setTab] = useState<IgTab>("media");
  return (
    <div className="flex flex-col gap-4">
      <IgSubTabs active={tab} onChange={setTab} />
      <div key={`ig-${tab}-${page.id}`} className="animate-fade-in">
        {tab === "media" && <IgMediaSection key={`ig-media-${page.id}`} page={page} />}
        {tab === "scheduled" && <IgScheduledSection key={`ig-sched-${page.id}`} page={page} />}
        {tab === "account" && <IgAccountSection key={`ig-acc-${page.id}`} page={page} />}
      </div>
    </div>
  );
}
