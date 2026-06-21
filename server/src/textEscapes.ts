// Toglie gli ESCAPE del Markdown che il testo del libro (.md) porta con sé: un backslash davanti a
// un carattere di punteggiatura (es. "\-" per i trattini di dialogo, "\'" per gli apostrofi, "\"",
// "\.", "\*"). Nel testo renderizzato/verbatim quel backslash NON deve comparire. Lascia il carattere
// semplice. Non tocca i backslash seguiti da lettere/cifre/spazi (rari e non da escape Markdown).
export function stripMdEscapes(s: string): string {
  if (!s) return s;
  return s.replace(/\\([^A-Za-z0-9\s])/g, "$1");
}
