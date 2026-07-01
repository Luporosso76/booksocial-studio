export const DEFAULT_MODELS: Record<string, string[]> = {
  codex: ["gpt-5.5"],
  claude: ["opus", "sonnet", "haiku", "fable"],
  openai: ["gpt-image-1"],
  gemini: ["gemini-2.5-flash-image"],
  stability: ["core", "sd3", "ultra"],
  bfl: ["flux-dev", "flux-pro-1.1"],
  replicate: [],
  fal: ["fal-ai/flux/dev"],
};

export async function modelsFor(
  provider: string,
  getModels: (provider: string) => Promise<string[]>,
): Promise<string[]> {
  let dbModels: string[] = [];
  try {
    dbModels = await getModels(provider);
  } catch {}
  const defaults = DEFAULT_MODELS[provider] ?? [];
  return [...new Set([...defaults, ...dbModels])];
}
