import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  Info,
  Link as LinkIcon,
  MoreVertical,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  ShieldCheck,
  Trash2,
  User,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Collapsible } from "@/components/ui/Collapsible";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, ErrorBanner, Skeleton, Spinner } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Input, Textarea, Field, selectClass } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { MusicLibrary } from "@/components/MusicLibrary";
import { useToast } from "@/components/ui/toast";
import { useAsync, errorMessage } from "@/lib/useAsync";
import { useStatus } from "@/lib/status";
import { useJobs } from "@/lib/jobs";
import {
  addBookLink,
  addCharacter,
  buildVisualBible,
  cancelBookImages,
  cancelSceneQueueBatch,
  cancelMediaRegen,
  deleteBook,
  deleteBookLink,
  deleteBookMedia,
  deleteCharacter,
  generateBookImages,
  generateChapterScene,
  getBook,
  getChapters,
  getCharacters,
  setChapterExcluded,
  updateChapterScene,
  getMediaRegenStatusGlobal,
  cancelAllMediaRegen,
  getVisualDomains,
  regenerateMediaBatch,
  getPages,
  getSceneGen,
  getVisualBibleStatus,
  imageGenAvailable,
  linkBookToPage,
  reanalyzeBook,
  reindexBookNlp,
  recomputeCharacterChapters,
  regenerateMediaImage,
  updateMediaCatalog,
  renameBook,
  updateBookLink,
  updateCharacter,
  uploadBookMedia,
} from "@/api/endpoints";
import { ApiError } from "@/api/client";
import type {
  BookCharacter,
  BookChapterFull,
  BookDetail,
  BookVisualExtras,
  BookVisualProps,
  ChapterScene,
  CharacterInput,
  CharacterOutfit,
  DrivingSide,
  FacebookPage,
  LinkUsagePolicy,
  MediaRegenStatusGlobal,
  MinorCharacter,
  SceneAspect,
  SceneBatch,
  SceneGenStatus,
  VisualDomainInfo,
  VisualProp,
} from "@/api/types";
import type { VBStepKey, VisualBibleStatus } from "@/api/endpoints";
import { cn } from "@/lib/cn";
import { linkChannelLabel, linkUsageLabel } from "@/lib/labels";

type BookTab = "scheda" | "link" | "immagini" | "musica" | "capitoli" | "personaggi";

type SchedaSubTab = "profilo" | "visivo" | "pagine";

type VisivoTab = "direttive" | "props" | "minors";

