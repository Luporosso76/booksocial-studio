import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  FileText,
  Send,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  ExternalLink,
  ImageOff,
  MessageCircle,
  ChevronDown,
  EyeOff,
  Eye,
  Heart,
  CornerDownRight,
  AlertTriangle,
  Plus,
  Link2,
  Clock,
  Sparkles,
  CalendarClock,
  Facebook,
  Instagram,
  MoreVertical,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Drawer } from "@/components/ui/Drawer";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { PageSettingsEditor } from "@/components/PageSettingsEditor";
import { PageTabs } from "@/components/PageTabs";
import { InstagramPanel } from "@/components/InstagramPanel";
import { cn } from "@/lib/cn";
import { useAsync, errorMessage } from "@/lib/useAsync";
import {
  getPages,
  getManagedPosts,
  editPostMessage,
  deletePost,
  setPostPinned,
  publishNative,
  getPostComments,
  replyComment,
  hideComment,
  deleteComment,
  likeComment,
  getScheduledFbPosts,
} from "@/api/endpoints";
import type {
  FacebookPage,
  ManagedPost,
  ManagedPosts,
  PostComment,
  PostComments,
  ScheduledFbPosts,
} from "@/api/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function excerptOf(message: string | null | undefined, max = 160): string {
  if (!message) return "";
  return message.length > max ? message.slice(0, max) + "…" : message;
}

/** Converte un valore datetime-local in epoch SECONDS, o undefined se vuoto/non valido. */
function toEpochSeconds(local: string): number | undefined {
  if (!local) return undefined;
  const ms = new Date(local).getTime();
  if (Number.isNaN(ms)) return undefined;
  return Math.floor(ms / 1000);
}

/** Iniziale della pagina per il piccolo avatar tondo dell'anteprima. */
function pageInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

// ─── Confirm dialog (generico, riusabile) ───────────────────────────────────────

function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  body,
  confirmLabel,
  danger = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  body: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t("pageMgmt.confirm")}
          </Button>
        </>
      }
    >
      {body}
    </Modal>
  );
}

// ─── Commenti di un post ────────────────────────────────────────────────────────

