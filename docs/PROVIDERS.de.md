# AI-Provider — konfigurieren & erweitern

BookSocial Studio verwendet **zwei unabhängige, austauschbare KI-Engines**:

- **Text-Engine** (`ContentEngine`) — Analyse, Kanon, Beitragstext. Ausgewählt über `CONTENT_PROVIDER`.
- **Bild-Engine** (`ImageEngine`) — KI-Szenenbilder. Ausgewählt über `IMAGE_PROVIDER`.

Die **Text**-Engine läuft über abonnementbasierte **CLI-Tools**, bei denen du dich anmeldest, oder über einen **lokalen** Ollama-Server. Die **Bild**-Engine ergänzt Cloud-Provider mit **API-Schlüssel** und ein **lokales** GPU-Backend. So kann jeder die App auf die passende Weise nutzen:

| Zugriffsmodell         | Bezahlung / Authentifizierung                     | Verwendet von                                                           |
| ---------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| **Abonnement / Login** | dein bestehender Tarif, über ein lokales CLI-Tool | Text: opencode, Codex, Claude, agy (Gemini) · Bilder: agy               |
| **API-Schlüssel**      | pro Token, mit deinem Provider-Schlüssel          | Bilder: OpenAI, Google, Stability, Black Forest Labs, Replicate, fal.ai |
| **Lokal / kostenlos**  | läuft auf deinem Rechner, kein Schlüssel          | Text: Ollama · Bilder: sd‑cli/Z‑Image                                   |

Die gesamte Konfiguration erfolgt über Umgebungsvariablen — siehe [`server/.env.example`](../server/.env.example).

---

## Text-Engine (`CONTENT_PROVIDER`)

Standard ist `none` (nicht gesetzt) — wähle einen Provider unter **Einstellungen → KI** oder setze hier `CONTENT_PROVIDER`.

| `CONTENT_PROVIDER` | Engine                               | Authentifizierung | Wichtige Env-Variablen              |
| ------------------ | ------------------------------------ | ----------------- | ----------------------------------- |
| `opencode`         | lokale CLI                           | Abo-Login         | `OPENCODE_BINARY`, `OPENCODE_MODEL` |
| `codex`            | lokale CLI (ChatGPT / OpenAI)        | Abo-Login         | `CODEX_BINARY`, `CODEX_MODEL`       |
| `claude`           | lokale CLI (Claude Code / Anthropic) | Abo-Login         | `CLAUDE_BINARY`, `CLAUDE_MODEL`     |
| `agy`              | lokale CLI (Gemini / Antigravity)    | Abo-Login         | `AGY_BINARY`                        |
| `ollama`           | lokales HTTP                         | keine             | `OLLAMA_BASE_URL`, `OLLAMA_MODEL`   |

> Die Text-Engine läuft über **CLI-Tools, bei denen du dich anmeldest**, oder über einen **lokalen** Ollama-Server — es gibt keinen
> HTTP-API-Modus pro Token für Text (die CLIs decken OpenAI-, Anthropic- und Google-Konten bereits ab).
> Standardmodelle: `codex` → `gpt-5.5`; `claude` → `opus`/`sonnet`/`haiku`/`fable`; `opencode`/`agy`/`ollama`
> lesen die Liste aus dem Tool. Alles ist unter **Einstellungen → KI** bearbeitbar — nichts ist fest codiert.

**Abonnement über CLI** — wenn du bereits für ChatGPT, Claude oder einen Gemini-Tarif zahlst, verwende das passende
CLI-Tool: Die App führt es nur aus (z. B. `opencode run -m <model>`, `codex exec …`, `claude -p …`,
`agy --model <model> --print …`) und das Tool übernimmt die Authentifizierung mit deinem Konto. Du kannst die
Anmeldung unter **Einstellungen → KI** mit der Schaltfläche **Authentifizieren** auslösen. Die eigene Konfiguration des Tools (Modelle)
liegt in der Konfiguration dieses Tools, nicht in dieser App.

