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

export function nameAppearsInText(name: string, text: string): boolean {
  const variants = nameVariants(name);
  if (variants.length === 0) return false;
  const re = new RegExp(
    `(^|[^\\p{L}])(${variants.map(escapeRegExp).join("|")})([^\\p{L}]|$)`,
    "iu",
  );
  return re.test(text || "");
}

export function namesMatch(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (x === "" || y === "") return false;
  if (x === y) return true;
  const tx = x.split(/\s+/);
  const ty = y.split(/\s+/);
  const [short, long] = tx.length <= ty.length ? [tx, ty] : [ty, tx];
  const longSet = new Set(long);
  return short.every((t) => longSet.has(t));
}

const WINDOW_BEFORE = 2;
const WINDOW_AFTER = 4;

export function collectCharacterPassages(
  chapters: { text: string }[],
  name: string,
  maxChars = 6500,
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
    const sentences = (ch.text || "").split(/(?<=[.!?…»"”’')\]])\s+/).map((s) => s.trim());
    const keep = new Set<number>();
    for (let i = 0; i < sentences.length; i++) {
      const t = sentences[i];
      if (t.length === 0) continue;
      if (!re.test(t)) continue;
      for (let j = i - WINDOW_BEFORE; j <= i + WINDOW_AFTER; j++) {
        if (j >= 0 && j < sentences.length) keep.add(j);
      }
    }
    for (const idx of [...keep].sort((a, b) => a - b)) {
      const t = sentences[idx];
      if (t.length === 0 || t.length > 400) continue;
      out.push(t);
      total += t.length + 1;
      if (total >= maxChars) return out.join(" ");
    }
  }
  return out.join(" ");
}
