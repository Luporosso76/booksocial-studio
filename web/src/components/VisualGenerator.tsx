import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Clapperboard, ImageIcon, Maximize2, Play, RefreshCw, Sparkles, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, selectClass } from "@/components/ui/Input";
import { ErrorBanner, Spinner } from "@/components/ui/misc";
import { useJobs } from "@/lib/jobs";
import { useAsync, errorMessage } from "@/lib/useAsync";
import { visualKindLabel, renderStatusLabel } from "@/lib/labels";
import { generateVisual, getMusic, getRenderJob, mediaFileUrl } from "@/api/endpoints";
import type { Music, RenderJob, VisualAspect, VisualKind } from "@/api/types";

// ---------------------------------------------------------------------------
// Genera visual: avvia la generazione di un'immagine/reel dalla bozza, segue il
// render nella coda globale e ne mostra l'anteprima allegata. Niente
// pubblicazione: l'asset resta sulla bozza. Errori sempre in-place.
// ---------------------------------------------------------------------------

// 'storyboard' rimosso dal selettore (scelta utente: solo immagini singole). Le mappe sotto
// mantengono la chiave storyboard solo per esaustivita' dei tipi: non e' piu' offerta in UI.
const KINDS: { value: VisualKind; labelKey: string; icon: typeof ImageIcon }[] = [
  { value: "quote_card", labelKey: "visualGen.kindQuoteCard", icon: ImageIcon },
  { value: "reel_text", labelKey: "visualGen.kindReel", icon: Clapperboard },
];

const ASPECTS: { value: VisualAspect; labelKey: string }[] = [
  { value: "1:1", labelKey: "visualGen.aspectSquare" },
  { value: "4:5", labelKey: "visualGen.aspectVertical" },
  { value: "9:16", labelKey: "visualGen.aspectStoryReel" },
  { value: "1.91:1", labelKey: "visualGen.aspectHorizontal" },
];

// Template proposti per ciascun tipo. Il backend accetta il campo opzionale;
// se non riconosce il template ricade sul default, quindi è sicuro inviarlo.
const TEMPLATES: Record<VisualKind, { value: string; labelKey: string }[]> = {
  quote_card: [
    { value: "classic", labelKey: "visualGen.tplClassic" },
    { value: "serif", labelKey: "visualGen.tplSerif" },
    { value: "bold", labelKey: "visualGen.tplBold" },
  ],
  reel_text: [
    { value: "kinetic", labelKey: "visualGen.tplKinetic" },
    { value: "minimal", labelKey: "visualGen.tplMinimal" },
  ],
  storyboard: [
    { value: "grid", labelKey: "visualGen.tplGrid" },
    { value: "sequence", labelKey: "visualGen.tplSequence" },
  ],
};

const DEFAULT_ASPECT: Record<VisualKind, VisualAspect> = {
  quote_card: "1:1",
  reel_text: "9:16",
  storyboard: "9:16",
};

const POLL_MS = 3000;