export function BookDetailScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { refresh: refreshStatus } = useStatus();

  const detail = useAsync<BookDetail>((s) => getBook(id, s), [id]);
  const pagesState = useAsync<FacebookPage[]>((s) => getPages(s), []);

  // Il contesto globale dei job è la fonte di verità per "questo libro è in analisi".
  // Lo stato sopravvive alla navigazione perché vive sopra la route.
  const { isBookAnalyzing, refresh: refreshJobs, onBookAnalysisDone } = useJobs();
  const reanalyzing = isBookAnalyzing(id);

  const [vbStarting, setVbStarting] = useState(false);
  const visualBible = useVisualBibleStatus(id, (s) => {
    if (s.status === "done") toast.success(t("book.visualBible.updated"));
    else toast.error(s.error || t("book.visualBible.buildFailed"));
    detail.reload();
    setReloadKey((k) => k + 1);
  });
  async function buildVisualBibleNow() {
    setVbStarting(true);
    try {
      await visualBible.start();
    } catch (err) {
      toast.error(errorMessage(err) || t("book.visualBible.startFailed"));
    } finally {
      setVbStarting(false);
    }
  }

  const [tab, setTab] = useState<BookTab>("scheda");
  const [schedaSubTab, setSchedaSubTab] = useState<SchedaSubTab>("profilo");
  const [visivoTab, setVisivoTab] = useState<VisivoTab>("direttive");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReanalyze, setConfirmReanalyze] = useState(false);

  // Errore solo per il fallimento dell'avvio (POST /reanalyze): l'avanzamento
  // del job è gestito globalmente. reloadKey forza il rimontaggio dei tab
  // Capitoli/Personaggi quando l'analisi finisce.
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Quando il job di questo libro passa da analyzing -> terminato, ricarica
  // scheda + capitoli + personaggi così i dati appena estratti compaiono.
  useEffect(() => {
    const off = onBookAnalysisDone(id, () => {
      detail.reload();
      setReloadKey((k) => k + 1);
      toast.success(t("book.analysisDone"));
    });
    return off;
    // detail/toast sono stabili nel ciclo di vita di questa schermata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, onBookAnalysisDone]);

  async function startReanalyze() {
    setConfirmReanalyze(false);
    setReanalyzeError(null);
    try {
      await reanalyzeBook(id, i18n.language);
      // Poll immediato: il contesto globale rileverà subito il job in corso.
      refreshJobs();
    } catch (err) {
      setReanalyzeError(errorMessage(err) || t("book.analysisStartFailed"));
    }
  }

  // Ri-estrae SOLO le frasi reali (pre-pass NLP), senza rifare la scheda GPT. Sincrono (~secondi).
  const [reindexing, setReindexing] = useState(false);
  async function reindexNlp() {
    if (reindexing) return;
    setReindexing(true);
    try {
      const r = await reindexBookNlp(id);
      toast.success(t("bookDetail.reindexNlpDone", { count: r.quotes }));
      detail.reload();
    } catch (err) {
      toast.error(errorMessage(err) || t("bookDetail.reindexNlpFailed"));
    } finally {
      setReindexing(false);
    }
  }

  // Skeleton SOLO al primo caricamento (nessun dato ancora): durante un reload (es. a fine
  // rigenerazione immagine) si mantengono i dati esistenti, così il tab e il lightbox aperto
  // NON vengono smontati/chiusi.
  if (detail.loading && !detail.data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (detail.error) {
    return <ErrorBanner message={detail.error} onRetry={detail.reload} />;
  }
  if (!detail.data) {
    return (
      <EmptyState title={t("book.notFoundTitle")} description={t("book.notFoundDescription")} />
    );
  }

  const { book, profile, links, media, chapters } = detail.data;
  const pages = pagesState.data ?? [];

  async function handleDelete() {
    try {
      await deleteBook(id);
      toast.success(t("book.bookDeleted"));
      refreshStatus();
      navigate("/libri");
    } catch (err) {
      toast.error(errorMessage(err) || t("common.deleteFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate("/libri")}
        className="inline-flex items-center gap-1.5 self-start text-sm text-content-tertiary transition-colors hover:text-content-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("book.library")}
      </button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <TitleEditor
          title={book.title}
          author={book.author ?? null}
          onSave={async (title) => {
            const updated = await renameBook(id, { title });
            detail.setData((prev) =>
              prev ? { ...prev, book: { ...prev.book, ...updated, title } } : prev,
            );
            toast.success(t("book.titleUpdated"));
          }}
        />
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip content={t("book.visualBible.buildTooltip")}>
            <Button
              variant="primary"
              size="sm"
              loading={vbStarting || visualBible.running}
              disabled={vbStarting || visualBible.running}
              onClick={buildVisualBibleNow}
            >
              {!vbStarting && !visualBible.running && <Wand2 className="h-4 w-4" />}
              {visualBible.running
                ? t("book.visualBible.buildingShort")
                : t("book.visualBible.buildShort")}
            </Button>
          </Tooltip>
          <Button
            variant="secondary"
            size="sm"
            loading={reanalyzing}
            onClick={() => setConfirmReanalyze(true)}
          >
            {!reanalyzing && <Sparkles className="h-4 w-4" />}
            {reanalyzing ? t("book.analysisInProgress") : t("book.regenerateAnalysis")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("book.actions.more")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-card text-content-secondary transition-colors duration-150 ease-out-strong hover:bg-bg-hover hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => void reindexNlp()}>
                <FileText className="h-4 w-4" />
                {t("bookDetail.reindexNlp")}
              </DropdownMenuItem>
              <DropdownMenuItem danger onSelect={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                {t("book.deleteBook")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {reanalyzeError && (
        <ErrorBanner message={reanalyzeError} onRetry={() => setConfirmReanalyze(true)} />
      )}
      {reanalyzing && (
        <div className="flex items-center gap-2.5 rounded-lg border border-accent/20 bg-accent-soft px-4 py-3 text-sm text-content-secondary animate-fade-in">
          <Spinner className="h-4 w-4" />
          <span>{t("book.analysisRunningNote")}</span>
        </div>
      )}

      <VisualBiblePanel status={visualBible.status} />

      <BookTabBar active={tab} onChange={setTab} />

      {tab === "scheda" && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <SchedaSubTabBar active={schedaSubTab} onChange={setSchedaSubTab} />

          {schedaSubTab === "profilo" && (
            <div className="flex flex-col gap-6 animate-fade-in">
              <ProfileCard profile={profile} />

              <BaseHashtagsCard
                value={book.baseHashtags ?? []}
                onSave={async (tags) => {
                  await renameBook(id, { baseHashtags: tags });
                  detail.setData((prev) =>
                    prev ? { ...prev, book: { ...prev.book, baseHashtags: tags } } : prev,
                  );
                  toast.success(t("book.baseHashtags.saved"));
                }}
              />
            </div>
          )}

          {schedaSubTab === "visivo" && (
            <div className="flex flex-col gap-5 animate-fade-in">
              <VisivoTabBar active={visivoTab} onChange={setVisivoTab} />

              {visivoTab === "direttive" && (
                <div className="flex animate-fade-in flex-col gap-4">
                  <VisualDirectivesCard
                    bookId={id}
                    domains={book.visualDomains ?? []}
                    directives={book.visualDirectives ?? ""}
                    directivesEn={book.visualDirectivesEn ?? ""}
                    onSave={async (next) => {
                      const updated = await renameBook(id, next);
                      detail.setData((prev) =>
                        prev
                          ? {
                              ...prev,
                              book: {
                                ...prev.book,
                                visualDomains: updated.visualDomains,
                                visualDirectives: updated.visualDirectives,
                                visualDirectivesEn: updated.visualDirectivesEn,
                              },
                            }
                          : prev,
                      );
                      toast.success(t("book.directives.saved"));
                    }}
                  />
                  <BookExtraInstructionsCard
                    textExtra={book.textExtraInstructions ?? ""}
                    imageExtra={book.imageExtraInstructions ?? ""}
                    onSave={async (next) => {
                      const updated = await renameBook(id, next);
                      detail.setData((prev) =>
                        prev
                          ? {
                              ...prev,
                              book: {
                                ...prev.book,
                                textExtraInstructions: updated.textExtraInstructions,
                                imageExtraInstructions: updated.imageExtraInstructions,
                              },
                            }
                          : prev,
                      );
                      toast.success(t("bookDetail.extraInstructionsSaved"));
                    }}
                  />
                </div>
              )}

              {visivoTab === "props" && (
                <div className="animate-fade-in">
                  <VisualPropsCard
                    book={book}
                    onUpdated={(visualProps) =>
                      detail.setData((prev) =>
                        prev ? { ...prev, book: { ...prev.book, visualProps } } : prev,
                      )
                    }
                  />
                </div>
              )}

              {visivoTab === "minors" && (
                <div className="animate-fade-in">
                  <VisualExtrasCard
                    book={book}
                    onUpdated={(visualExtras) =>
                      detail.setData((prev) =>
                        prev ? { ...prev, book: { ...prev.book, visualExtras } } : prev,
                      )
                    }
                  />
                </div>
              )}
            </div>
          )}

          {schedaSubTab === "pagine" && (
            <div className="flex flex-col gap-6 animate-fade-in">
              <PagesCard
                bookId={id}
                pages={pages}
                loading={pagesState.loading}
                error={pagesState.error}
                onRetry={pagesState.reload}
              />
            </div>
          )}
        </div>
      )}

      {tab === "link" && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <LinksCard bookId={id} links={links} onChange={() => detail.reload()} />
        </div>
      )}

      {tab === "immagini" && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <MediaCard
            bookId={id}
            media={media}
            chapters={chapters}
            onChange={() => detail.reload()}
          />
        </div>
      )}

      {tab === "musica" && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <MusicLibrary bookId={id} />
        </div>
      )}

      {tab === "capitoli" && <ChaptersTab key={reloadKey} bookId={id} />}

      {tab === "personaggi" && (
        <CharactersTab
          key={reloadKey}
          bookId={id}
          onRequestReanalyze={() => setConfirmReanalyze(true)}
        />
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("book.confirmDeleteTitle")}
        description={t("book.confirmDeleteDescription")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">
          {t("book.confirmDeleteBody", { title: book.title })}
        </p>
      </Modal>

      <Modal
        open={confirmReanalyze}
        onClose={() => setConfirmReanalyze(false)}
        title={t("book.confirmReanalyzeTitle")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReanalyze(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={startReanalyze}>
              <Sparkles className="h-4 w-4" />
              {t("book.regenerateAnalysis")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">{t("book.confirmReanalyzeBody")}</p>
      </Modal>
    </div>
  );
}

function SchedaSubTabBar({
  active,
  onChange,
}: {
  active: SchedaSubTab;
  onChange: (sub: SchedaSubTab) => void;
}) {
  const { t } = useTranslation();
  const subs: { id: SchedaSubTab; label: string; icon: typeof User }[] = [
    { id: "profilo", label: t("book.schedaSub.profilo"), icon: User },
    { id: "visivo", label: t("book.schedaSub.visivo"), icon: Palette },
    { id: "pagine", label: t("book.schedaSub.pagine"), icon: FileText },
  ];
  return (
    <div
      role="tablist"
      aria-label={t("book.schedaSub.aria")}
      className="inline-flex items-center gap-1 self-start rounded-lg border border-border-subtle bg-bg-card p-1"
    >
      {subs.map((s) => {
        const isActive = s.id === active;
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(s.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
              "transition-colors duration-150 ease-out-strong",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
              isActive
                ? "bg-accent-soft text-accent"
                : "text-content-tertiary hover:bg-bg-hover hover:text-content-primary",
            )}
          >
            <Icon className="h-4 w-4" />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function VisivoTabBar({
  active,
  onChange,
}: {
  active: VisivoTab;
  onChange: (tab: VisivoTab) => void;
}) {
  const { t } = useTranslation();
  const tabs: { id: VisivoTab; label: string }[] = [
    { id: "direttive", label: t("book.visivo.direttive") },
    { id: "props", label: t("book.visivo.props") },
    { id: "minors", label: t("book.visivo.minors") },
  ];
  return (
    <div
      role="tablist"
      aria-label={t("book.visivo.aria")}
      className="flex items-center gap-4 border-b border-border-subtle"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px border-b-2 px-0.5 pb-2.5 text-sm font-medium",
              "transition-colors duration-150 ease-out-strong",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
              isActive
                ? "border-accent text-content-primary"
                : "border-transparent text-content-tertiary hover:text-content-primary",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Barra di tab secondaria della scheda libro. Stile coerente con PageTabs:
 * tab attiva pill morbida (bg-accent-soft) con bordo inferiore accent.
 */
function BookTabBar({ active, onChange }: { active: BookTab; onChange: (tab: BookTab) => void }) {
  const { t } = useTranslation();
  const tabs: { id: BookTab; label: string }[] = [
    { id: "scheda", label: t("book.tabs.scheda") },
    { id: "link", label: t("book.tabs.link") },
    { id: "immagini", label: t("book.tabs.images") },
    { id: "musica", label: t("book.tabs.music") },
    { id: "capitoli", label: t("book.tabs.chapters") },
    { id: "personaggi", label: t("book.tabs.characters") },
  ];
  return (
    <div
      role="tablist"
      aria-label={t("book.sectionsAria")}
      className="flex items-center gap-1 border-b border-border-subtle pb-px"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={cn(
              "shrink-0 rounded-t-lg border-b-2 px-3.5 py-2 text-sm font-medium",
              "transition-all duration-150 ease-out-strong",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
              isActive
                ? "border-accent bg-accent-soft text-accent"
                : "border-transparent text-content-secondary hover:bg-bg-hover hover:text-content-primary",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function TitleEditor({
  title,
  author,
  onSave,
}: {
  title: string;
  author: string | null;
  onSave: (title: string) => Promise<void>;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);

  async function commit() {
    const next = value.trim();
    if (!next) {
      toast.error(t("book.titleEmpty"));
      return;
    }
    if (next === title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err) || t("book.renameFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setValue(title);
              setEditing(false);
            }
          }}
          className="h-10 text-lg font-semibold"
        />
        <Button variant="primary" size="sm" loading={saving} onClick={commit}>
          <Check className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setValue(title);
            setEditing(false);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2">
      <div>
        <h2 className="text-xl font-semibold text-content-primary">{title}</h2>
        {author && <p className="text-sm text-content-tertiary">{author}</p>}
      </div>
      <button
        type="button"
        onClick={() => {
          setValue(title);
          setEditing(true);
        }}
        className="rounded-md p-1.5 text-content-faint opacity-0 transition-[opacity,transform,color] duration-150 ease-out-strong hover:text-content-primary group-hover:opacity-100 active:scale-90"
        aria-label={t("book.renameBook")}
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}

function ProfileCard({ profile }: { profile: BookDetail["profile"] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader
        title={t("book.profile.title")}
        description={t("book.profile.description")}
        action={
          <Tooltip content={t("book.profile.antiSpoilerNote")}>
            <span className="inline-flex">
              <Badge tone="success">
                <ShieldCheck className="h-3 w-3" />
                {t("book.profile.antiSpoilerBadge")}
              </Badge>
            </span>
          </Tooltip>
        }
      />
      <CardBody className="flex flex-col gap-5">
        {!profile ? (
          <p className="text-sm text-content-tertiary">{t("book.profile.notAvailable")}</p>
        ) : (
          <>
            {profile.synopsis && (
              <div>
                <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-content-secondary">
                  {t("book.profile.synopsis")}
                </h4>
                <p className="max-w-prose text-sm leading-relaxed text-content-secondary">
                  {profile.synopsis}
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-x-8 gap-y-5">
              {profile.genres && profile.genres.length > 0 && (
                <MetaList label={t("book.profile.genres")} items={profile.genres} tone="accent" />
              )}
              {profile.themes && profile.themes.length > 0 && (
                <MetaList label={t("book.profile.themes")} items={profile.themes} />
              )}
            </div>
            {profile.tone && (
              <div>
                <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-content-secondary">
                  {t("book.profile.tone")}
                </h4>
                <p className="max-w-prose text-sm leading-relaxed text-content-secondary">
                  {profile.tone}
                </p>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function MetaList({
  label,
  items,
  tone = "neutral",
}: {
  label: string;
  items: string[];
  tone?: "neutral" | "accent";
}) {
  return (
    <div>
      <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-content-secondary">
        {label}
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Badge key={it} tone={tone}>
            {it}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function normalizeTag(raw: string): string {
  const t = raw.trim().replace(/^#+/, "");
  return t ? `#${t.replace(/\s+/g, "")}` : "";
}

function BaseHashtagsCard({
  value,
  onSave,
}: {
  value: string[];
  onSave: (tags: string[]) => Promise<void>;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [tags, setTags] = useState<string[]>(value);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(tags) !== JSON.stringify(value);

  function add() {
    const tag = normalizeTag(draft);
    if (!tag) return;
    if (tags.includes(tag)) {
      setDraft("");
      return;
    }
    setTags((prev) => [...prev, tag]);
    setDraft("");
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(tags);
    } catch (err) {
      toast.error(errorMessage(err) || t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("book.baseHashtags.title")}
        description={t("book.baseHashtags.description")}
        action={
          dirty ? (
            <Button variant="primary" size="sm" loading={saving} onClick={save}>
              {t("common.save")}
            </Button>
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 && (
            <span className="text-sm text-content-tertiary">{t("book.baseHashtags.empty")}</span>
          )}
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
            >
              {tag}
              <button
                type="button"
                onClick={() => setTags((prev) => prev.filter((x) => x !== tag))}
                className="rounded transition-transform duration-150 ease-out-strong hover:text-accent-hover active:scale-90"
                aria-label={t("book.baseHashtags.removeAria", { tag })}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder={t("book.baseHashtags.placeholder")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button variant="secondary" onClick={add}>
            <Plus className="h-4 w-4" />
            {t("common.add")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function VisualDirectivesCard({
  bookId: _bookId,
  domains,
  directives,
  directivesEn,
  onSave,
}: {
  bookId: string;
  domains: string[];
  directives: string;
  directivesEn: string;
  onSave: (next: { visualDomains: string[]; visualDirectives: string | null }) => Promise<void>;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [availableDomains, setAvailableDomains] = useState<VisualDomainInfo[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [domainsError, setDomainsError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(domains));
  const [text, setText] = useState(directives);
  const [enPreview, setEnPreview] = useState(directivesEn);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedKeys(new Set(domains));
  }, [domains]);

  useEffect(() => {
    setText(directives);
  }, [directives]);

  useEffect(() => {
    setEnPreview(directivesEn);
  }, [directivesEn]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoadingDomains(true);
    setDomainsError(null);
    getVisualDomains(ctrl.signal)
      .then((res) => {
        setAvailableDomains(res.domains);
        setLoadingDomains(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setDomainsError(errorMessage(err) || t("book.directives.loadFailed"));
        setLoadingDomains(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleDomain(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({
        visualDomains: Array.from(selectedKeys),
        visualDirectives: text.trim() === "" ? null : text.trim(),
      });
    } catch (err) {
      toast.error(errorMessage(err) || t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("book.directives.title")}
        description={t("book.directives.description")}
      />
      <CardBody className="flex flex-col gap-4">
        <p className="text-sm text-content-secondary">{t("book.directives.intro")}</p>
        {loadingDomains && <Spinner className="h-4 w-4" />}
        {domainsError && <ErrorBanner message={domainsError} />}
        {!loadingDomains && !domainsError && availableDomains.length === 0 && (
          <p className="text-sm text-content-tertiary">{t("book.directives.noDomains")}</p>
        )}
        {!loadingDomains && availableDomains.length > 0 && (
          <div className="flex flex-col gap-2">
            {availableDomains.map((domain) => (
              <label
                key={domain.key}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border-subtle bg-bg-inset px-3 py-2.5 transition-colors hover:bg-bg-hover"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={selectedKeys.has(domain.key)}
                  onChange={() => toggleDomain(domain.key)}
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-content-primary">
                    {t("visualDomain." + domain.key + ".label", { defaultValue: domain.label })}
                  </span>
                  {domain.description && (
                    <span className="text-xs text-content-tertiary">
                      {t("visualDomain." + domain.key + ".description", {
                        defaultValue: domain.description,
                      })}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
        <Field label={t("book.directives.freeText")}>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={t("book.directives.freeTextPlaceholder")}
          />
        </Field>
        {enPreview.trim() !== "" && enPreview.trim() !== text.trim() && (
          <div className="rounded-lg border border-border-subtle bg-bg-inset px-3 py-2.5">
            <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-content-secondary">
              {t("book.directives.translatedLabel")}
            </p>
            <p className="text-sm leading-relaxed text-content-tertiary">{enPreview}</p>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="primary" loading={saving} onClick={save}>
            {t("common.save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// Istruzioni-extra PER-LIBRO: testo libero accodato ai prompt di post/immagine di QUESTO libro,
// in aggiunta alle istruzioni globali e al core ingegnerizzato. Non sostituiscono il prompt: sono
// guida aggiuntiva (vuoto = nessun extra per-libro).
function BookExtraInstructionsCard({
  textExtra,
  imageExtra,
  onSave,
}: {
  textExtra: string;
  imageExtra: string;
  onSave: (next: {
    textExtraInstructions: string | null;
    imageExtraInstructions: string | null;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [text, setText] = useState(textExtra);
  const [image, setImage] = useState(imageExtra);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(textExtra);
  }, [textExtra]);
  useEffect(() => {
    setImage(imageExtra);
  }, [imageExtra]);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        textExtraInstructions: text.trim() === "" ? null : text.trim(),
        imageExtraInstructions: image.trim() === "" ? null : image.trim(),
      });
    } catch (err) {
      toast.error(errorMessage(err) || t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("bookDetail.extraInstructionsTitle")}
        description={t("bookDetail.extraInstructionsDesc")}
      />
      <CardBody className="flex flex-col gap-4">
        <p className="text-sm text-content-secondary">{t("bookDetail.extraInstructionsHint")}</p>
        <Field label={t("bookDetail.extraTextLabel")}>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={t("bookDetail.extraTextPlaceholder")}
          />
        </Field>
        <Field label={t("bookDetail.extraImageLabel")}>
          <Textarea
            value={image}
            onChange={(e) => setImage(e.target.value)}
            rows={4}
            placeholder={t("bookDetail.extraImagePlaceholder")}
          />
        </Field>
        <div className="flex justify-end">
          <Button variant="primary" loading={saving} onClick={save}>
            {t("common.save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// Tipi (channel) offerti nel select. Campo libero lato API: questi sono i
// valori noti, con etichetta italiana via linkChannelLabel.
const LINK_CHANNEL_OPTIONS = [
  "sito_libro",
  "sito_autore",
  "vendita",
  "social_autore",
  "altro",
] as const;

// Regole d'uso offerte nel select "Uso nei post".
const LINK_USAGE_OPTIONS: LinkUsagePolicy[] = ["always", "sometimes", "manual"];

// Default sensato di regola d'uso a partire dal tipo di link.
function defaultUsageForChannel(channel: string): LinkUsagePolicy {
  switch (channel) {
    case "vendita":
      return "sometimes";
    case "sito_libro":
      return "always";
    case "sito_autore":
      return "sometimes";
    case "social_autore":
      return "manual";
    default:
      return "manual";
  }
}

function LinksCard({
  bookId,
  links,
  onChange,
}: {
  bookId: string;
  links: BookDetail["links"];
  onChange: () => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [channel, setChannel] = useState<string>("vendita");
  const [usagePolicy, setUsagePolicy] = useState<LinkUsagePolicy>(
    defaultUsageForChannel("vendita"),
  );
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingLink, setEditingLink] = useState<BookDetail["links"][number] | null>(null);

  // Cambiando il tipo, pre-imposta la policy col default (resta modificabile).
  function onChannelChange(next: string) {
    setChannel(next);
    setUsagePolicy(defaultUsageForChannel(next));
  }

  async function add() {
    if (!url.trim() || !channel.trim()) {
      toast.error(t("book.links.typeUrlRequired"));
      return;
    }
    setAdding(true);
    try {
      await addBookLink(bookId, {
        channel: channel.trim(),
        label: label.trim() || undefined,
        url: url.trim(),
        usagePolicy,
      });
      setChannel("vendita");
      setUsagePolicy(defaultUsageForChannel("vendita"));
      setLabel("");
      setUrl("");
      onChange();
      toast.success(t("book.links.added"));
    } catch (err) {
      toast.error(errorMessage(err) || t("common.operationFailed"));
    } finally {
      setAdding(false);
    }
  }

  async function remove(linkId: string) {
    try {
      await deleteBookLink(bookId, linkId);
      onChange();
      toast.success(t("book.links.removed"));
    } catch (err) {
      toast.error(errorMessage(err) || t("common.removeFailed"));
    }
  }

  return (
    <Card>
      <CardHeader title={t("book.links.title")} description={t("book.links.description")} />
      <CardBody className="flex flex-col gap-3">
        {links.length === 0 ? (
          <p className="text-sm text-content-tertiary">{t("book.links.empty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {links.map((l) => {
              const usage = linkUsageLabel(l.usagePolicy);
              return (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-inset px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <LinkIcon className="h-4 w-4 shrink-0 text-content-tertiary" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-content-primary">
                          {l.label || linkChannelLabel(l.channel)}
                        </span>
                        <Badge>{linkChannelLabel(l.channel)}</Badge>
                        {usage && <Badge tone="accent">{usage}</Badge>}
                        {l.isDefault && <Badge tone="accent">{t("book.links.default")}</Badge>}
                      </div>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-xs text-content-tertiary hover:text-accent"
                      >
                        {l.url}
                      </a>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingLink(l)}
                      aria-label={t("book.links.editAria")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(l.id)}
                      aria-label={t("book.links.removeAria")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("book.links.type")}>
            <select
              className={selectClass}
              value={channel}
              onChange={(e) => onChannelChange(e.target.value)}
            >
              {LINK_CHANNEL_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {linkChannelLabel(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("book.links.usage")}>
            <select
              className={selectClass}
              value={usagePolicy}
              onChange={(e) => setUsagePolicy(e.target.value as LinkUsagePolicy)}
            >
              {LINK_USAGE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {linkUsageLabel(p)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <Input placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button variant="secondary" loading={adding} onClick={add}>
            <Plus className="h-4 w-4" />
            {t("common.add")}
          </Button>
        </div>
        <Input
          placeholder={t("book.links.labelPlaceholder")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </CardBody>

      {editingLink && (
        <LinkEditorModal
          bookId={bookId}
          link={editingLink}
          onClose={() => setEditingLink(null)}
          onSaved={() => {
            setEditingLink(null);
            onChange();
          }}
        />
      )}
    </Card>
  );
}

function LinkEditorModal({
  bookId,
  link,
  onClose,
  onSaved,
}: {
  bookId: string;
  link: BookDetail["links"][number];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [channel, setChannel] = useState<string>(link.channel);
  const [label, setLabel] = useState(link.label ?? "");
  const [url, setUrl] = useState(link.url);
  const [usagePolicy, setUsagePolicy] = useState<LinkUsagePolicy>(
    (link.usagePolicy as LinkUsagePolicy | null) ?? defaultUsageForChannel(link.channel),
  );
  const [isDefault, setIsDefault] = useState<boolean>(link.isDefault ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmedUrl = url.trim();
    const trimmedChannel = channel.trim();
    if (!trimmedUrl || !trimmedChannel) {
      setError(t("book.links.typeUrlRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateBookLink(bookId, link.id, {
        channel: trimmedChannel,
        label: label.trim(),
        url: trimmedUrl,
        usagePolicy,
        isDefault,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err) || t("common.saveFailed"));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("book.links.editTitle")}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <ErrorBanner message={error} />}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("book.links.type")}>
            <select
              className={selectClass}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              {LINK_CHANNEL_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {linkChannelLabel(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("book.links.usage")}>
            <select
              className={selectClass}
              value={usagePolicy}
              onChange={(e) => setUsagePolicy(e.target.value as LinkUsagePolicy)}
            >
              {LINK_USAGE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {linkUsageLabel(p)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("book.links.labelField")}>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("book.links.labelPlaceholder")}
          />
        </Field>
        <Field label={t("book.links.urlField")}>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        </Field>
        <label className="flex items-center gap-2 text-sm text-content-secondary">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          {t("book.links.isDefault")}
        </label>
      </div>
    </Modal>
  );
}

// Banner riassuntivo della coda di rigenerazione immagini (stato GLOBALE): immagine in corso +
// quante in coda + cronometro live + "Annulla tutto". Mostrato in cima alla sezione Immagini
// quando una rigenerazione è attiva, così l'utente vede cosa sta succedendo e la coda anche
// fuori dal lightbox (prima l'informazione viveva solo dentro l'anteprima).
function RegenQueueBanner({
  regen,
  onCancelled,
}: {
  regen: MediaRegenStatusGlobal;
  onCancelled: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const startedAt = regen.current?.startedAt;
  let elapsed = "";
  if (startedAt) {
    const s = Math.max(0, Math.floor((now - startedAt) / 1000));
    elapsed = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  const queuedCount = regen.queued.length;

  async function cancelAll() {
    setCancelling(true);
    try {
      await cancelAllMediaRegen();
      onCancelled();
    } catch {
      toast.error(t("bookDetail.regenCancelAllFailed"));
      setCancelling(false);
    }
  }

  async function cancelOne(mediaId: number) {
    try {
      await cancelMediaRegen(String(mediaId));
      onCancelled();
    } catch {
      toast.error(t("bookDetail.cancelThisFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Spinner className="h-4 w-4 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium text-content-primary">
            {regen.current
              ? t("bookDetail.regenBannerCurrent", { id: regen.current.mediaId })
              : t("bookDetail.regenBannerPending")}
          </span>
          {queuedCount > 0 && (
            <span className="text-xs text-content-secondary">
              {t("bookDetail.regenBannerQueued", { n: queuedCount })}
            </span>
          )}
        </div>
        {elapsed && (
          <span className="shrink-0 text-xs tabular-nums text-content-tertiary">{elapsed}</span>
        )}
        <Button variant="ghost" size="sm" onClick={cancelAll} loading={cancelling}>
          <X className="h-4 w-4" />
          {t("bookDetail.regenCancelAll")}
        </Button>
      </div>
      {queuedCount > 0 && (
        <div className="flex flex-col gap-1">
          {regen.queued.map((mediaId) => (
            <div key={mediaId} className="flex items-center gap-2 text-xs text-content-secondary">
              <span className="font-medium">{t("bookDetail.queueWaiting")}</span>
              <span className="min-w-0 flex-1 truncate">#{mediaId}</span>
              <button
                type="button"
                onClick={() => void cancelOne(mediaId)}
                aria-label={t("bookDetail.cancelThis")}
                title={t("bookDetail.cancelThis")}
                className="shrink-0 rounded p-0.5 text-content-tertiary transition hover:bg-bg-card hover:text-content-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaCard({
  bookId,
  media,
  chapters,
  onChange,
}: {
  bookId: string;
  media: BookDetail["media"];
  chapters: BookDetail["chapters"];
  onChange: () => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const { sceneGenJobs } = useJobs();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Lightbox: immagine da mostrare a grandezza piena con i suoi metadati
  // di catalogazione (null = chiuso).
  const [lightbox, setLightbox] = useState<BookDetail["media"][number] | null>(null);

  // Griglia live: quando il contatore `created` della generazione di scena di QUESTO libro
  // aumenta, una nuova immagine è pronta → ricarica i media così compare subito senza F5.
  const sceneCreated = useMemo(() => {
    const job = sceneGenJobs.find((j) => j.bookId === bookId);
    return typeof job?.created === "number" ? job.created : 0;
  }, [sceneGenJobs, bookId]);
  const prevSceneCreatedRef = useRef(sceneCreated);
  useEffect(() => {
    if (sceneCreated > prevSceneCreatedRef.current) {
      onChange();
    }
    prevSceneCreatedRef.current = sceneCreated;
  }, [sceneCreated, onChange]);

  // Stato GLOBALE della coda di rigenerazione: alimenta i badge per-immagine sulla
  // griglia (in corso / in coda) e il cronometro del lightbox. Un solo poller qui.
  const [regen, setRegen] = useState<MediaRegenStatusGlobal | null>(null);
  // Set degli id (string) attualmente in rigenerazione o in coda, per i badge.
  const regenCurrentId = regen?.current ? String(regen.current.mediaId) : null;
  const regenQueuedIds = useMemo(
    () => new Set((regen?.queued ?? []).map((n) => String(n))),
    [regen],
  );
  // Rileva la transizione "questa immagine ha finito" per ricaricare i dati.
  const activeIdsRef = useRef<Set<string>>(new Set());

  // --- Selezione multipla per la rigenerazione in blocco (D5) ---
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchChanges, setBatchChanges] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);

  // Filtro per FORMATO (aspetto) della libreria immagini, con conteggio per categoria: 9:16
  // verticale (reel/storie), 1:1·4:5 quadrata (post/card), orizzontale. L'aspetto si classifica al
  // caricamento di ogni <img> (naturalWidth/Height): nessun dato extra dal server.
  type AspectCat = "vertical" | "square" | "landscape";
  const [aspectOf, setAspectOf] = useState<Record<string, AspectCat>>({});
  const [formatTab, setFormatTab] = useState<"all" | AspectCat>("all");
  const formatCounts = useMemo(() => {
    const c = { vertical: 0, square: 0, landscape: 0, unknown: 0 };
    for (const m of media) {
      const a = aspectOf[m.id];
      if (a) c[a] += 1;
      else c.unknown += 1;
    }
    return c;
  }, [media, aspectOf]);

  // Cast del libro: caricato una volta qui e passato al lightbox per la multi-selezione
  // personaggi della «Rigenera dal capitolo» (filtrata al capitolo dell'immagine). Caricamento
  // soft: in caso di errore resta vuoto e il lightbox non mostra il selettore personaggi.
  const [cast, setCast] = useState<BookCharacter[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    getCharacters(bookId, ctrl.signal)
      .then((list) => setCast(list))
      .catch(() => {
        /* soft: nessun cast disponibile */
      });
    return () => ctrl.abort();
  }, [bookId]);

  // Poll globale finché c'è qualcosa in corso/in coda; rallenta (ma non si ferma)
  // quando è idle così intercetta nuove rigenerazioni avviate dal lightbox.
  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    const tick = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const s = await getMediaRegenStatusGlobal(controller.signal);
        if (!active) return;
        // id attivi ora (in corso + in coda).
        const nextActive = new Set<string>([
          ...(s.current ? [String(s.current.mediaId)] : []),
          ...s.queued.map((n) => String(n)),
        ]);
        // Se un'immagine era attiva e ora non lo è più, è finita → ricarica i dati.
        let finished = false;
        for (const id of activeIdsRef.current) {
          if (!nextActive.has(id)) finished = true;
        }
        activeIdsRef.current = nextActive;
        setRegen(s);
        if (finished) onChange();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Errore transitorio: riprova al prossimo giro.
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(id);
    };
  }, [onChange]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
    setBatchChanges("");
  }

  // Accoda la rigenerazione delle immagini selezionate (solo quelle AI rigenerabili).
  async function regenerateSelected() {
    const ids = Array.from(selected).map((x) => Number(x));
    if (ids.length === 0) return;
    setBatchBusy(true);
    try {
      const { queued } = await regenerateMediaBatch({
        mediaIds: ids,
        ...(batchChanges.trim() ? { changes: batchChanges.trim() } : {}),
      });
      toast.success(t("book.media.batchQueued", { count: queued }));
      exitSelectMode();
    } catch (err) {
      toast.error(errorMessage(err) || t("book.media.queueFailed"));
    } finally {
      setBatchBusy(false);
    }
  }

  async function uploadMany(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    let ok = 0;
    let failed = 0;
    // Sequenziale: mostra l'avanzamento e non sovraccarica il backend.
    for (const file of files) {
      try {
        await uploadBookMedia(bookId, file, { scope: "GENERAL" });
        ok++;
      } catch {
        failed++;
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    onChange();
    setUploading(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    if (failed === 0) toast.success(t("book.media.uploaded", { count: ok }));
    else if (ok === 0) toast.error(t("book.media.noneUploaded"));
    else toast.success(t("book.media.uploadPartial", { ok, failed }));
  }

  async function remove(mediaId: string) {
    try {
      await deleteBookMedia(bookId, mediaId);
      onChange();
      toast.success(t("book.media.removed"));
    } catch (err) {
      toast.error(errorMessage(err) || t("common.removeFailed"));
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("book.media.title")}
        description={t("book.media.description")}
        action={
          <div className="flex items-center gap-2">
            {media.length > 0 &&
              (selectMode ? (
                <Button variant="ghost" size="sm" onClick={exitSelectMode}>
                  <X className="h-4 w-4" />
                  {t("book.media.cancelSelection")}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)}>
                  <Check className="h-4 w-4" />
                  {t("book.media.select")}
                </Button>
              ))}
            <Button
              variant="secondary"
              size="sm"
              loading={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
              {progress
                ? t("book.media.uploading", { done: progress.done, total: progress.total })
                : t("book.media.uploadImages")}
            </Button>
          </div>
        }
      />
      <CardBody className="flex flex-col gap-5">
        <SceneGenSection bookId={bookId} chapters={chapters} onGenerated={onChange} />
        {regen && (regen.current || regen.queued.length > 0) && (
          <RegenQueueBanner regen={regen} onCancelled={onChange} />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => uploadMany(e.target.files)}
        />
        {selectMode && (
          <div className="flex flex-col gap-2 rounded-lg border border-accent/20 bg-accent-soft/40 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-content-secondary">
              <span>{t("book.media.selectedCount", { count: selected.size })}</span>
              <Button
                variant="primary"
                size="sm"
                loading={batchBusy}
                disabled={batchBusy || selected.size === 0}
                onClick={regenerateSelected}
              >
                <Wand2 className="h-4 w-4" />
                {t("book.media.regenerateSelected")}
              </Button>
            </div>
            <Field label={t("book.media.batchChangesLabel")}>
              <Textarea
                value={batchChanges}
                onChange={(e) => setBatchChanges(e.target.value)}
                rows={2}
                disabled={batchBusy}
                placeholder={t("book.media.batchChangesPlaceholder")}
              />
            </Field>
          </div>
        )}
        {media.length === 0 ? (
          <p className="text-sm text-content-tertiary">{t("book.media.empty")}</p>
        ) : (
          <>
            {/* Filtro per FORMATO con conteggio: aiuta a vedere a colpo d'occhio quante immagini
                ci sono per ogni aspetto (le 9:16 servono ai reel/storie, le quadrate ai post). */}
            <div
              role="tablist"
              aria-label={t("bookDetail.formatFilterAria")}
              className="flex flex-wrap gap-2"
            >
              {[
                { id: "all" as const, label: t("bookDetail.formatAll"), n: media.length },
                {
                  id: "vertical" as const,
                  label: t("bookDetail.formatVertical"),
                  n: formatCounts.vertical,
                },
                {
                  id: "square" as const,
                  label: t("bookDetail.formatSquare"),
                  n: formatCounts.square,
                },
                {
                  id: "landscape" as const,
                  label: t("bookDetail.formatLandscape"),
                  n: formatCounts.landscape,
                },
              ].map((tab) => {
                const active = formatTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFormatTab(tab.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium",
                      "transition-colors duration-150 ease-out-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
                      active
                        ? "border-accent bg-accent-soft text-content-primary"
                        : "border-border-subtle text-content-tertiary hover:text-content-primary",
                    )}
                  >
                    {tab.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-xs tabular-nums",
                        active
                          ? "bg-accent/20 text-content-secondary"
                          : "bg-bg-inset text-content-tertiary",
                      )}
                    >
                      {tab.n}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {media.map((m) => {
                const isCurrent = regenCurrentId === m.id;
                const isQueued = regenQueuedIds.has(m.id);
                const isSelected = selected.has(m.id);
                // L'URL dal server include già `?v=${addedAt}` (serialize.ts) e updateAfterRegen
                // aggiorna addedAt: dopo il reload il browser ricarica da sé il file rigenerato.
                const imgSrc = m.url ?? null;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "group relative overflow-hidden rounded-lg border bg-bg-inset",
                      isSelected ? "border-accent ring-2 ring-accent/40" : "border-border-subtle",
                      // Filtro per formato: nascondi i tile che non combaciano (il loro <img> resta
                      // comunque caricato così il conteggio per categoria si popola lo stesso).
                      formatTab !== "all" && aspectOf[m.id] !== formatTab && "hidden",
                    )}
                  >
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={m.caption ?? m.filename ?? t("book.media.imageAlt")}
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          if (!img.naturalWidth || !img.naturalHeight) return;
                          const r = img.naturalWidth / img.naturalHeight;
                          const cat: AspectCat =
                            r < 0.7 ? "vertical" : r > 1.25 ? "landscape" : "square";
                          setAspectOf((prev) =>
                            prev[m.id] === cat ? prev : { ...prev, [m.id]: cat },
                          );
                        }}
                        onClick={() => (selectMode ? toggleSelected(m.id) : setLightbox(m))}
                        className={cn(
                          "aspect-square w-full object-cover",
                          selectMode ? "cursor-pointer" : "cursor-zoom-in",
                          (isCurrent || isQueued) && "opacity-70",
                        )}
                      />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center text-content-faint">
                        <ImagePlus className="h-6 w-6" />
                      </div>
                    )}
                    {selectMode && (
                      <label className="absolute left-1.5 top-1.5 flex cursor-pointer items-center rounded-md bg-black/60 p-1 backdrop-blur">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelected(m.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>
                    )}
                    {!selectMode && m.chapterIdx != null && (
                      <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-white backdrop-blur">
                        {t("book.media.chapterBadge", { index: m.chapterIdx })}
                      </span>
                    )}
                    {(isCurrent || isQueued) && (
                      <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-2xs font-medium text-white backdrop-blur">
                        {isCurrent ? (
                          <>
                            <Spinner className="h-3 w-3" />
                            {t("book.media.regenerating")}
                          </>
                        ) : (
                          t("book.media.queued")
                        )}
                      </span>
                    )}
                    {/* Badge QA: visibile solo se il check è stato eseguito */}
                    {m.qa != null &&
                      !isCurrent &&
                      !isQueued &&
                      (m.qa.ok ? (
                        <span
                          title={t("book.media.qaOkTitle")}
                          className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-emerald-400 backdrop-blur"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {t("book.media.qaOk")}
                        </span>
                      ) : (
                        <span
                          title={m.qa.issues.join("\n")}
                          className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-2xs font-medium text-white backdrop-blur"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {t("book.media.qaIssues", { count: m.qa.issues.length })}
                        </span>
                      ))}
                    {!selectMode && (
                      <button
                        type="button"
                        onClick={() => remove(m.id)}
                        className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1.5 text-white opacity-0 backdrop-blur transition-[opacity,transform] duration-150 ease-out-strong hover:bg-danger/80 group-hover:opacity-100 active:scale-90"
                        aria-label={t("book.media.removeAria")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {m.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 px-2 pt-1.5">
                        {m.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag}>{tag}</Badge>
                        ))}
                      </div>
                    )}
                    {m.caption && (
                      <div className="truncate px-2 py-1 text-2xs text-content-tertiary">
                        {m.caption}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardBody>

      {/* Lightbox: immagine piena + metadati di catalogazione + rigenerazione. */}
      {lightbox && (
        <MediaLightbox
          media={lightbox}
          chapters={chapters}
          cast={cast}
          regen={regen}
          onClose={() => setLightbox(null)}
          onChange={onChange}
        />
      )}
    </Card>
  );
}

/**
 * Lightbox dell'immagine: mostra l'immagine a grandezza piena, un pannello con i
 * metadati di catalogazione (capitolo, tag, prompt) e — per le immagini generate
 * dall'AI (genPrompt presente) — i controlli di rigenerazione con prompt editabile.
 */
function MediaLightbox({
  media,
  chapters,
  cast,
  regen,
  onClose,
  onChange,
}: {
  media: BookDetail["media"][number];
  chapters: BookDetail["chapters"];
  // Cast del libro (passato dalla griglia che conosce il bookId): serve alla multi-selezione
  // personaggi della «Rigenera dal capitolo», filtrata ai soli personaggi del capitolo.
  cast: BookCharacter[];
  // Stato globale della coda di rigenerazione (alimenta cronometro + aggiornamento in-place).
  regen: MediaRegenStatusGlobal | null;
  onClose: () => void;
  onChange: () => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const isAi = media.genPrompt !== null;
  const [prompt, setPrompt] = useState(media.genPrompt ?? "");
  const [verify, setVerify] = useState(false);
  // Modifiche in ITALIANO: l'utente scrive cosa cambiare e l'IA rivede il prompt.
  // Persistite per immagine in localStorage (D4): restano scritte dopo aver lanciato la
  // rigenerazione, così l'utente può rifinirle; si puliscono solo su azione esplicita.
  const changesKey = `mediaRegen_${media.id}_changes`;
  const [changes, setChanges] = useState(() => {
    try {
      return localStorage.getItem(changesKey) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      if (changes) localStorage.setItem(changesKey, changes);
      else localStorage.removeItem(changesKey);
    } catch {
      // localStorage non disponibile: ignora.
    }
  }, [changes, changesKey]);

  // Cache-busting per l'aggiornamento in-place (D3): cambia quando questa immagine finisce.
  const [imgVersion, setImgVersion] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lo stato "in rigenerazione" deriva ora dalla coda GLOBALE (in corso o in coda), non
  // da un poll per-immagine: così è coerente con la griglia e sopravvive alla riapertura.
  const mediaIdNum = Number(media.id);
  const isCurrent = regen?.current?.mediaId === mediaIdNum;
  const isQueued = (regen?.queued ?? []).includes(mediaIdNum);
  const regenerating = isCurrent || isQueued;

  // Cronometro a TEMPO REALE dell'immagine in corso (D1), allineato a current.startedAt.
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const mmss = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const recompute = () =>
    setElapsed(
      startedAtRef.current > 0
        ? Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
        : 0,
    );

  // Rileva la transizione "questa immagine era attiva e ora ha finito" per ricaricare
  // i dati e aggiornare l'immagine IN-PLACE senza chiudere il lightbox (D3).
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (regenerating) {
      wasActiveRef.current = true;
      return;
    }
    if (wasActiveRef.current) {
      wasActiveRef.current = false;
      setImgVersion((v) => v + 1); // forza il reload dell'immagine (stesso id, nuovo file)
      toast.success(t("book.lightbox.regenImageDone"));
      setCancelling(false);
      onChange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenerating]);

  // Avvia/ferma il tick del cronometro in base allo stato corrente.
  useEffect(() => {
    if (isCurrent && regen?.current) {
      startedAtRef.current = regen.current.startedAt;
      recompute();
      if (tickRef.current === null) tickRef.current = window.setInterval(recompute, 1000);
    } else {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      startedAtRef.current = 0;
      setElapsed(0);
    }
    return () => {
      if (tickRef.current !== null && !isCurrent) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrent, regen?.current?.startedAt]);

  // Cleanup del tick allo smontaggio.
  useEffect(() => {
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
    };
  }, []);

  // Catalogazione editabile (tag + capitolo): più info per la selezione per pertinenza.
  const [tags, setTags] = useState<string[]>(media.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [chapterIdx, setChapterIdx] = useState<number | null>(media.chapterIdx);
  const [savingCatalog, setSavingCatalog] = useState(false);
  const catalogDirty =
    JSON.stringify(tags) !== JSON.stringify(media.tags) || chapterIdx !== media.chapterIdx;

  // Personaggi del capitolo dell'immagine (multi-selezione per «Rigenera dal capitolo»):
  // SOLO i personaggi che compaiono nel capitolo di riferimento (chapters.includes(chapterIdx)).
  const chapterCast = useMemo(
    () =>
      media.chapterIdx == null
        ? []
        : cast.filter((c) => c.chapters.includes(media.chapterIdx as number)),
    [cast, media.chapterIdx],
  );
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  // FLASHBACK/ricordo per la «Rigenera dal capitolo»: se attivo, rigenera QUESTA immagine come scena
  // del passato (personaggi più giovani, vestiti d'epoca), scavalcando età e outfit canonici.
  const [fbOn, setFbOn] = useState(false);
  const [fbYears, setFbYears] = useState(20);
  const [fbSetting, setFbSetting] = useState("");

  function addTag() {
    const t = tagDraft.trim();
    if (!t) return;
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags((prev) => [...prev, t]);
    setTagDraft("");
  }

  async function saveCatalog() {
    setSavingCatalog(true);
    try {
      await updateMediaCatalog(media.id, { tags, chapterIdx });
      toast.success(t("book.lightbox.catalogSaved"));
      onChange();
    } catch (err) {
      toast.error(errorMessage(err) || t("common.saveFailed"));
    } finally {
      setSavingCatalog(false);
    }
  }

  // La rigenerazione gira in background sulla coda del server (stato via prop `regen`):
  // nessun poll per-immagine qui. Lo stato `regenerating` e il cronometro sono derivati.
  async function regenerate() {
    setError(null);
    // Passa il prompt SOLO se cambiato rispetto all'originale salvato.
    const original = media.genPrompt ?? "";
    const edited = prompt.trim();
    const promptArg = edited !== original.trim() ? edited : undefined;
    const changesArg = changes.trim() !== "" ? changes.trim() : undefined;
    try {
      await regenerateMediaImage(media.id, {
        prompt: promptArg,
        changes: changesArg,
        ...(verify ? { verify: true } : {}),
      });
      wasActiveRef.current = true; // segna come attiva: la prop `regen` confermerà al prossimo poll
      toast.info(t("book.lightbox.regenStarted"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("book.lightbox.alreadyRegenerating"));
      } else if (err instanceof ApiError && err.status === 503) {
        setError(t("book.lightbox.engineUnavailable"));
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t("book.lightbox.noPromptAvailable"));
      } else {
        setError(errorMessage(err) || t("book.lightbox.regenStartFailed"));
      }
    }
  }

  // Rigenera RICOSTRUENDO il prompt dal testo del capitolo con la pipeline attuale: applica le
  // regole aggiunte dopo la generazione originale (fisica/realismo, postura windsurf, ecc.), che un
  // semplice "Rigenera" (riuso del prompt salvato) non vedrebbe mai. Disponibile solo se c'è un
  // capitolo di riferimento (chapterIdx != null).
  async function regenerateFromChapter() {
    setError(null);
    try {
      const fbSettingTrim = fbSetting.trim();
      await regenerateMediaImage(media.id, {
        rebuild: true,
        ...(selectedCharacters.length ? { characters: selectedCharacters } : {}),
        ...(fbOn
          ? {
              flashback: {
                ...(fbYears > 0 ? { youngerYears: fbYears } : {}),
                ...(fbSettingTrim ? { setting: fbSettingTrim } : {}),
              },
            }
          : {}),
        ...(verify ? { verify: true } : {}),
      });
      wasActiveRef.current = true;
      toast.info(
        fbOn ? t("book.lightbox.regenMemoryStarted") : t("book.lightbox.regenFromChapterStarted"),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("book.lightbox.alreadyRegenerating"));
      } else if (err instanceof ApiError && err.status === 503) {
        setError(t("book.lightbox.engineUnavailable"));
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t("book.lightbox.noPromptAvailable"));
      } else {
        setError(errorMessage(err) || t("book.lightbox.regenStartFailed"));
      }
    }
  }

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      await cancelMediaRegen(media.id);
      toast.info(t("book.lightbox.cancelling"));
    } catch (err) {
      setCancelling(false);
      setError(errorMessage(err) || t("book.lightbox.cancelFailed"));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col gap-4 overflow-y-auto md:flex-row md:items-start">
        {media.url && (
          <img
            // imgVersion cambia a fine rigenerazione → cache-busting per l'aggiornamento in-place.
            src={`${media.url}${media.url.includes("?") ? "&" : "?"}t=${imgVersion}`}
            alt={media.caption ?? media.filename ?? t("book.media.imageAlt")}
            className="max-h-[60vh] w-full rounded-lg object-contain shadow-card md:max-h-[92vh] md:flex-1"
          />
        )}
        <div className="flex w-full flex-col gap-4 rounded-lg bg-bg-card p-4 md:max-w-sm">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-2xs font-semibold uppercase tracking-wide text-content-faint">
                {t("book.lightbox.catalog")}
              </h4>
              {catalogDirty && (
                <Button variant="primary" size="sm" loading={savingCatalog} onClick={saveCatalog}>
                  {t("common.save")}
                </Button>
              )}
            </div>

            <div>
              <label className="mb-1 block text-2xs font-medium text-content-tertiary">
                {t("book.lightbox.chapter")}
              </label>
              <select
                className={selectClass}
                value={chapterIdx ?? ""}
                onChange={(e) =>
                  setChapterIdx(e.target.value === "" ? null : Number(e.target.value))
                }
              >
                <option value="">{t("book.lightbox.chapterNone")}</option>
                {chapters
                  .filter((ch) => ch.index != null)
                  .map((ch) => (
                    <option key={ch.id} value={ch.index}>
                      {ch.index}. {ch.title?.trim() || t("book.lightbox.untitled")}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-2xs font-medium text-content-tertiary">
                {t("book.lightbox.tags")}
              </label>
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {tags.length === 0 && (
                  <span className="text-xs text-content-tertiary">{t("book.lightbox.noTags")}</span>
                )}
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg-inset px-2 py-0.5 text-xs text-content-secondary"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((x) => x !== tag))}
                      className="rounded transition-transform hover:text-content-primary active:scale-90"
                      aria-label={t("book.lightbox.removeTagAria", { tag })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder={t("book.lightbox.addTagPlaceholder")}
                />
                <Button variant="secondary" size="sm" onClick={addTag} disabled={!tagDraft.trim()}>
                  {t("common.add")}
                </Button>
              </div>
            </div>
          </div>

          {media.genPrompt && (
            <div>
              <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-content-faint">
                {t("book.lightbox.prompt")}
              </h4>
              <p className="max-h-40 select-text overflow-y-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-bg-inset px-3 py-2 text-xs leading-relaxed text-content-secondary">
                {media.genPrompt}
              </p>
            </div>
          )}

          {/* Esito del controllo qualità */}
          {media.qa != null && (
            <div
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border px-3 py-2.5",
                media.qa.ok
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-amber-500/30 bg-amber-500/10",
              )}
            >
              <div className="flex items-center gap-1.5">
                {media.qa.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                )}
                <span
                  className={cn(
                    "text-2xs font-semibold uppercase tracking-wide",
                    media.qa.ok ? "text-emerald-600" : "text-amber-600",
                  )}
                >
                  {media.qa.ok ? t("book.lightbox.qaOk") : t("book.lightbox.qaProblems")}
                </span>
              </div>
              {!media.qa.ok && media.qa.issues.length > 0 && (
                <ul className="flex flex-col gap-0.5 pl-1">
                  {media.qa.issues.map((issue, i) => (
                    <li key={i} className="text-xs leading-snug text-amber-700">
                      • {issue}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isAi && (
            <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
              <h4 className="text-2xs font-semibold uppercase tracking-wide text-content-faint">
                {t("book.lightbox.regenerateImage")}
              </h4>
              {error && <ErrorBanner message={error} />}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-2xs font-medium text-content-tertiary">
                    {t("book.lightbox.changesLabel")}
                  </label>
                  {changes && (
                    <button
                      type="button"
                      onClick={() => setChanges("")}
                      className="text-2xs text-content-faint transition-colors hover:text-content-secondary"
                    >
                      {t("book.lightbox.clear")}
                    </button>
                  )}
                </div>
                <Textarea
                  value={changes}
                  onChange={(e) => setChanges(e.target.value)}
                  rows={3}
                  placeholder={t("book.lightbox.changesPlaceholder")}
                />
              </div>
              <details>
                <summary className="cursor-pointer text-2xs font-semibold uppercase tracking-wide text-content-faint hover:text-content-secondary">
                  {t("book.lightbox.fullPrompt")}
                </summary>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  disabled={regenerating}
                  placeholder={t("book.lightbox.fullPromptPlaceholder")}
                  className="mt-2"
                />
              </details>
              {regenerating ? (
                <div className="flex flex-wrap items-center gap-2.5 text-sm text-content-secondary">
                  <Spinner className="h-4 w-4" />
                  {isCurrent ? (
                    <span className="tabular-nums">
                      {t("book.lightbox.regeneratingElapsed", { time: mmss(elapsed) })}
                    </span>
                  ) : (
                    <span>{t("book.lightbox.queuedShort")}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={cancelling}
                    disabled={cancelling}
                    onClick={cancel}
                  >
                    {!cancelling && <X className="h-4 w-4" />}
                    {t("common.cancel")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Verifica qualità e ritenta */}
                  <label className="flex cursor-pointer items-start gap-2 text-xs text-content-secondary">
                    <input
                      type="checkbox"
                      checked={verify}
                      onChange={(e) => setVerify(e.target.checked)}
                      className="mt-0.5 shrink-0"
                    />
                    <span>
                      <span className="font-medium text-content-primary">
                        {t("book.lightbox.verifyLabel")}
                      </span>
                      <span className="mt-0.5 block text-content-faint">
                        {t("book.lightbox.verifyNote")}
                      </span>
                    </span>
                  </label>
                  <Button variant="primary" size="sm" onClick={regenerate}>
                    <Wand2 className="h-4 w-4" />
                    {t("common.regenerate")}
                  </Button>
                  {/* Solo con un capitolo di riferimento: senza, non c'è testo da cui ricostruire. */}
                  {media.chapterIdx != null && (
                    <div className="flex flex-col gap-1">
                      {/* Multi-selezione personaggi FILTRATA ai soli personaggi del capitolo
                          dell'immagine: mostrata solo se ce n'è almeno uno. Vuoto = nessuno. */}
                      {chapterCast.length > 0 && (
                        <div className="mb-1">
                          <label className="mb-1 block text-2xs font-medium text-content-tertiary">
                            {selectedCharacters.length === 0
                              ? t("book.lightbox.chapterCharactersOptional")
                              : t("book.lightbox.charactersSelected", {
                                  count: selectedCharacters.length,
                                })}
                          </label>
                          <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border border-border-subtle bg-bg-inset p-2">
                            {chapterCast.map((c) => {
                              const on = selectedCharacters.includes(c.name);
                              return (
                                <label
                                  key={c.id}
                                  className="flex cursor-pointer items-center gap-2 text-xs text-content-secondary"
                                >
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() =>
                                      setSelectedCharacters((prev) =>
                                        on ? prev.filter((x) => x !== c.name) : [...prev, c.name],
                                      )
                                    }
                                  />
                                  <span className="truncate">
                                    {c.name} (
                                    {c.chapters.length
                                      ? t("book.lightbox.charChapters", {
                                          chapters: c.chapters.join(", "),
                                        })
                                      : t("book.lightbox.charNoChapter")}
                                    )
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {/* FLASHBACK/ricordo: rigenera QUESTA immagine come scena del passato
                          (personaggi più giovani, vestiti d'epoca), scavalcando età e outfit canonici. */}
                      <div className="mb-1 rounded-md border border-border-subtle bg-bg-inset p-2">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-content-secondary">
                          <input
                            type="checkbox"
                            checked={fbOn}
                            onChange={(e) => setFbOn(e.target.checked)}
                          />
                          <span className="font-medium">{t("book.lightbox.flashbackToggle")}</span>
                        </label>
                        {fbOn && (
                          <div className="mt-2 flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-2xs text-content-tertiary">
                              <span className="w-28 shrink-0">
                                {t("book.lightbox.youngerYears")}
                              </span>
                              <Input
                                type="number"
                                min={1}
                                max={120}
                                value={fbYears}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (Number.isFinite(n))
                                    setFbYears(Math.min(120, Math.max(1, Math.round(n))));
                                }}
                              />
                            </label>
                            <Input
                              type="text"
                              value={fbSetting}
                              placeholder={t("book.lightbox.flashbackSettingPlaceholder")}
                              onChange={(e) => setFbSetting(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={regenerateFromChapter}
                        title={t("book.lightbox.regenerateFromChapterTitle")}
                      >
                        <Wand2 className="h-4 w-4" />
                        {fbOn
                          ? t("book.lightbox.regenerateAsMemory")
                          : t("book.lightbox.regenerateFromChapter")}
                      </Button>
                      <p className="text-2xs leading-snug text-content-faint">
                        {t("book.lightbox.regenerateFromChapterHint")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="absolute right-4 top-4 rounded-md bg-black/60 p-2 text-white backdrop-blur transition-colors hover:bg-black/80"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

// Formati disponibili per le immagini di scena generate dall'AI.
const SCENE_ASPECT_OPTIONS: SceneAspect[] = ["1:1", "4:5", "9:16", "1.91:1"];

/**
 * Sezione "Genera immagini scena (AI)" dentro la card Immagini. Mostra i controlli
 * solo se il motore locale è disponibile; avvia la generazione asincrona e fa
 * polling dello stato N/M fino a ready/failed, poi ricarica la lista immagini.
 */
/**
 * Hook condiviso per la "Bibbia visiva": fa GET dello stato all'avvio e — se un build è in corso —
 * avvia un polling leggero (3s) che sopravvive ai cambi pagina (al rientro il primo poll riallinea).
 * Espone `running` per disabilitare i pulsanti durante un build, `start()` per avviare un build
 * (eventualmente solo certi step) e `status` per il pannello. `onDone` (opzionale) viene chiamato
 * quando il build passa a done/failed, così chi usa il hook può ricaricare i propri dati.
 */
function useVisualBibleStatus(bookId: string, onDone?: (s: VisualBibleStatus) => void) {
  const [status, setStatus] = useState<VisualBibleStatus | null>(null);
  const pollRef = useRef<number | null>(null);
  // True dopo aver osservato uno stato 'running': serve a far scattare onDone SOLO sulla
  // transizione running → done/failed e non quando si apre la pagina su un build già concluso
  // (il polling ora è continuo e potrebbe leggere subito uno stato terminale).
  const sawRunningRef = useRef(false);
  // onDone tenuto in un ref così il polling usa sempre l'ultima versione senza riavviarsi.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  function stopPolling() {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function beginPolling() {
    if (pollRef.current !== null) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const s = await getVisualBibleStatus(bookId);
        setStatus(s);
        if (s.status === "running") {
          sawRunningRef.current = true;
          return;
        }
        if (s.status === "done" || s.status === "failed") {
          stopPolling();
          // Notifica solo se è una transizione reale da 'running', non un build già concluso.
          if (sawRunningRef.current) {
            sawRunningRef.current = false;
            onDoneRef.current?.(s);
          }
        }
      } catch {
        // Errore transitorio di polling: ignora, ritenta al prossimo tick.
      }
    }, 3000);
  }

  // Aggancio iniziale + polling continuo mentre il pannello è montato: anche se il build
  // parte DOPO l'apertura della pagina, gli step avanzano live senza F5. Il tick si ferma
  // da solo quando lo stato diventa done/failed (vedi beginPolling); finché lo stato non è
  // terminale, continua a interrogare il server ogni 3s.
  useEffect(() => {
    let active = true;
    const ctrl = new AbortController();
    getVisualBibleStatus(bookId, ctrl.signal)
      .then((s) => {
        if (!active) return;
        setStatus(s);
        if (s.status === "running") sawRunningRef.current = true;
        // Avvia sempre il polling: se lo stato è già terminale, il primo tick lo fermerà.
        if (s.status !== "done" && s.status !== "failed") beginPolling();
      })
      .catch(() => {
        // Nessuno stato disponibile al mount: avvia comunque il polling così, se un build
        // parte più tardi, viene rilevato senza dover ricaricare la pagina.
        if (active) beginPolling();
      });
    return () => {
      active = false;
      ctrl.abort();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // Avvia un build (tutto, oppure solo certi step) e attacca subito il polling.
  async function start(steps?: VBStepKey[]) {
    await buildVisualBible(bookId, steps);
    // Build avviato manualmente da qui: marca subito "running" così la conclusione fa scattare onDone.
    sawRunningRef.current = true;
    // Feedback ottimistico: il primo poll riallinea ai dati reali del server.
    setStatus((prev) =>
      prev
        ? { ...prev, status: "running", error: null }
        : {
            bookId: Number(bookId),
            status: "running",
            steps: [],
            startedAt: Date.now(),
            updatedAt: Date.now(),
            error: null,
          },
    );
    beginPolling();
  }

  return {
    status,
    running: status?.status === "running",
    start,
  };
}

/**
 * Pannello di avanzamento della "Bibbia visiva". Presentazionale: riceve lo `status` (lo stato è
 * sollevato in BookDetailScreen e il trigger vive nell'header). Compare SOLO quando c'è progresso
 * reale — build in corso o esito recente con step — così sotto le tab non resta un banner fisso.
 */
function VisualBiblePanel({ status }: { status: VisualBibleStatus | null }) {
  const { t } = useTranslation();
  const hasSteps = status != null && status.status !== "idle" && status.steps.length > 0;
  const isFailed = status?.status === "failed" && !!status.error;
  if (!hasSteps && !isFailed) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-accent/20 bg-accent-soft/40 p-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h4 className="text-sm font-semibold text-content-primary">
          {t("book.visualBible.buildPanelTitle")}
        </h4>
      </div>

      {hasSteps && (
        <ul className="flex flex-col gap-1.5">
          {status!.steps.map((step) => {
            const isRunning = step.status === "running";
            return (
              <li
                key={step.key}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  isRunning ? "bg-accent-soft text-content-primary" : "text-content-secondary",
                )}
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {step.status === "done" ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : step.status === "running" ? (
                    <Spinner className="h-4 w-4" />
                  ) : step.status === "failed" ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-content-faint" />
                  )}
                </span>
                <span className="flex-1 truncate">{t("visualBible.step." + step.key)}</span>
                {step.total > 1 && (
                  <span className="text-xs tabular-nums text-content-tertiary">
                    {step.done}/{step.total}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {status?.status === "failed" && status.error && <ErrorBanner message={status.error} />}
    </div>
  );
}

function SceneGenSection({
  bookId,
  chapters,
  onGenerated,
}: {
  bookId: string;
  chapters: BookDetail["chapters"];
  onGenerated: () => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  // null = ancora da verificare; il resto è la disponibilità del motore.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [count, setCount] = useState(4);
  const [aspect, setAspect] = useState<SceneAspect>("1:1");
  // Capitoli scelti (multiselect): vuoto = AUTO (capitoli vari). Se scelti, `count` immagini PER
  // ciascun capitolo selezionato.
  const [selectedChapters, setSelectedChapters] = useState<number[]>([]);
  // Personaggi (opzionale, multi-selezione): se valorizzato, il batch genera immagini che FEATURANO
  // quei personaggi sui capitoli dove compaiono. Vuoto = comportamento invariato (nessuno specifico).
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [cast, setCast] = useState<BookCharacter[]>([]);
  // FLASHBACK/ricordo (opzionale): scena del passato → personaggi più giovani e vestiti per l'epoca,
  // scavalcando età e outfit canonici per le immagini di QUESTO batch. Off = comportamento normale.
  const [flashbackOn, setFlashbackOn] = useState(false);
  const [flashbackYears, setFlashbackYears] = useState(20);
  const [flashbackSetting, setFlashbackSetting] = useState("");
  const [recomputing, setRecomputing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Avanzamento COMPLESSIVO (tutti i batch) + batch corrente + coda in attesa.
  const [progress, setProgress] = useState<{ created: number; planned: number } | null>(null);
  const [current, setCurrent] = useState<SceneGenStatus["current"]>(null);
  const [queued, setQueued] = useState<SceneBatch[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  // Cronometri a TEMPO REALE: calcolati da timestamp del SERVER (startedAt = inizio lotto;
  // imageStartedAt = inizio immagine in corso, azzerato a ogni immagine). Derivando dallo stato
  // del server, sopravvivono ai cambi pagina (al rientro il primo poll riallinea i timestamp).
  const [elapsedTotal, setElapsedTotal] = useState(0);
  const [elapsedImg, setElapsedImg] = useState(0);
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef(0); // epoch ms, inizio lotto
  const imgStartedAtRef = useRef(0); // epoch ms, inizio immagine in corso
  const mmss = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  function recompute() {
    const now = Date.now();
    setElapsedTotal(
      startedAtRef.current > 0 ? Math.max(0, Math.floor((now - startedAtRef.current) / 1000)) : 0,
    );
    setElapsedImg(
      imgStartedAtRef.current > 0
        ? Math.max(0, Math.floor((now - imgStartedAtRef.current) / 1000))
        : 0,
    );
  }
  function stopTimers() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }
  // Allinea i timestamp dallo stato del server e (ri)avvia il tick che ricalcola ogni secondo.
  function syncTimers(s: { startedAt?: number; imageStartedAt?: number }) {
    if (s.startedAt && s.startedAt > 0) startedAtRef.current = s.startedAt;
    if (s.imageStartedAt && s.imageStartedAt > 0) imgStartedAtRef.current = s.imageStartedAt;
    recompute();
    if (tickRef.current === null) tickRef.current = window.setInterval(recompute, 1000);
  }

  // Verifica una volta sola la disponibilità del motore all'apertura.
  useEffect(() => {
    const ctrl = new AbortController();
    imageGenAvailable(ctrl.signal)
      .then((r) => setAvailable(r.available))
      .catch(() => {
        if (!ctrl.signal.aborted) setAvailable(false);
      });
    return () => ctrl.abort();
  }, []);

  // Carica il cast del libro per il selettore personaggio (caricamento soft: in caso di errore
  // resta vuoto e il selettore mostra solo l'opzione di default, senza bloccare la generazione).
  useEffect(() => {
    const ctrl = new AbortController();
    getCharacters(bookId, ctrl.signal)
      .then((list) => setCast(list))
      .catch(() => {
        /* soft: nessun cast disponibile */
      });
    return () => ctrl.abort();
  }, [bookId]);

  // Auto-deseleziona i capitoli che risultano esclusi: non devono mai finire in un batch.
  useEffect(() => {
    const excludedIdx = new Set(
      chapters
        .filter((ch) => ch.excluded === true && ch.index != null)
        .map((ch) => ch.index as number),
    );
    if (excludedIdx.size === 0) return;
    setSelectedChapters((prev) => {
      const next = prev.filter((idx) => !excludedIdx.has(idx));
      return next.length === prev.length ? prev : next;
    });
  }, [chapters]);

  // Ferma il polling allo smontaggio.
  useEffect(() => {
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
    };
  }, []);

  // Watcher continuo (ogni 3s, mentre il pannello è montato): rileva una generazione sia se è
  // GIÀ in corso al mount (avviata da console o sopravvissuta a un reload) sia se PARTE DOPO che
  // la pagina è già aperta. Appena vede status='generating' aggancia il progresso + il polling di
  // dettaglio (beginPolling), così l'avanzamento compare live senza F5. Quando il polling di
  // dettaglio è attivo, il watcher non fa nulla (beginPolling gestisce la fine).
  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!active || pollRef.current !== null) return; // dettaglio già attivo: non interferire
      try {
        const s = await getSceneGen(bookId);
        if (!active || pollRef.current !== null || s.status !== "generating") return;
        setProgress({ created: s.created, planned: s.planned || 1 });
        setCurrent(s.current ?? null);
        setQueued(s.queued ?? []);
        setWaiting(s.waiting ?? false);
        syncTimers(s); // riallinea i cronometri ai timestamp del server (tempo reale anche al rientro)
        beginPolling();
      } catch {
        // Errore transitorio: riprova al prossimo giro.
      }
    };
    void check();
    const id = window.setInterval(() => void check(), 3000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  function stopPolling() {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Avvia il polling (ogni 3s) dello stato; aggiorna il progresso e a fine ricarica.
  // Usato sia da start() sia dall'aggancio a una generazione già in corso (mount).
  function beginPolling() {
    if (pollRef.current !== null) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const s = await getSceneGen(bookId);
        setProgress({ created: s.created, planned: s.planned || count });
        setCurrent(s.current ?? null);
        setQueued(s.queued ?? []);
        setWaiting(s.waiting ?? false);
        syncTimers(s); // riallinea totale + immagine ai timestamp del server (il per-immagine si azzera da sé)
        if (s.status === "ready" || s.status === "failed") {
          stopPolling();
          stopTimers();
          setProgress(null);
          setCurrent(null);
          setQueued([]);
          setWaiting(false);
          setCancelling(false);
          if (s.status === "ready") {
            toast.success(t("book.sceneGen.scenesGenerated"));
          } else {
            toast.error(s.error || t("book.sceneGen.generationFailed"));
          }
          onGenerated();
        }
      } catch {
        // Errore transitorio di polling: ignora, ritenta al prossimo tick.
      }
    }, 3000);
  }

  // Ricalcola da zero i capitoli in cui compare ciascun personaggio (può richiedere ~1 min). Al
  // ritorno aggiorna il cast locale così le etichette "cap. ..." si aggiornano subito.
  async function recomputeChapters() {
    setRecomputing(true);
    try {
      const { characters } = await recomputeCharacterChapters(bookId);
      setCast(characters);
      toast.success(t("book.sceneGen.presenceRecomputed"));
    } catch {
      toast.error(t("book.sceneGen.presenceRecomputeFailed"));
    } finally {
      setRecomputing(false);
    }
  }

  // Accoda un batch (count immagini per ciascun capitolo scelto; nessun capitolo = Auto). Se una
  // generazione è già in corso, si aggiunge alla coda senza fermarla.
  async function addToQueue() {
    setError(null);
    setStarting(true);
    try {
      const wasRunning = progress !== null;
      const fbSetting = flashbackSetting.trim();
      await generateBookImages(bookId, {
        count,
        aspect,
        chapters: selectedChapters,
        ...(selectedCharacters.length ? { characters: selectedCharacters } : {}),
        ...(flashbackOn
          ? {
              flashback: {
                ...(flashbackYears > 0 ? { youngerYears: flashbackYears } : {}),
                ...(fbSetting ? { setting: fbSetting } : {}),
              },
            }
          : {}),
      });
      if (!wasRunning) {
        // Primo batch: feedback ottimistico (il primo poll riallinea ai dati reali del server).
        const planned = selectedChapters.length > 0 ? count * selectedChapters.length : count;
        setProgress({ created: 0, planned });
        syncTimers({ startedAt: Date.now(), imageStartedAt: Date.now() });
      }
      beginPolling();
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setError(t("book.sceneGen.engineUnavailable"));
        setAvailable(false);
      } else {
        setError(errorMessage(err) || t("book.sceneGen.queueFailed"));
      }
    } finally {
      setStarting(false);
    }
  }

  // Annulla la generazione in corso: l'endpoint killa subito sd-cli; il polling
  // esistente rileverà il passaggio a 'ready'/'failed' e si fermerà da solo
  // (riportando anche `cancelling` a false a fine generazione).
  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      await cancelBookImages(bookId);
      toast.info(t("book.sceneGen.cancelling"));
    } catch (err) {
      setCancelling(false);
      setError(errorMessage(err) || t("book.sceneGen.cancelFailed"));
    }
  }

  async function cancelBatch(batchId: string) {
    try {
      await cancelSceneQueueBatch(bookId, batchId);
      const s = await getSceneGen(bookId);
      setQueued(s.queued ?? []);
      setProgress({ created: s.created, planned: s.planned || count });
    } catch (err) {
      setError(errorMessage(err) || t("book.sceneGen.cancelFailed"));
    }
  }

  // Finché non sappiamo la disponibilità, non mostriamo nulla per evitare flicker.
  if (available === null) return null;

  if (!available) {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-inset px-3 py-2.5 text-sm text-content-tertiary">
        {t("book.sceneGen.unavailable")}
      </div>
    );
  }

  const busy = progress !== null;

  // Riepiloghi mostrati nell'header dei Collapsible quando sono chiusi (la riga resta scannerabile
  // senza espandere): stato capitoli/personaggi/flashback in una frase corta.
  const chaptersSummary =
    selectedChapters.length === 0
      ? t("book.sceneGen.chaptersAuto")
      : t("book.sceneGen.chaptersSelected", { count: selectedChapters.length, each: count });
  const charactersSummary =
    selectedCharacters.length === 0
      ? t("book.sceneGen.charactersAuto")
      : selectedCharacters.slice(0, 3).join(", ") +
        (selectedCharacters.length > 3 ? ` +${selectedCharacters.length - 3}` : "");
  const flashbackSummary = flashbackOn
    ? t("bookDetail.flashbackSummaryYears", { years: flashbackYears }) +
      (flashbackSetting.trim() ? ` · ${flashbackSetting.trim()}` : "")
    : t("bookDetail.flashbackSummaryOff");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-accent/20 bg-accent-soft/40 p-4">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-accent" />
        <h4 className="text-sm font-semibold text-content-primary">{t("book.sceneGen.heading")}</h4>
        <Tooltip
          content={<Trans i18nKey="bookDetail.sceneGenHelp" components={{ strong: <strong /> }} />}
        >
          <span className="ml-auto inline-flex shrink-0 text-content-tertiary">
            <Info className="h-4 w-4" />
          </span>
        </Tooltip>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_8rem_auto] sm:items-end">
        <Field label={t("book.sceneGen.quantityLabel")}>
          <Input
            type="number"
            min={1}
            max={20}
            value={count}
            disabled={starting}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) {
                setCount(Math.min(20, Math.max(1, Math.round(n))));
              }
            }}
          />
        </Field>
        <Field label={t("book.sceneGen.format")}>
          <select
            className={selectClass}
            value={aspect}
            disabled={starting}
            onChange={(e) => setAspect(e.target.value as SceneAspect)}
          >
            {SCENE_ASPECT_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        <Button variant="primary" loading={starting} disabled={starting} onClick={addToQueue}>
          {!starting && <Plus className="h-4 w-4" />}
          {busy ? t("book.actions.queueSceneImages") : t("book.actions.generateSceneImages")}
        </Button>
      </div>

      {/* Capitoli + Personaggi: collassati per default, affiancati su schermi larghi. */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <Collapsible
          title={t("bookDetail.sceneGenChaptersTitle")}
          summary={chaptersSummary}
          bodyClassName="p-0"
        >
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto p-3">
            {chapters
              .filter((ch) => ch.index != null)
              .map((ch) => {
                const idx = ch.index as number;
                const isExcluded = ch.excluded === true;
                const on = selectedChapters.includes(idx);
                return (
                  <label
                    key={ch.id}
                    className={cn(
                      "flex items-center gap-2 text-xs text-content-secondary",
                      isExcluded ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on && !isExcluded}
                      disabled={starting || isExcluded}
                      onChange={() =>
                        setSelectedChapters((prev) =>
                          on ? prev.filter((x) => x !== idx) : [...prev, idx].sort((a, b) => a - b),
                        )
                      }
                    />
                    <span className="truncate">
                      {idx}. {ch.title?.trim() || t("book.sceneGen.untitled")}
                    </span>
                    {isExcluded && <Badge tone="neutral">{t("book.sceneGen.excluded")}</Badge>}
                  </label>
                );
              })}
          </div>
        </Collapsible>

        {cast.length > 0 && (
          <Collapsible
            title={t("bookDetail.sceneGenCharactersTitle")}
            summary={charactersSummary}
            bodyClassName="p-0"
          >
            <div className="flex flex-col gap-2 p-3">
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {cast.map((c) => {
                  const on = selectedCharacters.includes(c.name);
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 text-xs text-content-secondary"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={starting}
                        onChange={() =>
                          setSelectedCharacters((prev) =>
                            on ? prev.filter((x) => x !== c.name) : [...prev, c.name],
                          )
                        }
                      />
                      <span className="truncate">
                        {c.name} (
                        {c.chapters.length
                          ? t("book.sceneGen.charChapters", { chapters: c.chapters.join(", ") })
                          : t("book.sceneGen.charNoChapter")}
                        )
                      </span>
                    </label>
                  );
                })}
              </div>
              {selectedCharacters.length > 0 && (
                <p className="text-xs text-content-tertiary">
                  <Trans
                    i18nKey="book.sceneGen.charactersFeatureNote"
                    values={{ names: selectedCharacters.join(", ") }}
                    components={{ 1: <strong /> }}
                  />
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={recomputing}
                  disabled={recomputing}
                  onClick={recomputeChapters}
                >
                  {t("book.sceneGen.recomputePresence")}
                </Button>
                <span className="text-xs text-content-tertiary">
                  {t("book.sceneGen.recomputeHint")}
                </span>
              </div>
            </div>
          </Collapsible>
        )}
      </div>

      {/* FLASHBACK/ricordo (opzionale): per le scene del passato. Scavalca età e outfit canonici e
          rende i personaggi più giovani, vestiti per l'epoca/luogo del ricordo. */}
      <Collapsible
        title={t("book.sceneGen.flashback")}
        summary={flashbackSummary}
        defaultOpen={flashbackOn}
        bodyClassName="flex flex-col gap-3"
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm text-content-secondary">
          <input
            type="checkbox"
            checked={flashbackOn}
            disabled={starting}
            onChange={(e) => setFlashbackOn(e.target.checked)}
          />
          <span className="font-medium">{t("bookDetail.flashbackEnable")}</span>
        </label>
        {flashbackOn && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_auto] sm:items-end">
            <Field label={t("book.sceneGen.flashbackYears")}>
              <Input
                type="number"
                min={1}
                max={120}
                value={flashbackYears}
                disabled={starting}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n))
                    setFlashbackYears(Math.min(120, Math.max(1, Math.round(n))));
                }}
              />
            </Field>
            <Field label={t("book.sceneGen.flashbackSettingLabel")}>
              <Input
                type="text"
                value={flashbackSetting}
                disabled={starting}
                placeholder={t("book.sceneGen.flashbackSettingPlaceholder")}
                onChange={(e) => setFlashbackSetting(e.target.value)}
              />
            </Field>
            <p className="text-xs text-content-tertiary sm:col-span-2">
              {t("book.sceneGen.flashbackNote")}
            </p>
          </div>
        )}
      </Collapsible>

      {busy && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-card/60 p-3">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-content-secondary">
            <Spinner className="h-4 w-4" />
            <span>
              {t("book.sceneGen.totalProgress", {
                created: progress.created,
                planned: progress.planned,
              })}
            </span>
            {current && (
              <span className="text-content-tertiary">
                <span className="font-medium">
                  {waiting ? t("book.sceneGen.queueWaiting") : t("book.sceneGen.queueInProgress")}
                </span>
                {": "}
                {t("book.sceneGen.currentBatch", {
                  aspect: current.aspect,
                  scope: current.chapters.length
                    ? t("book.sceneGen.chapterScope", { chapters: current.chapters.join(",") })
                    : t("book.sceneGen.auto"),
                  created: current.created,
                  planned: current.planned,
                })}
              </span>
            )}
            <span className="tabular-nums text-content-tertiary">
              {t("book.sceneGen.timers", { img: mmss(elapsedImg), total: mmss(elapsedTotal) })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              loading={cancelling}
              disabled={cancelling}
              onClick={cancel}
            >
              {!cancelling && <X className="h-4 w-4" />}
              {t("book.sceneGen.cancelAll")}
            </Button>
          </div>
          {queued.length > 0 && (
            <div className="flex flex-col gap-1">
              {queued.map((b) => (
                <div key={b.id} className="flex items-center gap-2 text-xs text-content-tertiary">
                  <span className="font-medium">{t("book.sceneGen.queueWaiting")}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {b.count}× {b.aspect}{" "}
                    {b.chapters.length
                      ? t("book.sceneGen.chapterScope", { chapters: b.chapters.join(",") })
                      : t("book.sceneGen.auto")}
                  </span>
                  <button
                    type="button"
                    onClick={() => void cancelBatch(b.id)}
                    aria-label={t("book.sceneGen.cancelThis")}
                    title={t("book.sceneGen.cancelThis")}
                    className="shrink-0 rounded p-0.5 text-content-tertiary transition hover:bg-bg-inset hover:text-content-primary"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs leading-relaxed text-content-tertiary">
        <Trans
          i18nKey="book.sceneGen.footerNote"
          components={{ 1: <strong />, 3: <strong />, 5: <strong /> }}
        />
      </p>
    </div>
  );
}

function PagesCard({
  bookId,
  pages,
  loading,
  error,
  onRetry,
}: {
  bookId: string;
  pages: FacebookPage[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);

  // Deriva la selezione dallo stato reale: una pagina e' associata se il suo bookId e' questo libro.
  useEffect(() => {
    setLinked(new Set(pages.filter((p) => p.bookId === bookId).map((p) => p.id)));
  }, [pages, bookId]);

  async function toggle(pageId: string) {
    const willLink = !linked.has(pageId);
    setPending(pageId);
    try {
      await linkBookToPage(bookId, pageId, willLink);
      setLinked((prev) => {
        const next = new Set(prev);
        if (willLink) next.add(pageId);
        else next.delete(pageId);
        return next;
      });
      toast.success(willLink ? t("book.pages.linked") : t("book.pages.unlinked"));
    } catch (err) {
      toast.error(errorMessage(err) || t("common.operationFailed"));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader title={t("book.pages.title")} description={t("book.pages.description")} />
      <CardBody>
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : error ? (
          <ErrorBanner message={error} onRetry={onRetry} />
        ) : pages.length === 0 ? (
          <p className="text-sm text-content-tertiary">{t("book.pages.noPages")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pages.map((p) => {
              const isOn = linked.has(p.id);
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5",
                    "transition-[background-color,border-color] duration-150 ease-out-strong",
                    isOn
                      ? "border-accent/40 bg-accent-soft"
                      : "border-border-subtle bg-bg-inset hover:bg-bg-hover",
                  )}
                >
                  <span className="text-sm font-medium text-content-primary">{p.name}</span>
                  <input
                    type="checkbox"
                    checked={isOn}
                    disabled={pending === p.id}
                    onChange={() => toggle(p.id)}
                    className="h-4 w-4 cursor-pointer accent-accent"
                  />
                </label>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// --- Tab Capitoli: accordion con il testo completo di ogni capitolo. ---

function ChaptersTab({ bookId }: { bookId: string }) {
  const { t } = useTranslation();
  const chapters = useAsync<BookChapterFull[]>((s) => getChapters(bookId, s), [bookId]);

  if (chapters.loading) {
    return (
      <div className="flex flex-col gap-2 animate-fade-in">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (chapters.error) {
    return <ErrorBanner message={chapters.error} onRetry={chapters.reload} />;
  }
  const list = chapters.data ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        title={t("book.chapters.noChaptersTitle")}
        description={t("book.chapters.noChaptersDescription")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 animate-fade-in">
      {list.map((ch) => (
        <ChapterRow key={ch.id} chapter={ch} bookId={bookId} onChanged={chapters.reload} />
      ))}
    </div>
  );
}

function ChapterRow({
  chapter,
  bookId,
  onChanged,
}: {
  chapter: BookChapterFull;
  bookId: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const title = chapter.title?.trim();
  const excluded = chapter.excluded === true;

  async function toggleExcluded() {
    setToggling(true);
    try {
      await setChapterExcluded(bookId, chapter.index, !excluded);
      toast.success(
        !excluded ? t("book.chapters.chapterExcluded") : t("book.chapters.chapterIncluded"),
      );
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err) || t("common.operationFailed"));
    } finally {
      setToggling(false);
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border-subtle bg-bg-card",
        excluded && "opacity-60",
      )}
    >
      <div className="flex w-full items-center gap-3 pr-4 transition-colors duration-150 ease-out-strong hover:bg-bg-hover">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-sm font-semibold text-content-primary">
              {t("book.chapters.chapterLabel", { index: chapter.index })}
            </span>
            {title && (
              <>
                <span className="text-content-faint" aria-hidden="true">
                  ·
                </span>
                <span className="truncate text-sm text-content-secondary">{title}</span>
              </>
            )}
            {excluded && <Badge tone="neutral">{t("book.chapters.excludedBadge")}</Badge>}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <span className="text-2xs tabular-nums text-content-faint">
              {t("book.chapters.charCount", { count: chapter.charCount })}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-content-tertiary transition-transform duration-150 ease-out-strong",
                open && "rotate-180",
              )}
            />
          </span>
        </button>
        <Button
          variant="ghost"
          size="sm"
          loading={toggling}
          disabled={toggling}
          onClick={toggleExcluded}
          title={excluded ? t("book.chapters.includeTitle") : t("book.chapters.excludeTitle")}
        >
          {!toggling && (excluded ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />)}
          {excluded ? t("book.chapters.include") : t("book.chapters.exclude")}
        </Button>
      </div>
      {open && (
        <div className="border-t border-border-subtle bg-bg-inset px-4 py-3 animate-fade-in flex flex-col gap-4">
          <ChapterSceneEditor
            bookId={bookId}
            chapterIndex={chapter.index}
            initial={chapter.scene ?? null}
          />
          <details className="group">
            <summary className="cursor-pointer text-2xs font-semibold uppercase tracking-wide text-content-faint hover:text-content-secondary">
              {t("book.chapters.chapterText")}
            </summary>
            <p className="mt-2 max-h-[28rem] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-content-secondary">
              {chapter.text}
            </p>
          </details>
        </div>
      )}
    </div>
  );
}

// --- Scheda visiva del capitolo: sotto-tab Ambiente / Oggetti / Personaggi, editabili. ---
// Fonda la generazione delle immagini. Lazy: se non c'è ancora, un bottone la genera.

type SceneSubTab = "ambiente" | "oggetti" | "personaggi" | "fisica";

function ChapterSceneEditor({
  bookId,
  chapterIndex,
  initial,
}: {
  bookId: string;
  chapterIndex: number;
  initial: ChapterScene | null;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [scene, setScene] = useState<ChapterScene | null>(initial);
  const [sub, setSub] = useState<SceneSubTab>("ambiente");
  const [busy, setBusy] = useState(false);
  // Resta single-chapter, ma va disabilitato mentre un build globale della bibbia visiva è in corso.
  const { running } = useVisualBibleStatus(bookId);
  // "dirty" = ci sono modifiche non salvate. Salva si abilita solo se dirty; si disabilita dopo
  // un salvataggio o una (ri)generazione (entrambi passano da applyScene → setDirty(false)).
  const [dirty, setDirty] = useState(false);
  // Campi editabili (stringhe; gli array sono CSV nell'input).
  const [location, setLocation] = useState(initial?.location ?? "");
  const [environment, setEnvironment] = useState(initial?.environment ?? "");
  const [mainObjects, setMainObjects] = useState((initial?.mainObjects ?? []).join(", "));
  const [secondaryObjects, setSecondaryObjects] = useState(
    (initial?.secondaryObjects ?? []).join(", "),
  );
  const [characters, setCharacters] = useState((initial?.characters ?? []).join(", "));
  // Regole di fisica/realismo del capitolo: una per riga (più leggibili dei CSV, spesso frasi).
  const [physicsRules, setPhysicsRules] = useState((initial?.physicsRules ?? []).join("\n"));
  // Momento/azione centrale del capitolo: fonda il soggetto dell'immagine.
  const [keyMoment, setKeyMoment] = useState(initial?.keyMoment ?? "");

  const applyScene = (s: ChapterScene) => {
    setScene(s);
    setLocation(s.location ?? "");
    setEnvironment(s.environment ?? "");
    setMainObjects(s.mainObjects.join(", "));
    setSecondaryObjects(s.secondaryObjects.join(", "));
    setCharacters(s.characters.join(", "));
    setPhysicsRules((s.physicsRules ?? []).join("\n"));
    setKeyMoment(s.keyMoment ?? "");
    setDirty(false); // appena salvato/rigenerato: niente modifiche pendenti
  };

  // Aggiorna un campo e marca la scheda come modificata (riabilita Salva).
  const editField = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setDirty(true);
  };

  const parseCsv = (v: string): string[] =>
    v
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

  // Le regole di fisica sono una per riga (frasi che possono contenere virgole).
  const parseLines = (v: string): string[] =>
    v
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

  const generate = async () => {
    if (!bookId || busy) return;
    setBusy(true);
    try {
      const { scene: s } = await generateChapterScene(bookId, chapterIndex);
      applyScene(s);
      toast.success(t("book.scene.cardGenerated"));
    } catch (e) {
      toast.error(errorMessage(e) || t("book.scene.generateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!bookId || busy) return;
    setBusy(true);
    try {
      const { scene: s } = await updateChapterScene(bookId, chapterIndex, {
        location: location.trim() || null,
        environment: environment.trim() || null,
        mainObjects: parseCsv(mainObjects),
        secondaryObjects: parseCsv(secondaryObjects),
        characters: parseCsv(characters),
        physicsRules: parseLines(physicsRules),
        keyMoment: keyMoment.trim() || null,
      });
      applyScene(s);
      toast.success(t("book.scene.cardSaved"));
    } catch (e) {
      toast.error(errorMessage(e) || t("book.scene.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!scene) {
    return (
      <div className="rounded-lg border border-dashed border-border-subtle bg-bg-card px-4 py-4 flex flex-col items-start gap-2">
        <span className="text-xs text-content-tertiary">{t("book.scene.emptyHint")}</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={generate}
          disabled={busy || running || !bookId}
        >
          <Sparkles className="h-4 w-4" />
          {busy ? t("book.scene.generating") : t("book.scene.generateCard")}
        </Button>
      </div>
    );
  }

  const subs: { id: SceneSubTab; label: string }[] = [
    { id: "ambiente", label: t("book.scene.subEnvironment") },
    { id: "oggetti", label: t("book.scene.subObjects") },
    { id: "personaggi", label: t("book.scene.subCharacters") },
    { id: "fisica", label: t("book.scene.subPhysics") },
  ];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-1" role="tablist">
          {subs.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={sub === s.id}
              onClick={() => setSub(s.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                sub === s.id
                  ? "bg-accent-soft text-accent"
                  : "text-content-tertiary hover:text-content-secondary hover:bg-bg-hover",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="text-2xs text-content-faint">
          {scene.source === "USER" ? t("book.scene.sourceUser") : t("book.scene.sourceGenerated")}
        </span>
      </div>

      <div className="px-3 py-3 flex flex-col gap-3">
        {sub === "ambiente" && (
          <>
            <Field label={t("bookDetail.keyMomentLabel")}>
              <Textarea
                value={keyMoment}
                onChange={(e) => editField(setKeyMoment)(e.target.value)}
                rows={2}
                placeholder={t("bookDetail.keyMomentPlaceholder")}
              />
            </Field>
            <Field label={t("book.scene.place")}>
              <Input
                value={location}
                onChange={(e) => editField(setLocation)(e.target.value)}
                placeholder={t("book.scene.placePlaceholder")}
              />
            </Field>
            <Field label={t("book.scene.environment")}>
              <Input
                value={environment}
                onChange={(e) => editField(setEnvironment)(e.target.value)}
                placeholder={t("book.scene.environmentPlaceholder")}
              />
            </Field>
          </>
        )}
        {sub === "oggetti" && (
          <>
            <Field label={t("book.scene.mainObjects")}>
              <Input
                value={mainObjects}
                onChange={(e) => editField(setMainObjects)(e.target.value)}
                placeholder={t("book.scene.mainObjectsPlaceholder")}
              />
            </Field>
            <Field label={t("book.scene.secondaryObjects")}>
              <Input
                value={secondaryObjects}
                onChange={(e) => editField(setSecondaryObjects)(e.target.value)}
                placeholder={t("book.scene.secondaryObjectsPlaceholder")}
              />
            </Field>
          </>
        )}
        {sub === "personaggi" && (
          <Field label={t("book.scene.presentCharacters")}>
            <Input
              value={characters}
              onChange={(e) => editField(setCharacters)(e.target.value)}
              placeholder={t("book.scene.presentCharactersPlaceholder")}
            />
          </Field>
        )}
        {sub === "fisica" && (
          <Field label={t("book.scene.physicsRules")}>
            <Textarea
              value={physicsRules}
              onChange={(e) => editField(setPhysicsRules)(e.target.value)}
              rows={6}
              placeholder={t("book.scene.physicsRulesPlaceholder")}
            />
            <p className="mt-1.5 text-2xs leading-relaxed text-content-tertiary">
              {t("book.scene.physicsRulesNote")}
            </p>
          </Field>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={save} disabled={busy || !dirty}>
            <Check className="h-4 w-4" />
            {dirty ? t("book.scene.save") : t("book.scene.saved")}
          </Button>
          <Button size="sm" variant="ghost" onClick={generate} disabled={busy || running}>
            <Sparkles className="h-4 w-4" />
            {busy ? t("book.scene.working") : t("book.scene.regenerateCard")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Tab Personaggi: card editabili + creazione + eliminazione. ---

function CharactersTab({
  bookId,
  onRequestReanalyze,
}: {
  bookId: string;
  onRequestReanalyze: () => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const characters = useAsync<BookCharacter[]>((s) => getCharacters(bookId, s), [bookId]);
  // Elenco capitoli per l'editor della presenza per-personaggio (chip capitolo nel modal).
  const chaptersQ = useAsync<BookChapterFull[]>((s) => getChapters(bookId, s), [bookId]);
  const chapterList = chaptersQ.data ?? [];
  const [adding, setAdding] = useState(false);
  // Flusso async+resumable condiviso con il pannello "Bibbia visiva": i pulsanti avviano uno step
  // del build globale e si affidano allo stato condiviso per l'avanzamento. A fine build ricarica.
  const { running, start } = useVisualBibleStatus(bookId, () => characters.reload());
  const [genAppearance, setGenAppearance] = useState(false);
  const [genOutfits, setGenOutfits] = useState(false);

  async function runGenerateAppearance() {
    setGenAppearance(true);
    try {
      await start(["appearance"]);
      toast.info(t("book.characters.appearanceStarted"));
    } catch (err) {
      toast.error(errorMessage(err) || t("book.characters.appearanceFailed"));
    } finally {
      setGenAppearance(false);
    }
  }

  async function runGenerateOutfits() {
    setGenOutfits(true);
    try {
      await start(["outfits"]);
      toast.info(t("book.characters.outfitsStarted"));
    } catch (err) {
      toast.error(errorMessage(err) || t("book.characters.outfitsFailed"));
    } finally {
      setGenOutfits(false);
    }
  }

  if (characters.loading) {
    return (
      <div className="flex flex-col gap-3 animate-fade-in">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (characters.error) {
    return <ErrorBanner message={characters.error} onRetry={characters.reload} />;
  }
  const list = characters.data ?? [];

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content-primary">
          {t("book.characters.title")}
          {list.length > 0 && <span className="ml-2 text-content-faint">{list.length}</span>}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={genAppearance || running}
            disabled={genAppearance || genOutfits || running}
            onClick={runGenerateAppearance}
          >
            {!genAppearance && !running && <Wand2 className="h-4 w-4" />}
            {t("book.actions.generateAppearance")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={genOutfits || running}
            disabled={genAppearance || genOutfits || running}
            onClick={runGenerateOutfits}
          >
            {!genOutfits && !running && <Wand2 className="h-4 w-4" />}
            {t("book.actions.generateOutfits")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            {t("book.actions.addCharacter")}
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={t("book.chapters.emptyTitle")}
          description={t("book.chapters.emptyDescription")}
          action={
            <Button variant="primary" size="sm" onClick={onRequestReanalyze}>
              <Sparkles className="h-4 w-4" />
              {t("book.regenerateAnalysis")}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              chapters={chapterList}
              onChanged={() => characters.reload()}
            />
          ))}
        </div>
      )}

      {adding && (
        <CharacterEditorModal
          bookId={bookId}
          character={null}
          chapters={chapterList}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            characters.reload();
          }}
        />
      )}
    </div>
  );
}

const CHARACTER_FIELDS: { key: keyof BookCharacter; labelKey: string }[] = [
  { key: "occupation", labelKey: "book.characters.fieldOccupation" },
  { key: "personality", labelKey: "book.characters.fieldPersonality" },
  { key: "physical", labelKey: "book.characters.fieldPhysical" },
  { key: "notes", labelKey: "book.characters.fieldNotes" },
];

function CharacterCard({
  character,
  chapters,
  onChanged,
}: {
  character: BookCharacter;
  chapters: BookChapterFull[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCharacter(character.id);
      toast.success(t("book.characters.deleted"));
      setConfirmDelete(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err) || t("common.deleteFailed"));
      setDeleting(false);
    }
  }

  const filled = CHARACTER_FIELDS.filter((f) => {
    const v = character[f.key];
    return typeof v === "string" && v.trim().length > 0;
  });

  return (
    <Card className="flex flex-col">
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-hover text-sm font-semibold uppercase text-content-secondary"
          >
            {character.name.trim().charAt(0) || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-semibold text-content-primary">
              {character.name}
            </h4>
            {character.role && (
              <p className="truncate text-xs text-content-tertiary">{character.role}</p>
            )}
          </div>
          <Tooltip
            content={
              character.source === "AI"
                ? t("book.characters.sourceAiTooltip")
                : t("book.characters.sourceEditedTooltip")
            }
          >
            <span className="inline-flex shrink-0">
              <Badge tone={character.source === "AI" ? "accent" : "neutral"}>
                {character.source === "AI"
                  ? t("book.characters.sourceAi")
                  : t("book.characters.sourceEdited")}
              </Badge>
            </span>
          </Tooltip>
        </div>

        {filled.length > 0 ? (
          <dl className="flex flex-col gap-4">
            {filled.map((f) => (
              <div key={String(f.key)}>
                <dt className="mb-0.5 text-2xs font-semibold uppercase tracking-wide text-content-secondary">
                  {t(f.labelKey)}
                </dt>
                <dd className="line-clamp-3 whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-content-secondary">
                  {String(character[f.key])}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-content-tertiary">{t("book.characters.noDetails")}</p>
        )}

        <div className="mt-auto flex items-center justify-end gap-1.5 border-t border-border-subtle pt-3">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            {t("book.characters.edit")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("book.characters.moreActionsAria", { name: character.name })}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-content-tertiary transition-colors duration-150 ease-out-strong hover:bg-bg-hover hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem danger onSelect={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                {t("book.characters.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardBody>

      {editing && (
        <CharacterEditorModal
          bookId={character.bookId}
          character={character}
          chapters={chapters}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("book.characters.confirmDeleteTitle")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete}>
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">
          {t("book.characters.confirmDeleteBody", { name: character.name })}
        </p>
      </Modal>
    </Card>
  );
}

function CharacterEditorModal({
  bookId,
  character,
  chapters,
  onClose,
  onSaved,
}: {
  bookId: string;
  character: BookCharacter | null;
  chapters: BookChapterFull[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(character?.name ?? "");
  const [role, setRole] = useState(character?.role ?? "");
  const [occupation, setOccupation] = useState(character?.occupation ?? "");
  const [personality, setPersonality] = useState(character?.personality ?? "");
  const [physical, setPhysical] = useState(character?.physical ?? "");
  const [notes, setNotes] = useState(character?.notes ?? "");
  const [outfitDefault, setOutfitDefault] = useState(character?.outfits?.default ?? "");
  const [outfitContexts, setOutfitContexts] = useState<CharacterOutfit[]>(
    character?.outfits?.contexts ?? [],
  );
  const [chapterSet, setChapterSet] = useState<Set<number>>(
    () => new Set(character?.chapters ?? []),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNew = character === null;

  function toggleChapter(idx: number) {
    setChapterSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function addContext() {
    setOutfitContexts((prev) => [...prev, { when: "", outfit: "" }]);
  }

  function updateContext(idx: number, patch: Partial<CharacterOutfit>) {
    setOutfitContexts((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function removeContext(idx: number) {
    setOutfitContexts((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("book.characters.nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    const trimmedPhysical = physical.trim();
    const cleanContexts = outfitContexts
      .map((c) => ({ when: c.when.trim(), outfit: c.outfit.trim() }))
      .filter((c) => c.when !== "" || c.outfit !== "");
    const payload: CharacterInput = {
      name: trimmedName,
      role: role.trim(),
      occupation: occupation.trim(),
      personality: personality.trim(),
      physical: trimmedPhysical,
      notes: notes.trim(),
    };
    try {
      if (isNew) {
        await addCharacter(bookId, payload);
      } else {
        await updateCharacter(character.id, {
          ...payload,
          outfits: {
            default: outfitDefault.trim() === "" ? null : outfitDefault.trim(),
            contexts: cleanContexts,
          },
          chapters: [...chapterSet].sort((a, b) => a - b),
        });
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err) || t("common.saveFailed"));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t("book.characters.newCharacter") : t("book.characters.editCharacter")}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <ErrorBanner message={error} />}
        <Field label={t("book.characters.nameLabel")}>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("book.characters.namePlaceholder")}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("book.characters.roleLabel")}>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={t("book.characters.rolePlaceholder")}
            />
          </Field>
          <Field label={t("book.characters.occupationLabel")}>
            <Input
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder={t("book.characters.occupationPlaceholder")}
            />
          </Field>
        </div>
        <Field label={t("book.characters.personalityLabel")}>
          <Textarea value={personality} onChange={(e) => setPersonality(e.target.value)} rows={3} />
        </Field>
        <Field label={t("book.characters.physicalLabel")}>
          <Textarea value={physical} onChange={(e) => setPhysical(e.target.value)} rows={3} />
        </Field>
        {!isNew && chapters.length > 0 && (
          <Field label={t("bookDetail.characterChaptersLabel")}>
            <p className="mb-2 text-xs text-content-tertiary">
              {t("bookDetail.characterChaptersHint")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {chapters.map((ch) => {
                const on = chapterSet.has(ch.index);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => toggleChapter(ch.index)}
                    title={ch.title ?? undefined}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-medium tabular-nums transition-colors duration-150 ease-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
                      on
                        ? "border-accent bg-accent/15 text-content-primary"
                        : "border-border-subtle text-content-tertiary hover:bg-bg-hover hover:text-content-secondary",
                    )}
                  >
                    {ch.index}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        {!isNew && (
          <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-bg-inset p-3">
            <h4 className="text-2xs font-semibold uppercase tracking-wide text-content-faint">
              {t("book.characters.outfits")}
            </h4>
            <Field label={t("book.characters.outfitDefault")}>
              <Input
                value={outfitDefault}
                onChange={(e) => setOutfitDefault(e.target.value)}
                placeholder={t("book.characters.outfitDefaultPlaceholder")}
              />
            </Field>
            {outfitContexts.length > 0 && (
              <div className="flex flex-col gap-2">
                {outfitContexts.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
                    <Input
                      value={c.when}
                      onChange={(e) => updateContext(idx, { when: e.target.value })}
                      placeholder={t("book.characters.contextPlaceholder")}
                    />
                    <Input
                      value={c.outfit}
                      onChange={(e) => updateContext(idx, { outfit: e.target.value })}
                      placeholder={t("book.characters.outfitContextPlaceholder")}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeContext(idx)}
                      aria-label={t("book.characters.removeContextAria")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div>
              <Button variant="secondary" size="sm" onClick={addContext}>
                <Plus className="h-4 w-4" />
                {t("book.characters.addContext")}
              </Button>
            </div>
          </div>
        )}
        <Field label={t("book.characters.notesLabel")}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Canone visivo "Oggetti & mondo": oggetti/veicoli ricorrenti resi sempre uguali,
 * lato di guida e paese. Mirror di VisualDirectivesCard: stato locale, sync da props, salva
 * via renameBook(visualProps) e propaga al detail tramite onUpdated.
 */
function VisualPropsCard({
  book,
  onUpdated,
}: {
  book: BookDetail["book"];
  onUpdated: (visualProps: BookVisualProps) => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [country, setCountry] = useState(book.visualProps?.country ?? "");
  const [drivingSide, setDrivingSide] = useState<DrivingSide | "">(
    book.visualProps?.drivingSide ?? "",
  );
  const [props, setProps] = useState<VisualProp[]>(book.visualProps?.props ?? []);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Flusso async+resumable: il pannello "Bibbia visiva" globale segue l'avanzamento e ricarica i
  // dati del libro a fine build; qui basta `running` per disabilitare e `start` per avviare lo step.
  const { running, start } = useVisualBibleStatus(book.id);

  useEffect(() => {
    setCountry(book.visualProps?.country ?? "");
    setDrivingSide(book.visualProps?.drivingSide ?? "");
    setProps(book.visualProps?.props ?? []);
  }, [book.visualProps]);

  function addProp() {
    setProps((prev) => [...prev, { name: "", when: "", description: "", owner: null }]);
  }

  function updateProp(idx: number, patch: Partial<VisualProp>) {
    setProps((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function removeProp(idx: number) {
    setProps((prev) => prev.filter((_, i) => i !== idx));
  }

  async function generate() {
    setGenerating(true);
    try {
      await start(["props"]);
      toast.info(t("book.visualProps.generateStarted"));
    } catch (err) {
      toast.error(errorMessage(err) || t("book.visualProps.generateFailed"));
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const next: BookVisualProps = {
        props: props
          .map((p) => ({
            name: p.name.trim(),
            when: p.when.trim(),
            description: p.description.trim(),
            owner: p.owner && p.owner.trim() !== "" ? p.owner.trim() : null,
          }))
          .filter((p) => p.name !== "" || p.when !== "" || p.description !== ""),
        drivingSide: drivingSide === "" ? null : drivingSide,
        country: country.trim() === "" ? null : country.trim(),
      };
      await renameBook(book.id, { visualProps: next });
      onUpdated(next);
      toast.success(t("book.visualProps.saved"));
    } catch (err) {
      toast.error(errorMessage(err) || t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("book.visualProps.title")}
        description={t("book.visualProps.description")}
        action={
          <Button
            variant="secondary"
            size="sm"
            loading={generating || running}
            disabled={generating || running}
            onClick={generate}
          >
            {!generating && !running && <Wand2 className="h-4 w-4" />}
            {t("book.actions.generateObjects")}
          </Button>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("book.visualProps.country")}>
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder={t("book.visualProps.countryPlaceholder")}
            />
          </Field>
          <Field label={t("book.visualProps.drivingSide")}>
            <select
              className={selectClass}
              value={drivingSide}
              onChange={(e) => setDrivingSide(e.target.value as DrivingSide | "")}
            >
              <option value="">—</option>
              <option value="right">{t("book.visualProps.drivingRight")}</option>
              <option value="left">{t("book.visualProps.drivingLeft")}</option>
            </select>
          </Field>
        </div>
        {props.length === 0 ? (
          <p className="text-sm text-content-tertiary">{t("book.visualProps.empty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {props.map((p, idx) => (
              <Collapsible
                key={idx}
                defaultOpen={p.name.trim() === ""}
                title={p.name.trim() || t("book.visualProps.newObject")}
                summary={
                  p.description.trim() || p.when.trim() || t("book.visualProps.noDescription")
                }
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeProp(idx)}
                    aria-label={t("book.visualProps.removeAria")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
                bodyClassName="flex flex-col gap-2"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    value={p.name}
                    onChange={(e) => updateProp(idx, { name: e.target.value })}
                    placeholder={t("book.visualProps.namePlaceholder")}
                  />
                  <Input
                    value={p.when}
                    onChange={(e) => updateProp(idx, { when: e.target.value })}
                    placeholder={t("book.visualProps.whenPlaceholder")}
                  />
                </div>
                <Textarea
                  value={p.description}
                  onChange={(e) => updateProp(idx, { description: e.target.value })}
                  rows={2}
                  placeholder={t("book.visualProps.descriptionPlaceholder")}
                />
                <Input
                  value={p.owner ?? ""}
                  onChange={(e) =>
                    updateProp(idx, {
                      owner: e.target.value === "" ? null : e.target.value,
                    })
                  }
                  placeholder={t("book.visualProps.ownerPlaceholder")}
                />
              </Collapsible>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" onClick={addProp}>
            <Plus className="h-4 w-4" />
            {t("book.visualProps.addObject")}
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {t("common.save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Canone visivo "Personaggi minori": figure incidentali (non nel cast) con un look
 * fisso per le scene dove compaiono. La generazione è LENTA (scansione per capitolo): mostra
 * uno stato d'attesa esplicito.
 */
function VisualExtrasCard({
  book,
  onUpdated,
}: {
  book: BookDetail["book"];
  onUpdated: (visualExtras: BookVisualExtras) => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [minors, setMinors] = useState<MinorCharacter[]>(book.visualExtras?.minors ?? []);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Flusso async+resumable: il pannello "Bibbia visiva" globale segue l'avanzamento e ricarica i
  // dati del libro a fine build; qui basta `running` per disabilitare e `start` per avviare lo step.
  const { running, start } = useVisualBibleStatus(book.id);

  useEffect(() => {
    setMinors(book.visualExtras?.minors ?? []);
  }, [book.visualExtras]);

  function addMinor() {
    setMinors((prev) => [...prev, { label: "", when: "", appearance: "", outfit: null }]);
  }

  function updateMinor(idx: number, patch: Partial<MinorCharacter>) {
    setMinors((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  function removeMinor(idx: number) {
    setMinors((prev) => prev.filter((_, i) => i !== idx));
  }

  async function generate() {
    setGenerating(true);
    try {
      await start(["minors"]);
      toast.info(t("book.visualExtras.generateStarted"));
    } catch (err) {
      toast.error(errorMessage(err) || t("book.visualExtras.generateFailed"));
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const next: BookVisualExtras = {
        minors: minors
          .map((m) => ({
            label: m.label.trim(),
            when: m.when.trim(),
            appearance: m.appearance.trim(),
            outfit: m.outfit && m.outfit.trim() !== "" ? m.outfit.trim() : null,
          }))
          .filter((m) => m.label !== "" || m.when !== "" || m.appearance !== ""),
      };
      await renameBook(book.id, { visualExtras: next });
      onUpdated(next);
      toast.success(t("book.visualExtras.saved"));
    } catch (err) {
      toast.error(errorMessage(err) || t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("book.visualExtras.title")}
        description={t("book.visualExtras.description")}
        action={
          <Button
            variant="secondary"
            size="sm"
            loading={generating || running}
            disabled={generating || running}
            onClick={generate}
          >
            {!generating && !running && <Wand2 className="h-4 w-4" />}
            {generating || running
              ? t("book.actions.generatingMinor")
              : t("book.actions.generateMinor")}
          </Button>
        }
      />
      <CardBody className="flex flex-col gap-4">
        {generating && (
          <div className="flex items-center gap-2.5 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2.5 text-sm text-content-secondary">
            <Spinner className="h-4 w-4" />
            <span>{t("book.visualExtras.generatingNote")}</span>
          </div>
        )}
        {minors.length === 0 ? (
          <p className="text-sm text-content-tertiary">{t("book.visualExtras.empty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {minors.map((m, idx) => (
              <Collapsible
                key={idx}
                defaultOpen={m.label.trim() === ""}
                title={m.label.trim() || t("book.visualExtras.newMinor")}
                summary={
                  m.appearance.trim() || m.when.trim() || t("book.visualExtras.noAppearance")
                }
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMinor(idx)}
                    aria-label={t("book.visualExtras.removeAria")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
                bodyClassName="flex flex-col gap-2"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    value={m.label}
                    onChange={(e) => updateMinor(idx, { label: e.target.value })}
                    placeholder={t("book.visualExtras.labelPlaceholder")}
                  />
                  <Input
                    value={m.when}
                    onChange={(e) => updateMinor(idx, { when: e.target.value })}
                    placeholder={t("book.visualExtras.whenPlaceholder")}
                  />
                </div>
                <Textarea
                  value={m.appearance}
                  onChange={(e) => updateMinor(idx, { appearance: e.target.value })}
                  rows={2}
                  placeholder={t("book.visualExtras.appearancePlaceholder")}
                />
                <Input
                  value={m.outfit ?? ""}
                  onChange={(e) =>
                    updateMinor(idx, {
                      outfit: e.target.value === "" ? null : e.target.value,
                    })
                  }
                  placeholder={t("book.visualExtras.outfitPlaceholder")}
                />
              </Collapsible>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" onClick={addMinor}>
            <Plus className="h-4 w-4" />
            {t("book.visualExtras.add")}
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {t("common.save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
