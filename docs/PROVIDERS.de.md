# KI-Anbieter — konfigurieren & erweitern

BookSocial Studio verwendet **zwei unabhängige, austauschbare KI-Engines**:

- **Text-Engine** (`ContentEngine`) — Analyse, Canon, Post-Text. Ausgewählt durch `CONTENT_PROVIDER`.
- **Image-Engine** (`ImageEngine`) — KI-Szenenbilder. Ausgewählt durch `IMAGE_PROVIDER`.

Beide unterstützen drei Zugriffsmodelle, sodass jeder die App so ausführen kann, wie es für ihn am besten passt:

| Zugriffsmodell | Bezahlung / Authentifizierung | Beispiele |
|---|---|---|
| **API-Key** | pro Token, dein Provider-Key | OpenAI, Anthropic, Google, OpenRouter, Groq… |
| **Abonnement / Login** | dein bestehender Plan, über ein lokales CLI-Tool | opencode, Codex (ChatGPT), Gemini (Google) |
| **Lokal / kostenlos** | läuft auf deiner Maschine, kein Key | Ollama (Text), sd‑cli/Z‑Image (Bilder) |

Die gesamte Konfiguration erfolgt über Umgebungsvariablen — siehe [`server/.env.example`](../server/.env.example).

---

## Text-Engine (`CONTENT_PROVIDER`)

Standard ist `none` (nicht gesetzt) — wähle einen Provider unter **Settings → AI** oder setze hier `CONTENT_PROVIDER`.

| `CONTENT_PROVIDER` | Engine | Auth | Wichtige Env-Vars |
|---|---|---|---|
| `opencode` | lokales CLI | Abonnement-Login | `OPENCODE_BINARY`, `OPENCODE_MODEL` |
| `codex` | lokales CLI (ChatGPT) | Abonnement-Login | `CODEX_BINARY`, `CODEX_MODEL` |
| `gemini` | lokales CLI (Google) | Abonnement-Login | `GEMINI_BINARY`, `GEMINI_CLI_MODEL` |
| `openai` | HTTP API | `OPENAI_API_KEY` | `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| `openai-compatible` (= `compatible`) | HTTP API | `OPENAI_API_KEY` | `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| `anthropic` | HTTP API | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| `google` | HTTP API | `GOOGLE_API_KEY` | `GOOGLE_MODEL`, `GOOGLE_BASE_URL` |
| `ollama` | lokales HTTP | keine | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |

**Jeder OpenAI-kompatible Endpunkt** (OpenRouter, Groq, Together, LM Studio, vLLM, …) funktioniert mit einer einzigen Einstellung — richte `OPENAI_BASE_URL` darauf aus:

```bash
CONTENT_PROVIDER=openai-compatible
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-...
OPENAI_MODEL=meta-llama/llama-3.1-70b-instruct
```

**Abonnement über CLI** — wenn du bereits für ChatGPT oder einen Google-Plan bezahlst, nutze das passende CLI-Tool: Die App führt es einfach aus (z.B. `opencode run --pure -m <model>`, `codex exec …`, `gemini -p …`) und das Tool übernimmt die Authentifizierung mit deinem Konto. Du kannst den Login unter **Settings → AI** über den Button **Authenticate** anstoßen. Die eigene Konfiguration des Tools (Modelle) befindet sich in der Konfiguration dieses Tools, nicht in dieser App. opencode wird mit `--pure` aufgerufen (keine externen Plugins), um reproduzierbare Ergebnisse zu gewährleisten.

