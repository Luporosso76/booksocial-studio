import type { MarketingPostAngle } from "../domain.js";

// IDEA RANKER: sceglie il MIGLIOR angolo-post tra quelli pre-calcolati nella scheda
// marketing del capitolo. Trasparente e ispezionabile (puro codice, nessuna chiamata LLM).
//
// VARIETÀ MASSIMA: rotazione LRU sugli angoli del capitolo. Dato `usedCounts` (quante volte ogni
// angolo è già stato usato per QUESTO capitolo, dallo storico content_usage), si sceglie l'angolo
// MENO usato; a parità d'uso si prende il punteggio più alto. Così un capitolo riusato dà ogni volta
// un angolo DIVERSO finché non si esauriscono i 5-8 angoli, poi si ricomincia dal meno-recente.
// La sicurezza anti-spoiler resta un filtro duro (sotto soglia → escluso del tutto).

export interface RankOptions {
  // Conteggi d'uso per angolo (chiave = marketingAngleKey) su questo capitolo: guida la rotazione LRU.
  usedCounts?: Map<string, number>;
  // Soglia minima di sicurezza anti-spoiler: angoli sotto soglia esclusi.
  minSpoilerSafety?: number;
}

// Chiave STABILE dell'angolo (deve combaciare tra ranker e registrazione d'uso in content_usage).
export function marketingAngleKey(a: Pick<MarketingPostAngle, "type" | "hook">): string {
  return `${a.type}::${a.hook}`.trim().slice(0, 160);
}

// Punteggio di qualità dell'angolo (a parità d'uso LRU). Spoiler-safety domina, poi concretezza ed
// emozione, freschezza come spinta minore.
function score(a: MarketingPostAngle): number {
  return (
    a.spoilerSafety * 1.5 + a.concreteness * 1.2 + a.emotionalStrength * 1.0 + a.freshness * 0.6
  );
}

// Ritorna l'angolo scelto (o null se nessuno supera la soglia anti-spoiler). Ordina per uso crescente
// (LRU), poi punteggio decrescente, poi hook (determinismo a parità totale).
export function pickBestAngle(
  angles: readonly MarketingPostAngle[],
  opts: RankOptions = {},
): MarketingPostAngle | null {
  const minSafety = opts.minSpoilerSafety ?? 5;
  const used = opts.usedCounts ?? new Map<string, number>();
  const eligible = angles.filter((a) => a.hook.trim() !== "" && a.spoilerSafety >= minSafety);
  if (eligible.length === 0) return null;
  const countOf = (a: MarketingPostAngle): number => used.get(marketingAngleKey(a)) ?? 0;
  let best = eligible[0]!;
  for (const a of eligible.slice(1)) {
    const ua = countOf(a);
    const ub = countOf(best);
    if (ua < ub) {
      best = a;
    } else if (ua === ub) {
      const sa = score(a);
      const sb = score(best);
      if (sa > sb || (sa === sb && a.hook < best.hook)) best = a;
    }
  }
  return best;
}
