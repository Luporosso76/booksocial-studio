import { extname } from "node:path";
import * as fb from "../facebook/client.js";
import { fullText, type ScheduledPost } from "../domain.js";

// Errore "pubblicabilità": media atteso ma assente, file del tipo sbagliato, ecc.
// Distinto da FacebookError (problemi lato Graph API).
export class PublishError extends Error {}

function isVideoFile(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return ext === ".mp4" || ext === ".mov" || ext === ".webm";
}

export type Channel = "STORY" | "REEL" | "PHOTO" | "TEXT";

// Caption per i canali VISUAL (PHOTO/REEL/STORY): Facebook non offre un campo "link" separato
// per questi tipi, quindi il link va NEL testo. Compone fullText(post) + (se presente) una riga
// col link, evitando doppioni se il link è già nel testo. Per TEXT/LINK NON va usata: lì il link
// resta un campo separato (publishFeedPost) così FB genera l'anteprima.
export function visualCaption(post: ScheduledPost): string {
  const text = fullText(post);
  const link = post.link?.trim();
  if (!link) return text;
  if (text.includes(link)) return text; // già presente: niente doppione
  return text.trim() === "" ? link : `${text}\n\n${link}`;
}

// Destinazione di pubblicazione. Il TIPO di contenuto è deciso dal pianificatore e vive nel
// contentFormat (visualKind): lo usiamo come FONTE DI VERITÀ, perché il mediaType potrebbe
// essere stato sovrascritto dal render (es. una storia renderizzata come video reel). Solo
// se manca il contentFormat si ricade sul mediaType.
export function channelFor(post: ScheduledPost): Channel {
  if (post.contentFormat) {
    try {
      const cf = JSON.parse(post.contentFormat) as { visualKind?: string };
      switch (cf.visualKind) {
        case "story":
          return "STORY";
        case "reel":
          return "REEL";
        case "card":
        case "storyboard":
          return "PHOTO";
        case "none":
          return "TEXT";
      }
    } catch {
      /* fallback al mediaType */
    }
  }
  if (post.mediaType === "STORY") return "STORY";
  if (post.mediaType === "REEL") return "REEL";
  if (post.mediaType === "PHOTO") return "PHOTO";
  return "TEXT";
}

/**
 * Pubblica una bozza su Facebook CON il suo media:
 *  - STORY → photo_stories / video_stories (per estensione)
 *  - REEL  → video_reels (Reel verticale)
 *  - PHOTO → post-foto nel feed (immagine + didascalia)
 *  - TEXT/LINK → post di testo (+ link)
 * Ritorna l'id FB del contenuto. Lancia PublishError se il visual atteso non è ancora
 * pronto (così non pubblichiamo un post "vuoto" senza la sua immagine/video).
 * Usato sia dal pulsante "Pubblica adesso" sia dallo scheduler (post programmati).
 */
export async function publishDraft(
  post: ScheduledPost,
  token: string,
  scheduledSec: number | null = null,
): Promise<string> {
  const text = fullText(post);
  const path = post.mediaPath;
  const channel = channelFor(post);

  // NB: programmazione nativa Facebook (scheduledSec) disponibile per post testo/foto E per i Reel.
  // Le Storie NON si programmano su FB: vengono pubblicate ADESSO (il job interno le chiama al loro
  // orario), quindi qui scheduledSec è ignorato per quel canale.
  // Per i canali VISUAL (PHOTO/REEL/STORY) il link va NEL testo (visualCaption): FB non ha un campo
  // link separato per questi tipi.
  if (channel === "STORY") {
    if (!path) throw new PublishError("La storia non ha un visual renderizzato da pubblicare.");
    return isVideoFile(path)
      ? fb.publishVideoStory(post.pageId, token, path)
      : fb.publishPhotoStory(post.pageId, token, path);
  }
  if (channel === "REEL") {
    if (!path) throw new PublishError("Il reel non ha ancora il video renderizzato.");
    if (!isVideoFile(path)) throw new PublishError("Il file allegato al reel non è un video.");
    return fb.publishReel(post.pageId, token, path, visualCaption(post), scheduledSec);
  }
  if (channel === "PHOTO") {
    if (!path) throw new PublishError("Il post-foto non ha ancora l'immagine renderizzata.");
    if (isVideoFile(path)) throw new PublishError("Il file allegato al post non è un'immagine.");
    return fb.publishPhotoPost(post.pageId, token, path, visualCaption(post), scheduledSec);
  }
  // TEXT / LINK: testo (con eventuali hashtag) + link come campo separato (anteprima FB).
  return fb.publishFeedPost(post.pageId, token, text, post.link, scheduledSec);
}
