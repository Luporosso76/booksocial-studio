// Modelli AI predefiniti per provider. Questi vengono uniti ai modelli salvati nel DB.
// Modificabili senza toccare la logica di routing.

export const DEFAULT_MODELS: Record<string, string[]> = {
  codex: ["gpt-5.5"],
  claude: ["opus", "sonnet", "haiku", "fable"],
  openai: ["gpt-image-1"],
  google: ["imagen-3.0-generate-002"],
  stability: ["core", "sd3", "ultra"],
  bfl: ["flux-dev", "flux-pro-1.1"],
  replicate: [],
  fal: ["fal-ai/flux/dev"],
};

/**
 * Ritorna l'unione (dedup) tra i modelli predefiniti del provider e quelli salvati nel DB.
 * Best-effort: se getModels() fallisce, ritorna solo i default.
 */
export async function modelsFor(
  provider: string,
  getModels: (provider: string) => Promise<string[]>,
): Promise<string[]> {
  let dbModels: string[] = [];
  try {
    dbModels = await getModels(provider);
  } catch {
    // best-effort
  }
  const defaults = DEFAULT_MODELS[provider] ?? [];
  return [...new Set([...defaults, ...dbModels])];
}
