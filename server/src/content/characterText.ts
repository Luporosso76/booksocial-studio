// Raccoglie dal testo del libro i passaggi che NOMINANO un personaggio: le frasi in cui compare il
// suo nome (o un alias/parte del nome). Servono a GROUNDARE i generatori di aspetto fisico e abiti
// su ciò che il LIBRO descrive davvero (capelli, viso, cicatrici, capi indossati nelle scene),
// invece di farli inventare. Cap di lunghezza per non gonfiare il prompt. Best-effort, solo JS.

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Nomi da cercare: il nome completo + i singoli token "nome"/"cognome" lunghi (≥3 lettere), così
// "Roberto Speranza" matcha anche solo "Roberto" o "Speranza". Dedup, ordinati dal più lungo.
function nameVariants(name: string): string[] {
  const full = name.trim();
  if (full === "") return [];
  const tokens = full
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && /\p{L}/u.test(t));
  const set = new Set<string>([full, ...tokens]);
  return [...set].sort((a, b) => b.length - a.length);
}

// Frasi del libro che parlano del personaggio. `chapters` può essere ristretto ai capitoli dove il
// personaggio compare (mappa NLP) per pertinenza; se vuoto, scandisce tutto. maxChars limita il
// totale. Le frasi troppo corte/lunghe sono scartate. L'ordine segue i capitoli (narrativo).
export function collectCharacterPassages(
  chapters: { text: string }[],
  name: string,
  maxChars = 2800,
): string {
  const variants = nameVariants(name);
  if (variants.length === 0) return "";
  const re = new RegExp(
    `(^|[^\\p{L}])(${variants.map(escapeRegExp).join("|")})([^\\p{L}]|$)`,
    "iu",
  );
  const out: string[] = [];
  let total = 0;
  for (const ch of chapters) {
    const sentences = (ch.text || "").split(/(?<=[.!?…»"])\s+/);
    for (const s of sentences) {
      const t = s.trim();
      if (t.length < 15 || t.length > 400) continue;
      if (!re.test(t)) continue;
      out.push(t);
      total += t.length + 1;
      if (total >= maxChars) return out.join(" ");
    }
  }
  return out.join(" ");
}