function CommentRow({
  pageId,
  comment,
  onChanged,
}: {
  pageId: string;
  comment: PostComment;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<null | "reply" | "hide" | "delete" | "like">(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    kind: "reply" | "hide" | "delete" | "like",
    fn: () => Promise<{ ok: boolean; error?: string | null }>,
    after?: () => void,
  ) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? t("common.operationFailed"));
        return;
      }
      after?.();
      onChanged();
    } catch (err) {
      setError(errorMessage(err) || t("common.genericError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-inset p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-content-primary">
              {comment.fromName || t("pageMgmt.user")}
            </span>
            <span className="text-2xs text-content-faint">{formatDate(comment.createdTime)}</span>
            {comment.isHidden && (
              <Badge tone="warning">
                <EyeOff className="h-3 w-3" />
                {t("pageMgmt.hidden")}
              </Badge>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-content-secondary">
            {comment.message || (
              <span className="italic text-content-faint">{t("pageMgmt.noText")}</span>
            )}
          </p>
          <div className="mt-1 flex items-center gap-1 text-2xs text-content-faint">
            <Heart className="h-3 w-3" />
            {comment.likeCount}
          </div>
        </div>
      </div>

      {/* Azioni */}
      <div className="mt-2 flex items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setReplyOpen((v) => !v)}
          disabled={busy !== null}
        >
          <CornerDownRight className="h-3.5 w-3.5" />
          {t("pageMgmt.reply")}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={busy !== null} aria-label={t("pageMgmt.moreActions")}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => run("hide", () => hideComment(pageId, comment.id, !comment.isHidden))}
            >
              {comment.isHidden ? (
                <>
                  <Eye className="h-4 w-4" />
                  {t("pageMgmt.show")}
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4" />
                  {t("pageMgmt.hide")}
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => run("like", () => likeComment(pageId, comment.id, true))}
            >
              <Heart className="h-4 w-4" />
              {t("pageMgmt.like")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Form risposta */}
      {replyOpen && (
        <div className="mt-2 flex flex-col gap-2 animate-slide-up-in">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t("pageMgmt.replyPlaceholder")}
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
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!replyText.trim() || busy !== null}
              loading={busy === "reply"}
              onClick={() =>
                run(
                  "reply",
                  () => replyComment(pageId, comment.id, replyText.trim()),
                  () => {
                    setReplyText("");
                    setReplyOpen(false);
                  },
                )
              }
            >
              {t("pageMgmt.sendReply")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* Conferma eliminazione commento */}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          run(
            "delete",
            () => deleteComment(pageId, comment.id),
            () => setConfirmDelete(false),
          )
        }
        title={t("pageMgmt.deleteCommentTitle")}
        description={t("pageMgmt.irreversible")}
        danger
        confirmLabel={t("common.delete")}
        loading={busy === "delete"}
        body={<p className="text-sm text-content-secondary">{t("pageMgmt.deleteCommentBody")}</p>}
      />
    </div>
  );
}

function CommentsPanel({ pageId, postId }: { pageId: string; postId: string }) {
  const { t } = useTranslation();
  const state = useAsync<PostComments>((s) => getPostComments(pageId, postId, s), [pageId, postId]);

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
        <p className="py-2 text-center text-xs text-content-faint">{t("pageMgmt.noComments")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {comments.map((c) => (
            <CommentRow key={c.id} pageId={pageId} comment={c} onChanged={state.reload} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Riga post pubblicato ───────────────────────────────────────────────────────

function PostRow({
  pageId,
  pageName,
  post,
  onMutated,
}: {
  pageId: string;
  pageName: string;
  post: ManagedPost;
  onMutated: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.message ?? "");
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPin, setConfirmPin] = useState(false);
  const [busy, setBusy] = useState<null | "edit" | "delete" | "pin">(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    kind: "edit" | "delete" | "pin",
    fn: () => Promise<{ ok: boolean; error?: string | null }>,
    after?: () => void,
  ) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? t("common.operationFailed"));
        return;
      }
      after?.();
      onMutated();
    } catch (err) {
      setError(errorMessage(err) || t("common.genericError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-w-0 rounded-xl border border-border-subtle bg-bg-card p-4">
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        <div className="shrink-0">
          {post.pictureUrl ? (
            <img
              src={post.pictureUrl}
              alt=""
              className="h-16 w-16 rounded-lg object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-bg-hover text-content-faint">
              <ImageOff className="h-5 w-5" />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-2xs text-content-faint">{formatDate(post.createdTime)}</span>
            {post.pinned && (
              <Badge tone="accent">
                <Pin className="h-3 w-3" />
                {t("pageMgmt.pinned")}
              </Badge>
            )}
            {!post.isPublished && (
              <Badge tone="warning">
                <EyeOff className="h-3 w-3" />
                {t("pageMgmt.notPublished")}
              </Badge>
            )}
            {post.permalinkUrl && (
              <a
                href={post.permalinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto rounded-md p-0.5 text-content-tertiary transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                aria-label={t("pageMgmt.openPostAria")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          {editing ? (
            <div className="flex flex-col gap-2">
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                placeholder={t("pageMgmt.postTextPlaceholder")}
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setEditText(post.message ?? "");
                  }}
                  disabled={busy === "edit"}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={editText.trim() === (post.message ?? "").trim() || busy !== null}
                  onClick={() => setConfirmEdit(true)}
                >
                  {t("pageMgmt.saveText")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-content-secondary">
              {post.message ? (
                excerptOf(post.message, 280)
              ) : (
                <span className="italic text-content-faint">{t("pageMgmt.noText")}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Azioni post */}
      {!editing && (
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded((v) => !v)}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {t("pageMgmt.comments")}
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded ? "rotate-0" : "-rotate-90")}
            />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" disabled={busy !== null} aria-label={t("pageMgmt.morePostActions")} className="ml-auto">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setEditText(post.message ?? "");
                  setEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                {t("pageMgmt.editText")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setConfirmPin(true)}>
                {post.pinned ? (
                  <>
                    <PinOff className="h-4 w-4" />
                    {t("pageMgmt.removePin")}
                  </>
                ) : (
                  <>
                    <Pin className="h-4 w-4" />
                    {t("pageMgmt.setPin")}
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {error && (
        <div className="mt-2">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* Pannello commenti */}
      {expanded && <CommentsPanel pageId={pageId} postId={post.id} />}

      {/* Conferma modifica testo */}
      <ConfirmDialog
        open={confirmEdit}
        onClose={() => setConfirmEdit(false)}
        onConfirm={() =>
          run(
            "edit",
            () => editPostMessage(pageId, post.id, editText.trim()),
            () => {
              setConfirmEdit(false);
              setEditing(false);
            },
          )
        }
        title={t("pageMgmt.editPostTitle")}
        description={t("pageMgmt.publicPageRealDesc", { pageName })}
        confirmLabel={t("pageMgmt.confirm")}
        loading={busy === "edit"}
        body={<p className="text-sm text-content-secondary">{t("pageMgmt.editPostBody")}</p>}
      />

      {/* Conferma pin/unpin */}
      <ConfirmDialog
        open={confirmPin}
        onClose={() => setConfirmPin(false)}
        onConfirm={() =>
          run(
            "pin",
            () => setPostPinned(pageId, post.id, !post.pinned),
            () => setConfirmPin(false),
          )
        }
        title={t(post.pinned ? "pageMgmt.unpinTitle" : "pageMgmt.pinTitle")}
        description={t("pageMgmt.publicPageRealDesc", { pageName })}
        confirmLabel={t("pageMgmt.confirm")}
        loading={busy === "pin"}
        body={
          <p className="text-sm text-content-secondary">
            {t(post.pinned ? "pageMgmt.unpinBody" : "pageMgmt.pinBody")}
          </p>
        }
      />

      {/* Conferma eliminazione post */}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          run(
            "delete",
            () => deletePost(pageId, post.id),
            () => setConfirmDelete(false),
          )
        }
        title={t("pageMgmt.deletePostTitle")}
        description={t("pageMgmt.irreversible")}
        danger
        confirmLabel={t("common.delete")}
        loading={busy === "delete"}
        body={
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <p className="text-sm leading-snug text-content-secondary">
                {t("pageMgmt.deletePostBody", { pageName })}
              </p>
            </div>
          </div>
        }
      />
    </div>
  );
}

// ─── Sezione "Post pubblicati" ──────────────────────────────────────────────────

function PublishedPostsSection({
  page,
  reloadToken,
  onCreatePost,
}: {
  page: FacebookPage;
  /** Bump di questo valore forza un reload della lista (es. dopo una pubblicazione). */
  reloadToken: number;
  onCreatePost: () => void;
}) {
  const { t } = useTranslation();
  const state = useAsync<ManagedPosts>((s) => getManagedPosts(page.id, s), [page.id, reloadToken]);

  const posts = state.data?.posts ?? [];

  return (
    <Card>
      <CardHeader title={t("pageMgmt.postsTitle")} description={t("pageMgmt.postsDescription")} />
      <CardBody>
        {state.loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : state.error ? (
          <ErrorBanner message={state.error} onRetry={state.reload} />
        ) : state.data?.error ? (
          <ErrorBanner message={state.data.error} onRetry={state.reload} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title={t("pageMgmt.noPostsTitle")}
            description={t("pageMgmt.noPostsDescription")}
            action={
              <Button variant="primary" onClick={onCreatePost}>
                <Plus className="h-4 w-4" />
                {t("pageMgmt.createFirstPost")}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3 stagger">
            {posts.map((post) => (
              <PostRow
                key={post.id}
                pageId={page.id}
                pageName={page.name}
                post={post}
                onMutated={state.reload}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ─── Sezione "Programmati su Facebook" ─────────────────────────────────────────

function ScheduledOnFacebookSection({ page }: { page: FacebookPage }) {
  const { t } = useTranslation();
  const state = useAsync<ScheduledFbPosts>((s) => getScheduledFbPosts(page.id, s), [page.id]);

  const posts = state.data?.posts ?? [];

  return (
    <Card>
      <CardHeader
        title={t("pageMgmt.scheduledTitle")}
        description={t("pageMgmt.scheduledDescription")}
        action={
          <Button size="sm" variant="ghost" onClick={state.reload} disabled={state.loading}>
            {t("pageMgmt.refresh")}
          </Button>
        }
      />
      <CardBody>
        {state.loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : state.error ? (
          <ErrorBanner message={state.error} onRetry={state.reload} />
        ) : state.data?.error ? (
          <ErrorBanner message={state.data.error} onRetry={state.reload} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-5 w-5" />}
            title={t("pageMgmt.noScheduledTitle")}
            description={t("pageMgmt.noScheduledDescription")}
          />
        ) : (
          <div className="flex flex-col gap-3 stagger">
            {posts.map((post) => {
              const scheduledLabel =
                post.scheduledPublishTime !== null
                  ? new Date(post.scheduledPublishTime * 1000).toLocaleString("it-IT", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : t("pageMgmt.dateUnavailable");

              const href = post.permalinkUrl
                ? post.permalinkUrl.startsWith("http")
                  ? post.permalinkUrl
                  : `https://www.facebook.com${post.permalinkUrl}`
                : null;

              return (
                <div
                  key={post.id}
                  className="rounded-lg border border-border-subtle bg-bg-inset p-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone="accent">
                      {post.mediaType ? post.mediaType.toUpperCase() : "—"}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-content-faint">
                      <Clock className="h-3.5 w-3.5" />
                      {scheduledLabel}
                    </span>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-content-tertiary transition-colors hover:text-accent"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t("pageMgmt.openOnFacebook")}
                      </a>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-content-secondary">
                    {post.message ? (
                      excerptOf(post.message, 160)
                    ) : (
                      <span className="italic text-content-faint">{t("pageMgmt.noText")}</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ─── Anteprima "stile Facebook" del post in composizione ────────────────────────

function PostPreview({
  pageName,
  message,
  link,
}: {
  pageName: string;
  message: string;
  link: string;
}) {
  const { t } = useTranslation();
  const trimmedLink = link.trim();
  let linkHost = "";
  if (trimmedLink) {
    try {
      linkHost = new URL(trimmedLink).hostname.replace(/^www\./, "");
    } catch {
      linkHost = trimmedLink;
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-bg-card">
      {/* Intestazione: avatar + nome pagina */}
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white"
          aria-hidden="true"
        >
          {pageInitial(pageName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-content-primary">{pageName}</p>
          <p className="text-2xs text-content-faint">{t("pageMgmt.previewNow")}</p>
        </div>
      </div>

      {/* Corpo del post */}
      <div className="px-3.5 pb-3.5 pt-2.5">
        {message.trim() ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-content-secondary">
            {message}
          </p>
        ) : (
          <p className="text-sm italic text-content-faint">{t("pageMgmt.previewPlaceholder")}</p>
        )}

        {trimmedLink && (
          <a
            href={trimmedLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-inset px-3 py-2 transition-colors hover:border-border"
          >
            <Link2 className="h-4 w-4 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-content-secondary">
                {linkHost}
              </span>
              <span className="block truncate text-2xs text-content-faint">{trimmedLink}</span>
            </span>
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Drawer "Crea post" (pubblica / programma) ──────────────────────────────────

function CreatePostDrawer({
  page,
  open,
  onClose,
  onPublished,
}: {
  page: FacebookPage;
  open: boolean;
  onClose: () => void;
  /** Chiamato dopo una pubblicazione/programmazione riuscita: aggiorna la lista. */
  onPublished: () => void;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset dei campi a ogni apertura del drawer.
  useEffect(() => {
    if (open) {
      setMessage("");
      setLink("");
      setScheduledAt("");
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  const epoch = toEpochSeconds(scheduledAt);
  const isScheduled = epoch !== undefined;
  const canPublish = message.trim().length > 0;

  // Programmazione FB: la data deve essere nel futuro (almeno ~10 min consigliati).
  const scheduleInPast = isScheduled && epoch! * 1000 <= Date.now();

  async function performPublish() {
    setPublishing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await publishNative(page.id, {
        message: message.trim(),
        link: link.trim() || undefined,
        scheduledPublishTime: epoch,
      });
      if (!res.ok) {
        setError(res.error ?? t("pageMgmt.publishFailed"));
        setConfirmOpen(false);
        return;
      }
      // Successo: chiudi il drawer e aggiorna la lista post.
      setConfirmOpen(false);
      onPublished();
    } catch (err) {
      setError(errorMessage(err) || t("pageMgmt.publishError"));
      setConfirmOpen(false);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("pageMgmt.createPost")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={publishing}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!canPublish || scheduleInPast}
            onClick={() => setConfirmOpen(true)}
          >
            <Send className="h-4 w-4" />
            {t(isScheduled ? "pageMgmt.schedule" : "pageMgmt.publishNow")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Composizione */}
        <div className="flex flex-col gap-4">
          <Field label={t("pageMgmt.postTextLabel")}>
            <Textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setError(null);
              }}
              placeholder={t("pageMgmt.postTextComposePlaceholder")}
              rows={4}
              autoFocus
            />
          </Field>

          <Field label={t("pageMgmt.linkLabel")}>
            <Input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
            />
          </Field>

          <Field label={t("pageMgmt.scheduleLabel")} hint={t("pageMgmt.scheduleHint")}>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </Field>
        </div>

        {/* Anteprima live stile Facebook */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-content-secondary">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            {t("pageMgmt.preview")}
          </div>
          <PostPreview pageName={page.name} message={message} link={link} />
        </div>

        {scheduleInPast ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs leading-snug text-content-secondary">
              {t("pageMgmt.schedulePast")}
            </p>
          </div>
        ) : isScheduled ? (
          <div className="flex items-start gap-2 rounded-lg border border-border-subtle bg-bg-inset px-3 py-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-content-tertiary" />
            <p className="text-xs leading-snug text-content-secondary">
              {t("pageMgmt.scheduledFor")}{" "}
              <span className="font-medium text-content-primary">
                {new Date(scheduledAt).toLocaleString("it-IT", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              .
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p className="text-xs leading-snug text-content-secondary">
              {t("pageMgmt.publishRealWarning", { pageName: page.name })}
            </p>
          </div>
        )}

        {/* Errori in-place (mai toast auto-dismiss) */}
        {error && <ErrorBanner message={error} />}
        {success && !error && (
          <div className="rounded-lg border border-success/30 bg-success/8 px-4 py-3 text-sm text-success animate-slide-up-in">
            {success}
          </div>
        )}
      </div>

      {/* Conferma forte: pubblicazione su pagina pubblica reale (invariata) */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={performPublish}
        title={t(isScheduled ? "pageMgmt.confirmScheduleTitle" : "pageMgmt.confirmPublishTitle")}
        description={t("pageMgmt.confirmPublishDescription")}
        confirmLabel={t(isScheduled ? "pageMgmt.scheduleReally" : "pageMgmt.publishReally")}
        loading={publishing}
        body={
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p className="text-sm leading-snug text-content-primary">
                {t(isScheduled ? "pageMgmt.confirmScheduleBody" : "pageMgmt.confirmPublishBody", {
                  pageName: page.name,
                })}
              </p>
            </div>
            {isScheduled && (
              <p className="text-xs text-content-tertiary">
                {t("pageMgmt.scheduledForLabel")}{" "}
                <span className="font-medium text-content-secondary">
                  {new Date(scheduledAt).toLocaleString("it-IT", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </p>
            )}
          </div>
        }
      />
    </Drawer>
  );
}

// ─── Sotto-tab di sezione (più leggere delle PageTabs) ──────────────────────────

type SubTab = "posts" | "scheduled" | "settings";

function SubTabs({ active, onChange }: { active: SubTab; onChange: (tab: SubTab) => void }) {
  const { t } = useTranslation();
  const items: { id: SubTab; label: string }[] = [
    { id: "posts", label: t("pageMgmt.subPosts") },
    { id: "scheduled", label: t("pageMgmt.subScheduled") },
    { id: "settings", label: t("pageMgmt.subSettings") },
  ];

  return (
    <div
      role="tablist"
      aria-label={t("pageMgmt.sectionsAria")}
      className="flex items-center gap-1.5"
    >
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
              "inline-flex items-center rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
              "transition-[background-color,color] duration-150 ease-out-strong",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
              isActive
                ? "bg-bg-hover text-content-primary"
                : "text-content-tertiary hover:bg-bg-hover/60 hover:text-content-secondary",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Editor impostazioni inline (riusa PageSettingsEditor via Modal) ─────────────

function SettingsSection({ page }: { page: FacebookPage }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader
        title={t("pageMgmt.settingsTitle")}
        description={t("pageMgmt.settingsDescription")}
      />
      <CardBody>
        {/* Pannello impostazioni direttamente in pagina (niente modale). */}
        <PageSettingsEditor key={page.id} pageId={page.id} />
      </CardBody>
    </Card>
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
  const items: { id: Platform; label: string; icon: ReactNode; show: boolean }[] = [
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
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
    </div>
  );
}

// ─── Schermata ──────────────────────────────────────────────────────────────────

export function GestionePaginaScreen() {
  const { t } = useTranslation();
  const pagesState = useAsync<FacebookPage[]>((s) => getPages(s), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [subTab, setSubTab] = useState<SubTab>("posts");
  const [createOpen, setCreateOpen] = useState(false);
  // Bump dopo una pubblicazione per forzare il reload della lista post.
  const [reloadToken, setReloadToken] = useState(0);

  const pages = useMemo(() => pagesState.data ?? [], [pagesState.data]);

  // Pagina selezionata: quella scelta, altrimenti la prima disponibile.
  const selected: FacebookPage | null =
    pages.length === 0 ? null : (pages.find((p) => p.id === selectedId) ?? pages[0]);

  // Default alla prima pagina al caricamento (o se la selezione non è più valida).
  useEffect(() => {
    if (pages.length === 0) return;
    if (!selectedId || !pages.some((p) => p.id === selectedId)) {
      setSelectedId(pages[0].id);
    }
  }, [pages, selectedId]);

  const hasInstagram = selected?.igUserId != null;

  // Se la pagina selezionata non ha (più) un account Instagram collegato, torna su Facebook.
  useEffect(() => {
    if (!hasInstagram && platform === "instagram") setPlatform("facebook");
  }, [hasInstagram, platform]);

  function handlePublished() {
    setCreateOpen(false);
    setPlatform("facebook");
    setSubTab("posts");
    setReloadToken((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header card con selettore pagina + azione primaria "Crea post" */}
      <Card>
        <CardHeader
          title={t("pageMgmt.title")}
          description={t("pageMgmt.description")}
          action={
            selected ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("pageMgmt.createPost")}
              </Button>
            ) : undefined
          }
        />
        <CardBody>
          {pagesState.error ? (
            <ErrorBanner message={pagesState.error} onRetry={pagesState.reload} />
          ) : pagesState.loading ? (
            <Skeleton className="h-9 w-64" />
          ) : pages.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title={t("pageMgmt.noPagesTitle")}
              description={t("pageMgmt.noPagesDescription")}
              action={
                <NavLink
                  to="/connessione"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out-strong hover:bg-accent-hover"
                >
                  <Link2 className="h-4 w-4" />
                  {t("pageMgmt.goToConnection")}
                </NavLink>
              }
            />
          ) : pages.length > 1 ? (
            <PageTabs pages={pages} activeId={selected?.id ?? ""} onChange={setSelectedId} />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-content-primary">{selected?.name}</span>
              {selected?.category && (
                <span className="text-xs text-content-tertiary">{selected.category}</span>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Tab piattaforma + sotto-tab + contenuto della sezione attiva */}
      {selected && (
        <div className="flex flex-col gap-4">
          <PlatformTabs active={platform} onChange={setPlatform} showInstagram={hasInstagram} />

          {platform === "instagram" && hasInstagram ? (
            <InstagramPanel key={`ig-${selected.id}`} page={selected} />
          ) : (
            <div className="flex flex-col gap-4">
              <SubTabs active={subTab} onChange={setSubTab} />

              <div key={`${subTab}-${selected.id}`} className="animate-fade-in">
                {subTab === "posts" && (
                  <PublishedPostsSection
                    key={`posts-${selected.id}`}
                    page={selected}
                    reloadToken={reloadToken}
                    onCreatePost={() => setCreateOpen(true)}
                  />
                )}
                {subTab === "scheduled" && (
                  <ScheduledOnFacebookSection key={`scheduled-${selected.id}`} page={selected} />
                )}
                {subTab === "settings" && (
                  <SettingsSection key={`settings-${selected.id}`} page={selected} />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drawer "Crea post" — disponibile da qualsiasi sotto-tab */}
      {selected && (
        <CreatePostDrawer
          key={`create-${selected.id}`}
          page={selected}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onPublished={handlePublished}
        />
      )}
    </div>
  );
}
