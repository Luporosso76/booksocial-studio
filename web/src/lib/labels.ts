// Mappa etichette condivisa tra le schermate.
// Le funzioni traducono le chiavi tecniche dell'API in testo leggibile usando
// l'istanza i18n. Una chiave sconosciuta non viene MAI mostrata grezza.
import i18n from "@/i18n";

/** Capitalizza la prima lettera e sostituisce gli underscore con spazi. */
function humanizeKey(key: string): string {
  const cleaned = key.replace(/_/g, " ").trim();
  if (!cleaned) return key;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Restituisce la traduzione i18n se la chiave esiste, altrimenti il fallback. */
function translateOr(i18nKey: string, fallback: string): string {
  const value = i18n.t(i18nKey);
  // i18next restituisce la chiave stessa quando manca: in quel caso usa il fallback.
  return value === i18nKey ? fallback : value;
}

/** Traduce una chiave metrica di Facebook; in fallback umanizza la chiave. */
export function metricLabel(key: string): string {
  return translateOr(`labels.metric.${key}`, humanizeKey(key));
}

/** Traduce lo stato di un post; in fallback restituisce l'input. */
export function statusLabel(s: string): string {
  return translateOr(`labels.status.${s}`, s);
}

/** Traduce il tipo di media; in fallback restituisce l'input. */
export function mediaTypeLabel(t: string): string {
  return translateOr(`labels.mediaType.${t}`, t);
}

/** Traduce il tipo di visual generato; in fallback restituisce l'input. */
export function visualKindLabel(k: string): string {
  return translateOr(`labels.visualKind.${k}`, k);
}

/** Traduce lo stato di un render; in fallback restituisce l'input. */
export function renderStatusLabel(s: string): string {
  return translateOr(`labels.renderStatus.${s}`, s);
}

// --- Link del libro: tipo (channel) e regola d'uso (usagePolicy) ---

/** Traduce il tipo (channel) di un link; in fallback umanizza la chiave. */
export function linkChannelLabel(channel: string): string {
  return translateOr(`labels.linkChannel.${channel}`, humanizeKey(channel));
}

/** Traduce la regola d'uso di un link; stringa vuota se assente. */
export function linkUsageLabel(policy: string | null | undefined): string {
  if (!policy) return "";
  return translateOr(`labels.linkUsage.${policy}`, humanizeKey(policy));
}

// --- Formato editoriale della bozza (contentFormat) ---

/** Traduce la modalità di testo; in fallback umanizza la chiave. */
export function textModeLabel(m: string): string {
  return translateOr(`labels.textMode.${m}`, humanizeKey(m));
}

/** Traduce il tipo di visual del formato bozza; in fallback umanizza la chiave. */
export function contentVisualKindLabel(k: string): string {
  return translateOr(`labels.contentVisualKind.${k}`, humanizeKey(k));
}

/** Traduce la natura del contenuto visivo; in fallback umanizza la chiave. */
export function visualContentLabel(c: string): string {
  return translateOr(`labels.visualContent.${c}`, humanizeKey(c));
}

/**
 * Costruisce i badge leggibili da un contentFormat.
 * Es. "Testo pieno · Card · 4:5", "Reel · slideshow", "Storia 9:16".
 * Restituisce un array di stringhe (ogni voce = un badge); vuoto se non c'è formato.
 */
export function contentFormatBadges(
  cf:
    | {
        textMode?: string | null;
        visualKind?: string | null;
        visualContent?: string | null;
        aspect?: string | null;
      }
    | null
    | undefined,
): string[] {
  if (!cf) return [];
  const badges: string[] = [];

  // 1) Testo: mostra la modalità solo se c'è del testo.
  if (cf.textMode && cf.textMode !== "none") {
    badges.push(textModeLabel(cf.textMode));
  } else if (cf.textMode === "none") {
    badges.push(textModeLabel("none"));
  }

  // 2) Visual: tipo + (per reel/storyboard) natura del contenuto; per la storia
  //    accorpiamo il formato 9:16 nello stesso badge ("Storia 9:16").
  const kind = cf.visualKind && cf.visualKind !== "none" ? cf.visualKind : null;
  if (kind === "story") {
    badges.push(
      cf.aspect
        ? i18n.t("labels.contentFormat.storyAspect", { aspect: cf.aspect })
        : i18n.t("labels.contentFormat.story"),
    );
  } else if (kind) {
    let label = contentVisualKindLabel(kind);
    if (
      cf.visualContent &&
      cf.visualContent !== "text" &&
      (kind === "reel" || kind === "storyboard")
    ) {
      label += ` · ${visualContentLabel(cf.visualContent)}`;
    }
    badges.push(label);
    // 3) Proporzione, come badge a sé (non per la storia, già accorpata sopra).
    if (cf.aspect) badges.push(cf.aspect);
  }

  return badges;
}