**Lokal & kostenlos** — führe [Ollama](https://ollama.com) aus und verbinde die App damit:

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

---

## Image-Engine (`IMAGE_PROVIDER`)

| `IMAGE_PROVIDER` | Engine | Auth | Wichtige Env-Vars |
|---|---|---|---|
| `auto` *(Standard)* | lokal, falls verfügbar, sonst nur Upload | — | (fällt automatisch zurück) |
| `local` | sd‑cli (stable‑diffusion.cpp) | keine, lokale GPU | `SDCPP_*` (siehe unten) |
| `openai` | OpenAI Images API | `OPENAI_API_KEY` (geteilt mit Text) | `OPENAI_IMAGE_MODEL` (z.B. `gpt-image-1`) |
| `google` | Google Imagen API | `GOOGLE_API_KEY` (geteilt mit Text) | `GOOGLE_IMAGE_MODEL` (z.B. `imagen-3.0-generate-002`) |
| `stability` | Stability AI (Stable Image) | `STABILITY_API_KEY` | `STABILITY_IMAGE_MODEL` (z.B. `core`, `sd3`, `ultra`) |
| `bfl` | Black Forest Labs (FLUX) | `BFL_API_KEY` | `BFL_IMAGE_MODEL` (z.B. `flux-dev`, `flux-pro-1.1`) |
| `replicate` | Replicate (jedes `owner/name` Modell) | `REPLICATE_API_TOKEN` | `REPLICATE_IMAGE_MODEL` (z.B. `black-forest-labs/flux-schnell`) |
| `fal` | fal.ai | `FAL_API_KEY` | `FAL_IMAGE_MODEL` (z.B. `fal-ai/flux/schnell`) |
| `none` | nur Upload (keine Generierung) | — | — |

> **Keys gelten pro Provider (Konto).** `openai`/`google` Bilder **verwenden denselben Key wie die Text-Engine** (`OPENAI_API_KEY` / `GOOGLE_API_KEY`). Die vier dedizierten Image-Provider (`stability`, `bfl`, `replicate`, `fal`) sind nur für Bilder und jeder benötigt seinen **eigenen** Key.

Wenn keine Image-Engine verfügbar ist, bleibt die App im Modus **nur Upload** vollständig nutzbar — du stellst Bilder bereit, alles andere (Text, Scheduling, Publishing) funktioniert weiterhin.

**Seitenverhältnis-Zuordnung** (die App verwendet 1:1, 4:5, 9:16, 1.91:1, 16:9):

- OpenAI Größe: `1:1`→`1024x1024`, `4:5`/`9:16`→`1024x1536`, `1.91:1`/`16:9`→`1536x1024`.
- Google `aspectRatio`: `1:1`→`1:1`, `4:5`→`3:4`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- Stability `aspect_ratio`: `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- BFL (FLUX): exakte `width`/`height` Pixel pro Seitenverhältnis (einreichen, dann die Ergebnis-URL abfragen).
- Replicate (FLUX) `aspect_ratio`: `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- fal `image_size`: `1:1`→`square_hd`, `4:5`→`portrait_4_3`, `9:16`→`portrait_16_9`, `1.91:1`/`16:9`→`landscape_16_9`.
- Lokal: exakte Pixelabmessungen pro Seitenverhältnis.

### Lokale Bildgenerierung & Austauschen des Modells (Z‑Image)

Das lokale Backend führt standardmäßig [`stable-diffusion.cpp`](https://github.com/leejet/stable-diffusion.cpp) (`sd-cli`) mit **Z‑Image Turbo** aus. Es ist vollständig über Umgebungsvariablen konfigurierbar — du kannst es auf ein **anderes lokales Modell/Backend** verweisen, ohne den Code anzufassen:

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

Um eine andere Architektur zu verwenden (z.B. ein SDXL/Flux-Checkpoint, der von stable‑diffusion.cpp unterstützt wird), richte `SDCPP_ZIMAGE_MODEL`/`_VAE`/`_LLM` auf die richtigen Dateien und passe `SDCPP_BACKEND` an. Wenn ein Modell andere CLI-Flags als Z‑Image benötigt, siehe "Einen neuen Provider im Code hinzufügen" unten, um eine dedizierte `ImageEngine` hinzuzufügen.

---

## Einen neuen Provider im Code hinzufügen

Die beiden Engines sind die **einzigen Erweiterungspunkte**, jeweils mit einem schmalen Interface und einer zentralen Registry (ein `switch`). Einen Provider hinzuzufügen bedeutet = das Interface implementieren + ein `case` hinzufügen.

### Text-Provider

Interface (`server/src/content/engine.ts`):

```ts
export interface ContentEngine {
  name(): string;
  run(prompt: string): Promise<string>; // returns the model's text answer
}
```

1. Implementiere es (HTTP via `fetch` oder starte ein CLI). Folge für HTTP-Provider `server/src/content/engineApi.ts` (z.B. `OpenAICompatibleEngine`, `GoogleGeminiEngine`) — diese verarbeiten den `AbortController`-Timeout (`appConfig.engineTimeoutMs`) und werfen bei einem Fehlschlag einen `ContentError`.
2. Füge jede benötigte Konfiguration zu `server/src/config.ts` hinzu (gelesen aus env).
3. Registriere es in `createEngine()` (`server/src/content/engine.ts`):

```ts
case "myprovider":
  return new MyEngine({ apiKey: appConfig.myKey, model: appConfig.myModel });
```

### Image-Provider

Interface (`server/src/media/imageEngine.ts`):

```ts
export interface ImageEngine {
  name(): string;
  available(): boolean; // can this engine run right now? (key present / binary installed)
  generate(input: {
    prompt: string;        // full, styled prompt
    aspect: SceneAspect;   // "1:1" | "4:5" | "1.91:1" | "9:16" | "16:9"
    outPath: string;       // write the resulting image here (PNG)
    signal?: AbortSignal;  // honor cancellation
  }): Promise<string | null>; // outPath on success, null on failure/unavailable
}
```

1. Implementiere es — siehe `OpenAIImageEngine` / `GoogleImagenImageEngine` für HTTP+base64→file, oder `LocalSdCliImageEngine` zum Starten eines lokalen Binaries. Bilde `aspect` auf die Größe/das Verhältnis deines Providers ab.
2. Füge bei Bedarf Konfiguration zu `server/src/config.ts` hinzu.
3. Registriere es in `createImageEngine()` (`server/src/media/imageEngine.ts`):

```ts
case "myimages":
  return new MyImageEngine({ apiKey: appConfig.myKey, model: appConfig.myImageModel });
```

Die öffentlichen Funktionen in `server/src/media/imageGen.ts` (`imageGenAvailable`, `generateSceneImage`, `generateFromPrompt`) delegieren automatisch an die ausgewählte Engine — für die Aufrufer ändert sich nichts.

> Tipp: Halte `run()`/`generate()` resilient — gib bei Fehlern/Timeouts sauber zurück (Text: wirf `ContentError`; Bild: gib `null` zurück), damit die App elegant auf Fallbacks zurückgreifen kann.
