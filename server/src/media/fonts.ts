import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Caricamento dei font bundlati (server/assets/fonts) per Satori. Sono font open
// (Liberation, metric-compatibili con Times/Arial). I buffer vengono cachati al
// primo uso. Se un file manca, viene semplicemente saltato (Satori riceve solo i
// font disponibili).

export interface SatoriFont {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
}

function fontsRoot(): string {
  // src/media/fonts.ts -> ../../assets/fonts
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "assets", "fonts");
}

const FILES: Array<{ file: string; name: string; weight: 400 | 700 }> = [
  { file: "LiberationSerif-Regular.ttf", name: "Lit Serif", weight: 400 },
  { file: "LiberationSerif-Bold.ttf", name: "Lit Serif", weight: 700 },
  { file: "LiberationSans-Regular.ttf", name: "Lit Sans", weight: 400 },
  { file: "LiberationSans-Bold.ttf", name: "Lit Sans", weight: 700 },
];

let cache: SatoriFont[] | null = null;

/** Carica (e cacha) i font disponibili. Ritorna [] se nessuno e' presente. */
export async function loadFonts(): Promise<SatoriFont[]> {
  if (cache) return cache;
  const root = fontsRoot();
  const out: SatoriFont[] = [];
  for (const f of FILES) {
    const p = join(root, f.file);
    if (!existsSync(p)) continue;
    try {
      out.push({ name: f.name, data: await readFile(p), weight: f.weight, style: "normal" });
    } catch {
      // salta il font non leggibile
    }
  }
  cache = out;
  return out;
}

export const SERIF = "Lit Serif";
export const SANS = "Lit Sans";
