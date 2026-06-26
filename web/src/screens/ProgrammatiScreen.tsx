import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CalendarCheck,
  Clock,
  Send,
  Trash2,
  AlertTriangle,
  Info,
  Link2,
  Instagram,
  MoreVertical,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { selectClass } from "@/components/ui/Input";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/toast";
import { FacebookPreview, scheduledAtLabel } from "@/components/FacebookPreview";
import { useAsync, errorMessage } from "@/lib/useAsync";
import { mediaTypeLabel, contentVisualKindLabel } from "@/lib/labels";
import {
  getPages,
  getPagePosts,
  publishPost,
  deleteDraft,
  addInstagramJob,
  removeInstagramJob,
} from "@/api/endpoints";
import type { FacebookPage, ScheduledPost } from "@/api/types";

// Etichetta leggibile del tipo di contenuto in coda. Per reel/storia usa il visualKind del formato
// (affidabile), perché il mediaType del gemello Instagram può risultare generico (es. "IMAGE").
// Per gli altri tipi (testo/foto) usa il mediaType, con fallback sul visualKind.
function programmatoKindLabel(p: ScheduledPost, t: (key: string) => string): string {
  const vk = p.contentFormat?.visualKind;
  if (vk === "reel" || vk === "story") return contentVisualKindLabel(vk);
  if (p.mediaType) return mediaTypeLabel(p.mediaType);
  if (vk && vk !== "none") return contentVisualKindLabel(vk);
  return t("programmati.kindContent");
}

// Un post è candidabile a Instagram solo se è un Reel o una Storia (video 9:16):
// guarda il mediaType (REEL/STORY) o, in fallback, il visualKind del formato.
function isReelOrStory(p: ScheduledPost): boolean {
  if (p.mediaType === "REEL" || p.mediaType === "STORY") return true;
  const vk = p.contentFormat?.visualKind;
  return vk === "reel" || vk === "story";
}

// ---------------------------------------------------------------------------
// Card di un singolo contenuto programmato in coda al job interno: anteprima
// Facebook + badge tipo/orario + azioni "Pubblica adesso" / "Rimuovi".
// Stati loading/errore in-place, come fa il Pianificatore.
// ---------------------------------------------------------------------------

