import { ThumbsUp, MessageCircle, Share2, Globe, User } from "lucide-react";
import { Spinner } from "@/components/ui/misc";
import type { ScheduledPost } from "@/api/types";

// ---------------------------------------------------------------------------
// Anteprima "tipo post Facebook" della bozza: header pagina + testo + media +
// barra azioni mock. Riproduce fedelmente come apparirà il post, così l'utente
// può valutarlo. Puramente estetica: nessuna azione reale.
// Estratto da PlannerScreen per essere riusato anche nella vista "Programmati".
// ---------------------------------------------------------------------------

/** epoch ms → data+ora leggibile in italiano (es. "lun 16 giu, 18:00"). */
const SCHEDULE_FMT = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
export function scheduledAtLabel(ms: number | null | undefined): string | null {
  if (!ms) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return SCHEDULE_FMT.format(d);
}

// Hashtag da mostrare nell'anteprima: i finali se presenti, altrimenti gli
// specifici. Ogni voce normalizzata con un solo "#" iniziale.
export function previewHashtags(d: ScheduledPost): string[] {
  const list = (d.finalHashtags?.length ? d.finalHashtags : d.specificHashtags) ?? [];
  return list.map((t) => `#${t.replace(/^#+/, "")}`);
}

// Una bozza prevede un visual quando il formato non è "solo testo" oppure il
// mediaType implica un media (PHOTO/REEL/STORY). Serve a sapere se aspettarsi
// un media (e quindi mostrare il placeholder "in generazione" finché manca).
export function expectsVisual(d: ScheduledPost): boolean {
  const kind = d.contentFormat?.visualKind;
  if (kind && kind !== "none") return true;
  return d.mediaType === "PHOTO" || d.mediaType === "REEL" || d.mediaType === "STORY";
}

// Il visual è verticale (9:16): storie e reel. Per questi limitiamo l'altezza con
// object-contain su sfondo scuro, così il formato verticale non sfonda il layout.
export function isVerticalVisual(d: ScheduledPost): boolean {
  if (d.mediaType === "STORY" || d.mediaType === "REEL") return true;
  const cf = d.contentFormat;
  if (!cf) return false;
  return cf.visualKind === "story" || cf.visualKind === "reel" || cf.aspect === "9:16";
}

export function FacebookPreview({ draft, pageName }: { draft: ScheduledPost; pageName: string }) {
  const tags = previewHashtags(draft);
  const scheduleLabel = scheduledAtLabel(draft.scheduledAt);
  const vertical = isVerticalVisual(draft);

  return (
    <div className="mb-3 mx-auto w-full max-w-[480px] overflow-hidden rounded-xl border border-border-subtle bg-bg-base shadow-sm">
      {/* Intestazione: avatar tondo placeholder + nome pagina + riga "Bozza · data". */}
      <div className="flex items-center gap-2.5 px-3 pt-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <User className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-content-primary">{pageName}</div>
          <div className="flex items-center gap-1 text-2xs text-content-tertiary">
            <span>Bozza</span>
            <span aria-hidden>·</span>
            {scheduleLabel ? <span>{scheduleLabel}</span> : <span>non programmata</span>}
            <span aria-hidden>·</span>
            <Globe className="h-3 w-3" aria-hidden />
          </div>
        </div>
      </div>

      {/* Corpo testo: rispetta gli a-capo; hashtag finali su riga propria in accent. */}
      {(draft.body || tags.length > 0) && (
        <div className="px-3 pb-2 pt-2.5">
          {draft.body && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-content-primary">
              {draft.body}
            </p>
          )}
          {tags.length > 0 && (
            <p className="mt-1.5 text-sm leading-relaxed text-accent/80">{tags.join(" ")}</p>
          )}
        </div>
      )}

      {/* Media: video/immagine renderizzata, oppure placeholder "in generazione". */}
      {draft.mediaUrl ? (
        draft.mediaKind === "video" ? (
          <video
            src={draft.mediaUrl}
            controls
            playsInline
            preload="metadata"
            className={
              vertical
                ? "mx-auto block max-h-[30rem] w-full bg-black object-contain"
                : "block w-full"
            }
          />
        ) : (
          <img
            src={draft.mediaUrl}
            alt="Anteprima del visual"
            className={
              vertical
                ? "mx-auto block max-h-[30rem] w-full bg-black object-contain"
                : "block w-full"
            }
          />
        )
      ) : expectsVisual(draft) ? (
        <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 border-y border-border-subtle bg-bg-inset text-content-tertiary">
          <Spinner className="h-5 w-5" />
          <span className="text-xs">Visual in generazione…</span>
        </div>
      ) : null}

      {/* Barra azioni mock (solo estetica, dà il "feel" Facebook). */}
      <div className="flex items-center justify-around border-t border-border-subtle px-2 py-1.5 text-content-tertiary">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <ThumbsUp className="h-4 w-4" />
          Mi piace
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <MessageCircle className="h-4 w-4" />
          Commenta
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <Share2 className="h-4 w-4" />
          Condividi
        </span>
      </div>
    </div>
  );
}
