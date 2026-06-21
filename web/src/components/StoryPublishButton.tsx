import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ErrorBanner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/useAsync";
import { publishStory } from "@/api/endpoints";

// ---------------------------------------------------------------------------
// Pubblica come Storia: pubblicazione REALE ed effimera (24h) del visual 9:16
// già renderizzato della bozza. Azione distruttiva → MODALE DI CONFERMA esplicito.
// Esito ed errori sempre in-place (nessun toast auto-dismiss).
// ---------------------------------------------------------------------------

export function StoryPublishButton({ postId }: { postId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fbStoryId, setFbStoryId] = useState<string | null>(null);

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      const res = await publishStory(postId);
      if (!res.ok) {
        setError(res.error ?? "Pubblicazione della Storia non riuscita.");
        return;
      }
      setFbStoryId(res.fbStoryId ?? null);
      setConfirmOpen(false);
    } catch (err) {
      setError(errorMessage(err) || "Pubblicazione della Storia non riuscita.");
    } finally {
      setPublishing(false);
    }
  }

  const published = fbStoryId !== null;

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      {published ? (
        // Esito positivo persistente, in-place.
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/8 px-3 py-2.5 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="leading-snug">Storia pubblicata. Resterà visibile per 24 ore.</span>
        </div>
      ) : (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setError(null);
              setConfirmOpen(true);
            }}
            disabled={publishing}
          >
            <Clapperboard className="h-4 w-4" />
            Pubblica come Storia
          </Button>

          {/* Errore di pubblicazione (fuori dal modale), in-place e persistente. */}
          {!confirmOpen && error && (
            <div className="mt-3">
              <ErrorBanner message={error} />
            </div>
          )}
        </>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (publishing) return;
          setConfirmOpen(false);
        }}
        size="sm"
        title="Pubblica come Storia"
        description="Pubblicazione reale ed effimera (24 ore)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={publishing}>
              Annulla
            </Button>
            <Button variant="primary" onClick={handlePublish} loading={publishing}>
              <Clapperboard className="h-4 w-4" />
              Pubblica davvero
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p className="text-sm leading-snug text-content-primary">
              Stai per pubblicare il visual 9:16 di questa bozza come Storia sulla pagina Facebook
              pubblica. La Storia sarà visibile a tutti e scomparirà automaticamente dopo 24 ore.
              Confermi?
            </p>
          </div>
          {error && <ErrorBanner message={error} />}
        </div>
      </Modal>
    </div>
  );
}