function ProgrammatoCard({
  post,
  pageName,
  igTwin,
  onChanged,
}: {
  post: ScheduledPost;
  pageName: string;
  // Job IG gemello già presente in lista per questo post FB (se esiste).
  igTwin: ScheduledPost | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [publishing, setPublishing] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [igBusy, setIgBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInstagram = post.platform === "instagram";
  const canGoInstagram = !isInstagram && isReelOrStory(post);

  const scheduleLabel = scheduledAtLabel(post.scheduledAt);
  const busy = publishing || deleting || igBusy;

  async function handleAddInstagram() {
    setIgBusy(true);
    setError(null);
    try {
      await addInstagramJob(post.id);
      toast.success(t("instagram.addedToast"));
      onChanged();
    } catch (err) {
      const msg = errorMessage(err);
      setError(
        /422/.test(msg) ? t("instagram.addFailedReelStory") : msg || t("instagram.addFailed"),
      );
    } finally {
      setIgBusy(false);
    }
  }

  async function handleRemoveInstagram() {
    setIgBusy(true);
    setError(null);
    try {
      await removeInstagramJob(post.id);
      toast.success(t("instagram.removedToast"));
      onChanged();
    } catch (err) {
      setError(errorMessage(err) || t("instagram.removeFailed"));
    } finally {
      setIgBusy(false);
    }
  }

  async function handlePublishNow() {
    setPublishing(true);
    setError(null);
    try {
      // Senza scheduledAt → pubblica ADESSO.
      await publishPost(post.id);
      toast.success(t("programmati.publishedToast"));
      setConfirmPublish(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err) || t("programmati.publishFailed"));
    } finally {
      setPublishing(false);
    }
  }

  async function handleRemove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteDraft(post.id);
      toast.success(t("programmati.removedToast"));
      setConfirmDelete(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err) || t("programmati.removeFailed"));
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-inset p-4">
      <div className="max-h-80 overflow-hidden rounded-lg">
        <FacebookPreview draft={post} pageName={pageName} />
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {isInstagram && (
            <Badge className="border-[#C13584]/40 bg-[#C13584]/10 text-[#C13584]">
              <Instagram className="h-3 w-3" />
              {t("instagram.badge")}
            </Badge>
          )}
          <Badge tone="accent">{programmatoKindLabel(post, t)}</Badge>
          {isInstagram && post.linkedPostId && (
            <span className="text-2xs font-medium text-content-tertiary">
              {t("instagram.linkedToFb")}
            </span>
          )}
          {scheduleLabel && (
            <Badge tone="neutral">
              <Clock className="h-3 w-3" />
              {scheduleLabel}
            </Badge>
          )}
        </div>
        <Badge tone="success">{t("programmati.inQueue")}</Badge>
      </div>

      {error && (
        <div className="mb-3">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
        <Button
          variant="primary"
          size="sm"
          onClick={() => setConfirmPublish(true)}
          loading={publishing}
          disabled={busy}
        >
          <Send className="h-4 w-4" />
          {t("programmati.publishNow")}
        </Button>

        {/* Toggle "anche su Instagram": solo sui post FB Reel/Storia. */}
        {canGoInstagram &&
          (igTwin ? (
            <div className="ml-auto flex items-center gap-2">
              <Tooltip content={t("instagram.alsoPublishedTooltip")}>
                <span className="inline-flex cursor-default items-center gap-1.5 text-xs font-medium text-success">
                  <Instagram className="h-4 w-4" />
                  {t("instagram.alsoPublishedOn")}
                </span>
              </Tooltip>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveInstagram}
                loading={igBusy}
                disabled={busy}
              >
                {t("instagram.removeShort")}
              </Button>
            </div>
          ) : (
            <Tooltip content={t("instagram.alsoPublishTooltip")}>
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto"
                onClick={handleAddInstagram}
                loading={igBusy}
                disabled={busy}
              >
                <Instagram className="h-4 w-4" />
                {t("instagram.alsoPublish")}
              </Button>
            </Tooltip>
          ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={t("common.moreActions")} disabled={busy}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem danger onSelect={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              {t("programmati.removeFromQueue")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Modal
        open={confirmPublish}
        onClose={() => {
          if (publishing) return;
          setConfirmPublish(false);
        }}
        size="sm"
        title={t("programmati.publishNow")}
        description={t("programmati.publishConfirmDescription")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmPublish(false)} disabled={publishing}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={handlePublishNow} loading={publishing}>
              <Send className="h-4 w-4" />
              {t("programmati.publishNow")}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-sm leading-snug text-content-primary">
            {t("programmati.publishConfirmBody", { pageName })}
          </p>
        </div>
        {error && (
          <div className="mt-3">
            <ErrorBanner message={error} />
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => {
          if (deleting) return;
          setConfirmDelete(false);
        }}
        size="sm"
        title={t("programmati.removeFromQueue")}
        description={t("programmati.removeConfirmDescription")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={handleRemove} loading={deleting}>
              <Trash2 className="h-4 w-4" />
              {t("programmati.remove")}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-snug text-content-secondary">
          {t("programmati.removeConfirmBody")}
        </p>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lista dei contenuti in coda al job interno per la pagina attiva: coda job =
// status==='SCHEDULED' && !fbPostId (reel/storie pubblicati dal job interno;
// i post programmati nativamente su Facebook hanno fbPostId e NON compaiono qui).
// ---------------------------------------------------------------------------

function ProgrammatiList({ page }: { page: FacebookPage }) {
  const { t } = useTranslation();
  const postsState = useAsync<ScheduledPost[]>((s) => getPagePosts(page.id, s), [page.id]);

  const all = postsState.data ?? [];
  const programmati = all
    .filter((p) => p.status === "SCHEDULED" && !p.fbPostId && p.dashboardHidden !== true)
    .sort(
      (a, b) =>
        (a.scheduledAt ?? Number.POSITIVE_INFINITY) - (b.scheduledAt ?? Number.POSITIVE_INFINITY),
    );

  // Mappa: id del post FB → suo job IG gemello (riga platform==='instagram' con linkedPostId
  // che punta al post FB). Serve a mostrare lo stato del toggle "anche su Instagram".
  const igTwinByFbId = new Map<string, ScheduledPost>();
  for (const p of programmati) {
    if (p.platform === "instagram" && p.linkedPostId) {
      igTwinByFbId.set(p.linkedPostId, p);
    }
  }

  const fbCount = programmati.filter((p) => p.platform !== "instagram").length;

  return (
    <Card>
      <CardHeader
        title={t("programmati.queueTitle")}
        description={t("programmati.queueDescription")}
        action={
          !postsState.loading && fbCount > 0 ? <Badge tone="neutral">{fbCount}</Badge> : undefined
        }
      />
      <CardBody>
        {postsState.loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : postsState.error ? (
          <ErrorBanner message={postsState.error} onRetry={postsState.reload} />
        ) : programmati.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="h-5 w-5" />}
            title={t("programmati.noContentTitle")}
            description={t("programmati.noContentDescription")}
          />
        ) : (
          <div className="flex flex-col gap-4 stagger">
            {programmati.map((post) => (
              <ProgrammatoCard
                key={post.id}
                post={post}
                pageName={page.name}
                igTwin={igTwinByFbId.get(post.id) ?? null}
                onChanged={postsState.reload}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ProgrammatiScreen() {
  const { t } = useTranslation();
  const pagesState = useAsync<FacebookPage[]>((s) => getPages(s), []);
  const [activeId, setActiveId] = useState("");

  const pages = useMemo(() => pagesState.data ?? [], [pagesState.data]);
  const activePage = pages.find((p) => p.id === activeId) ?? pages[0] ?? null;

  // Default alla prima pagina al caricamento (o se la selezione non è più valida).
  useEffect(() => {
    if (pages.length === 0) return;
    if (!activeId || !pages.some((p) => p.id === activeId)) {
      setActiveId(pages[0].id);
    }
  }, [pages, activeId]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("programmati.title")} description={t("programmati.description")} />

      {pagesState.error ? (
        <ErrorBanner message={pagesState.error} onRetry={pagesState.reload} />
      ) : pagesState.loading ? (
        <Skeleton className="h-9 w-48" />
      ) : pages.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<CalendarCheck className="h-5 w-5" />}
              title={t("programmati.noPagesTitle")}
              description={t("programmati.noPagesDescription")}
              action={
                <NavLink
                  to="/connessione"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out-strong hover:bg-accent-hover"
                >
                  <Link2 className="h-4 w-4" />
                  {t("programmati.goToConnection")}
                </NavLink>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title={t("programmati.pageField")}
              action={
                <select
                  className={selectClass + " w-full max-w-xs"}
                  value={activePage?.id ?? ""}
                  onChange={(e) => setActiveId(e.target.value)}
                >
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              }
            />
          </Card>

          <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2">
            <Info className="h-4 w-4 shrink-0 text-accent" />
            <p className="text-sm leading-snug text-content-secondary">
              {t("programmati.serverWarning")}
            </p>
          </div>

          {activePage && <ProgrammatiList key={activePage.id} page={activePage} />}
        </>
      )}
    </div>
  );
}