**Lokal & kostenlos** — starte [Ollama](https://ollama.com) und richte die App darauf aus:

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

---

## Bild-Engine (`IMAGE_PROVIDER`)

| `IMAGE_PROVIDER`    | Engine                                     | Authentifizierung                     | Wichtige Env-Variablen                                                 |
| ------------------- | ------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------- |
| `auto` _(Standard)_ | lokal, falls verfügbar, sonst nur Upload   | —                                     | (fällt automatisch zurück)                                             |
| `local`             | sd‑cli (stable‑diffusion.cpp)              | keine, lokale GPU                     | `SDCPP_*` (siehe unten)                                                |
| `agy`               | Gemini-Bild-Agent (CLI)                    | Abo-Login                             | `AGY_BINARY`, `AGY_IMAGE_MODEL` (Standard `Gemini 3.5 Flash (Medium)`) |
| `openai`            | OpenAI Images API                          | `OPENAI_API_KEY` (gemeinsam mit Text) | `OPENAI_IMAGE_MODEL` (z. B. `gpt-image-1`)                             |
| `google`            | Google Imagen API                          | `GOOGLE_API_KEY` (gemeinsam mit Text) | `GOOGLE_IMAGE_MODEL` (z. B. `imagen-3.0-generate-002`)                 |
| `stability`         | Stability AI (Stable Image)                | `STABILITY_API_KEY`                   | `STABILITY_IMAGE_MODEL` (z. B. `core`, `sd3`, `ultra`)                 |
| `bfl`               | Black Forest Labs (FLUX)                   | `BFL_API_KEY`                         | `BFL_IMAGE_MODEL` (z. B. `flux-dev`, `flux-pro-1.1`)                   |
| `replicate`         | Replicate (beliebiges `owner/name`-Modell) | `REPLICATE_API_TOKEN`                 | `REPLICATE_IMAGE_MODEL` (z. B. `black-forest-labs/flux-schnell`)       |
| `fal`               | fal.ai                                     | `FAL_API_KEY`                         | `FAL_IMAGE_MODEL` (z. B. `fal-ai/flux/schnell`)                        |
| `none`              | nur Upload (keine Generierung)             | —                                     | —                                                                      |

> **Schlüssel gelten pro Provider (Konto).** `openai`/`google`-Bilder **verwenden denselben Schlüssel wie die Text-
> Engine** (`OPENAI_API_KEY` / `GOOGLE_API_KEY`). Die vier dedizierten Bild-Provider
> (`stability`, `bfl`, `replicate`, `fal`) sind nur für Bilder und benötigen jeweils ihren **eigenen** Schlüssel.

Wenn keine Bild-Engine verfügbar ist, bleibt die App im Modus **nur Upload** vollständig nutzbar — du stellst
Bilder bereit, alles andere (Text, Planung, Veröffentlichung) funktioniert.

**Seitenverhältnis-Zuordnung** (die App verwendet 1:1, 4:5, 9:16, 1.91:1, 16:9):

- OpenAI-Größe: `1:1`→`1024x1024`, `4:5`/`9:16`→`1024x1536`, `1.91:1`/`16:9`→`1536x1024`.
- Google `aspectRatio`: `1:1`→`1:1`, `4:5`→`3:4`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- Stability `aspect_ratio`: `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- BFL (FLUX): exakte `width`/`height`-Pixel je Seitenverhältnis (absenden und dann nach der Ergebnis-URL pollen).
- Replicate (FLUX) `aspect_ratio`: `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- fal `image_size`: `1:1`→`square_hd`, `4:5`→`portrait_4_3`, `9:16`→`portrait_16_9`,
  `1.91:1`/`16:9`→`landscape_16_9`.
- Lokal: exakte Pixelmaße je Seitenverhältnis.
- agy: nach bestem Aufwand — es ist ein Bild-_Agent_, kein txt2img-Modell, daher werden angefordertes Seitenverhältnis/Szene möglicherweise nicht
  exakt eingehalten. Verwende einen Cloud-Provider oder `local`, wenn Genauigkeit wichtig ist.

### Lokale Bildgenerierung & Austausch des Modells (Z‑Image)

Das lokale Backend führt standardmäßig [`stable-diffusion.cpp`](https://github.com/leejet/stable-diffusion.cpp)
(`sd-cli`) mit **Z‑Image Turbo** aus. Es ist vollständig per Env konfigurierbar — du kannst es auf ein
**anderes lokales Modell/Backend** ausrichten, ohne Code zu ändern:

```bash
IMAGE_PROVIDER=local
# binary + backend
SDCPP_CLI=/path/to/sd-cli
SDCPP_BACKEND=te=cpu,vae=cpu,diffusion=vulkan0   # devices for text-encoder / VAE / diffusion
SDCPP_TIMEOUT_MS=900000
SDCPP_DIR=./data/sdcpp                             # root for models (default: <data>/sdcpp)
# --- swap Z-Image for another model: point these at YOUR model files ---
SDCPP_ZIMAGE_DIR=$SDCPP_DIR/models/zimage
SDCPP_ZIMAGE_MODEL=$SDCPP_ZIMAGE_DIR/z_image_turbo-Q8_0.gguf   # → your .gguf/.safetensors
SDCPP_ZIMAGE_LLM=$SDCPP_ZIMAGE_DIR/qwen_3_4b-Q8_0.gguf         # text encoder (if the model needs one)
SDCPP_ZIMAGE_VAE=$SDCPP_ZIMAGE_DIR/ae_bf16.safetensors
# disable local generation entirely (force upload-only even if sd-cli exists)
IMAGEGEN_ENABLED=false
```

Um eine andere Architektur zu verwenden (z. B. einen von stable‑diffusion.cpp unterstützten SDXL/Flux-Checkpoint),
zeige mit `SDCPP_ZIMAGE_MODEL`/`_VAE`/`_LLM` auf die richtigen Dateien und passe `SDCPP_BACKEND` an. Wenn ein Modell
andere CLI-Flags als Z‑Image benötigt, siehe unten „Neuen Provider im Code hinzufügen“, um eine dedizierte
`ImageEngine` hinzuzufügen.

---

## Neuen Provider im Code hinzufügen

Die beiden Engines sind die **einzigen Erweiterungspunkte**, jeweils mit einem kleinen Interface und einer zentralen Registry
(einem `switch`). Provider hinzufügen = Interface implementieren + einen `case` hinzufügen.

### Text-Provider

Interface (`server/src/content/engine.ts`):

```ts
export interface ContentEngine {
  name(): string;
  run(prompt: string): Promise<string>; // returns the model's text answer
}
```

1. Implementiere es (HTTP über `fetch` oder eine CLI starten). Für HTTP-Provider folge
   `server/src/content/engineApi.ts` (z. B. `OpenAICompatibleEngine`, `GoogleGeminiEngine`) — sie
   behandeln das `AbortController`-Timeout (`appConfig.engineTimeoutMs`) und werfen bei Fehlern `ContentError`.
2. Füge jede benötigte Konfiguration zu `server/src/config.ts` hinzu (aus Env lesen).
3. Registriere sie in `createEngine()` (`server/src/content/engine.ts`):

```ts
case "myprovider":
  return new MyEngine({ apiKey: appConfig.myKey, model: appConfig.myModel });
```

### Bild-Provider

Interface (`server/src/media/imageEngine.ts`):

```ts
export interface ImageEngine {
  name(): string;
  available(): boolean; // can this engine run right now? (key present / binary installed)
  generate(input: {
    prompt: string; // full, styled prompt
    aspect: SceneAspect; // "1:1" | "4:5" | "1.91:1" | "9:16" | "16:9"
    outPath: string; // write the resulting image here (PNG)
    signal?: AbortSignal; // honor cancellation
  }): Promise<string | null>; // outPath on success, null on failure/unavailable
}
```

1. Implementiere ihn — siehe `OpenAIImageEngine` / `GoogleImagenImageEngine` für HTTP+base64→Datei oder
   `LocalSdCliImageEngine` zum Starten einer lokalen Binary. Ordne `aspect` der Größe/dem Verhältnis deines Providers zu.
2. Füge bei Bedarf Konfiguration zu `server/src/config.ts` hinzu.
3. Registriere ihn in `createImageEngine()` (`server/src/media/imageEngine.ts`):

```ts
case "myimages":
  return new MyImageEngine({ apiKey: appConfig.myKey, model: appConfig.myImageModel });
```

Die öffentlichen Funktionen in `server/src/media/imageGen.ts` (`imageGenAvailable`, `generateSceneImage`,
`generateFromPrompt`) delegieren automatisch an die ausgewählte Engine — Aufrufer ändern sich nicht.

> Tipp: Halte `run()`/`generate()` robust — bei Fehler/Timeout sauber zurückkehren (Text: `ContentError` werfen;
> Bild: `null` zurückgeben), damit die App geordnet zurückfallen kann.
