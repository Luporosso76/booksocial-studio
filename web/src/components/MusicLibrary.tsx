import { useRef, useState } from "react";
import { Music2, Trash2, Upload } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { useAsync, errorMessage } from "@/lib/useAsync";
import { getBookMusic, uploadMusic, deleteMusic } from "@/api/endpoints";
import type { Music } from "@/api/types";

// ---------------------------------------------------------------------------
// Libreria musicale: lista tracce (titolo/mood/durata + player audio), upload
// (file + titolo + mood opzionali) ed eliminazione con conferma. Stesso stile
// della gestione immagini. Errori e stati di caricamento sempre in-place.
// ---------------------------------------------------------------------------

/** Formatta una durata in secondi come "m:ss"; "—" se assente. */
function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function TrackRow({ track, onDeleted }: { track: Music; onDeleted: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteMusic(track.id);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err) || "Eliminazione non riuscita.");
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-inset p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-content-primary">{track.title}</span>
            {track.mood && <Badge tone="accent">{track.mood}</Badge>}
            <Badge tone="neutral">{formatDuration(track.durationSec)}</Badge>
          </div>
          <audio controls preload="none" src={track.url} className="mt-2 h-9 w-full" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger-soft hover:text-danger"
          onClick={() => setConfirmOpen(true)}
          disabled={deleting}
          aria-label="Elimina traccia"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <div className="mt-2">
          <ErrorBanner message={error} />
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (deleting) return;
          setConfirmOpen(false);
        }}
        size="sm"
        title="Elimina traccia"
        description="Questa azione è irreversibile."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Annulla
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              <Trash2 className="h-4 w-4" />
              Elimina
            </Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">
          Stai per eliminare definitivamente la traccia «{track.title}» dalla libreria musicale.
          Confermi?
        </p>
      </Modal>
    </div>
  );
}

export function MusicLibrary({ bookId }: { bookId: string }) {
  const state = useAsync<Music[]>((s) => getBookMusic(bookId, s), [bookId]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const tracks = state.data ?? [];

  function resetForm() {
    setFile(null);
    setTitle("");
    setMood("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleUpload() {
    if (!file) {
      setUploadError("Seleziona un file audio da caricare.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      await uploadMusic(file, {
        title: title.trim() || undefined,
        mood: mood.trim() || undefined,
        bookId,
      });
      resetForm();
      state.reload();
    } catch (err) {
      setUploadError(errorMessage(err) || "Caricamento non riuscito.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Musica del libro"
        description="Tracce usate nei reel e nelle storie di questo libro."
        action={<Badge tone="neutral">{tracks.length}</Badge>}
      />
      <CardBody className="flex flex-col gap-4">
        {state.loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : state.error ? (
          <ErrorBanner message={state.error} onRetry={state.reload} />
        ) : tracks.length === 0 ? (
          <EmptyState
            icon={<Music2 className="h-5 w-5" />}
            title="Nessuna traccia"
            description="Carica un file audio da usare come musica nei reel e nelle storie di questo libro."
          />
        ) : (
          <div className="flex flex-col gap-2 stagger">
            {tracks.map((t) => (
              <TrackRow key={t.id} track={t} onDeleted={state.reload} />
            ))}
          </div>
        )}

        {/* Upload nuova traccia */}
        <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
          <Field label="File audio">
            <Input
              ref={fileRef}
              type="file"
              accept="audio/*"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setUploadError(null);
              }}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Titolo" hint="Opzionale.">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Es. Tema malinconico"
              />
            </Field>
            <Field label="Mood" hint="Opzionale.">
              <Input
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                placeholder="Es. Epico, Calmo…"
              />
            </Field>
          </div>

          {uploadError && <ErrorBanner message={uploadError} />}

          <div className="flex justify-end">
            <Button variant="primary" loading={uploading} disabled={!file} onClick={handleUpload}>
              <Upload className="h-4 w-4" />
              Carica traccia
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