// Solo il reel è un video (MP4); card e storyboard sono immagini (PNG).
// Preferiamo l'estensione dell'outputUrl; se assente (es. /media/file/:id senza
// estensione), il fallback è il tipo di visual.
function isVideoAsset(job: RenderJob): boolean {
  const url = job.outputUrl ?? "";
  if (/\.(mp4|webm|mov)(\?|#|$)/i.test(url)) return true;
  if (/\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(url)) return false;
  return job.kind === "reel_text";
}

function assetSrc(job: RenderJob): string {
  // Il backend può restituire un outputUrl assoluto/relativo già servibile,
  // oppure delegare a /media/file/:id. Se outputUrl è un id nudo, lo serviamo.
  const url = job.outputUrl;
  if (!url) return "";
  if (/^https?:\/\//.test(url) || url.startsWith("/")) return url;
  return mediaFileUrl(url);
}

export function VisualGenerator({ postId }: { postId: string }) {
  const { t } = useTranslation();
  const { refresh, onPostRenderDone } = useJobs();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [kind, setKind] = useState<VisualKind>("quote_card");
  const [template, setTemplate] = useState(TEMPLATES.quote_card[0].value);
  const [aspect, setAspect] = useState<VisualAspect>(DEFAULT_ASPECT.quote_card);
  // Default acceso: se il libro ha immagini caricate vengono usate come
  // sfondo/slideshow; il backend ricade su solo-testo se non ce ne sono.
  const [useImages, setUseImages] = useState(true);
  // Traccia musicale selezionata per i reel: '' = Nessuna/silenzioso.
  const [musicId, setMusicId] = useState<string>("");

  // Tracce musicali per il select "Musica" (solo per i reel). Caricate sempre:
  // poche righe, leggere; in errore il select degrada a "Nessuna/silenzioso".
  const musicState = useAsync<Music[]>((s) => getMusic(s), []);
  const tracks = musicState.data ?? [];

  const [submitting, setSubmitting] = useState(false);
  // Job di render attualmente seguito per questa bozza (l'ultimo richiesto).
  const [job, setJob] = useState<RenderJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lightbox: anteprima piccola → click → visione grande (immagine/video con audio).
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [lightboxOpen]);

  const jobIdRef = useRef<string | null>(null);

  const active = job != null && (job.status === "queued" || job.status === "rendering");

  function chooseKind(next: VisualKind) {
    setKind(next);
    setTemplate(TEMPLATES[next][0].value);
    setAspect(DEFAULT_ASPECT[next]);
  }

  // Recupera lo stato puntuale del render (porta outputUrl/error a fine corsa).
  const pollJob = useCallback(
    async (id: string, signal?: AbortSignal) => {
      try {
        const next = await getRenderJob(id, signal);
        if (jobIdRef.current !== id) return; // job superato da una nuova richiesta
        setJob(next);
        if (next.status === "failed") {
          setError(next.error || t("visualGen.renderFailed"));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Errore transitorio: riprova al giro successivo, niente crash.
      }
    },
    [t],
  );

  // Polla il job finché è in coda/rendering. In parallelo, la sottoscrizione
  // globale (onPostRenderDone) forza un poll immediato appena il job esce dalla
  // coda /jobs, così l'anteprima compare senza attendere il tick successivo.
  useEffect(() => {
    const id = jobIdRef.current;
    if (!id || !active) return;
    const controller = new AbortController();
    const tid = window.setInterval(() => void pollJob(id, controller.signal), POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(tid);
    };
  }, [active, pollJob]);

  useEffect(() => {
    return onPostRenderDone(postId, () => {
      const id = jobIdRef.current;
      if (id) void pollJob(id);
    });
  }, [postId, onPostRenderDone, pollJob]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const { jobId } = await generateVisual(postId, {
        kind,
        template,
        aspect,
        useImages,
        // Musica solo per i reel; '' (Nessuna/silenzioso) → null.
        musicId: kind === "reel_text" && musicId ? Number(musicId) : null,
      });
      jobIdRef.current = jobId;
      setJob({ id: jobId, kind, status: "queued", postId });
      setDialogOpen(false);
      refresh(); // l'indicatore globale si aggiorna subito
      void pollJob(jobId);
    } catch (err) {
      // Errore in-place dentro il dialog (es. "reel non disponibile su questo
      // ambiente" quando il renderer Reel è degradato).
      setError(errorMessage(err) || t("visualGen.startFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  const done = job?.status === "done" && job.outputUrl;

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setError(null);
            setDialogOpen(true);
          }}
          disabled={active || submitting}
        >
          <Sparkles className="h-4 w-4" />
          {t("visualGen.generateVisual")}
        </Button>

        {active && (
          <span className="inline-flex items-center gap-1.5 text-xs text-content-tertiary">
            <Spinner className="h-3.5 w-3.5" />
            {job ? renderStatusLabel(job.status) : t("visualGen.inQueue")}
            {job?.kind ? ` — ${visualKindLabel(job.kind)}` : ""}…
          </span>
        )}
      </div>

      {/* Errore di un render fallito (fuori dal dialog), in-place e persistente. */}
      {!dialogOpen && error && job?.status === "failed" && (
        <div className="mt-3">
          <ErrorBanner message={error} onRetry={() => setDialogOpen(true)} />
        </div>
      )}

      {/* Anteprima dell'asset generato, allegato alla bozza. */}
      {done && job && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-inset p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-content-secondary">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              {t("visualGen.attachedVisual", { kind: visualKindLabel(job.kind) })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setError(null);
                setDialogOpen(true);
              }}
            >
              <RefreshCw className="h-4 w-4" />
              {t("common.regenerate")}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            title={t("visualGen.enlargeTitle")}
            className="group relative block w-full overflow-hidden rounded-lg border border-border-subtle bg-black/20"
          >
            {isVideoAsset(job) ? (
              <video
                src={assetSrc(job)}
                muted
                playsInline
                preload="metadata"
                className="pointer-events-none mx-auto max-h-64 w-full object-contain"
              />
            ) : (
              <img
                src={assetSrc(job)}
                alt={t("visualGen.generatedAlt", { kind: visualKindLabel(job.kind) })}
                className="pointer-events-none mx-auto max-h-64 w-full object-contain"
              />
            )}
            {/* overlay: play per i video, hint "ingrandisci" per tutti */}
            {isVideoAsset(job) && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-black/55 p-3 text-white">
                  <Play className="h-6 w-6" />
                </span>
              </span>
            )}
            <span className="pointer-events-none absolute bottom-1.5 right-2 inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-2xs text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Maximize2 className="h-3 w-3" />
              {t("visualGen.enlarge")}
            </span>
          </button>
        </div>
      )}

      {/* Lightbox a tutto schermo: visione grande dell'asset (video con audio). */}
      {lightboxOpen &&
        done &&
        job &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/85 backdrop-blur-sm animate-overlay-in"
              onClick={() => setLightboxOpen(false)}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label={t("visualGen.close")}
              className="absolute right-4 top-4 z-[61] rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="relative flex max-h-[92vh] max-w-[94vw] items-center justify-center">
              {isVideoAsset(job) ? (
                <video
                  src={assetSrc(job)}
                  controls
                  autoPlay
                  className="max-h-[92vh] max-w-[94vw] rounded-lg shadow-popover"
                />
              ) : (
                <img
                  src={assetSrc(job)}
                  alt={t("visualGen.generatedAlt", { kind: visualKindLabel(job.kind) })}
                  className="max-h-[92vh] max-w-[94vw] rounded-lg object-contain shadow-popover"
                />
              )}
            </div>
          </div>,
          document.body,
        )}

      <Modal
        open={dialogOpen}
        onClose={() => {
          if (submitting) return;
          setDialogOpen(false);
        }}
        size="sm"
        title={t("visualGen.modalTitle")}
        description={t("visualGen.modalDescription")}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              <X className="h-4 w-4" />
              {t("common.cancel")}
            </Button>
            <Button variant="primary" size="sm" loading={submitting} onClick={handleSubmit}>
              <Sparkles className="h-4 w-4" />
              {t("common.generate")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t("visualGen.kindField")}>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((k) => {
                const Icon = k.icon;
                const selected = kind === k.value;
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => chooseKind(k.value)}
                    className={
                      "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-[border-color,background-color,color] duration-150 ease-out-strong " +
                      (selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border bg-bg-inset text-content-secondary hover:border-border-strong hover:text-content-primary")
                    }
                    aria-pressed={selected}
                  >
                    <Icon className="h-4 w-4" />
                    {t(k.labelKey)}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t("visualGen.templateField")}>
            <select
              className={selectClass}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {TEMPLATES[kind].map((tpl) => (
                <option key={tpl.value} value={tpl.value}>
                  {t(tpl.labelKey)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("visualGen.formatField")}>
            <select
              className={selectClass}
              value={aspect}
              onChange={(e) => setAspect(e.target.value as VisualAspect)}
            >
              {ASPECTS.map((a) => (
                <option key={a.value} value={a.value}>
                  {t(a.labelKey)}
                </option>
              ))}
            </select>
          </Field>

          {/* Musica: solo per i reel. Le tracce vengono dalla libreria musicale. */}
          {kind === "reel_text" && (
            <Field label={t("visualGen.musicField")} hint={t("visualGen.musicHint")}>
              <select
                className={selectClass}
                value={musicId}
                onChange={(e) => setMusicId(e.target.value)}
              >
                <option value="">{t("visualGen.musicNone")}</option>
                {tracks.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.title}
                    {tr.mood ? ` — ${tr.mood}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label={t("visualGen.bookImagesField")} hint={t("visualGen.bookImagesHint")}>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-content-secondary">
              <input
                type="checkbox"
                checked={useImages}
                onChange={(e) => setUseImages(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-bg-inset text-accent focus:ring-accent"
              />
              {t("visualGen.useBookImages")}
            </label>
          </Field>

          {error && <ErrorBanner message={error} />}
        </div>
      </Modal>
    </div>
  );
}
