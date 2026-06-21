# Provider AI — configurazione ed estensione

BookSocial Studio utilizza **due motori AI indipendenti e pluggable**:

- **Motore di testo** (`ContentEngine`) — analisi, canon, testo dei post. Selezionato da `CONTENT_PROVIDER`.
- **Motore di immagini** (`ImageEngine`) — immagini delle scene AI. Selezionato da `IMAGE_PROVIDER`.

Entrambi supportano tre modelli di accesso, in modo che chiunque possa eseguire l'app nel modo più adatto:

| Modello di accesso | Come paghi / ti autentichi | Esempi |
|---|---|---|
| **API key** | per‑token, la chiave del tuo provider | OpenAI, Anthropic, Google, OpenRouter, Groq… |
| **Subscription / login** | il tuo piano esistente, tramite un tool CLI locale | opencode, Codex (ChatGPT), Gemini (Google) |
| **Locale / gratuito** | eseguito sulla tua macchina, nessuna chiave | Ollama (testo), sd‑cli/Z‑Image (immagini) |

Tutta la configurazione avviene tramite variabili d'ambiente — vedi [`server/.env.example`](../server/.env.example).

---

## Motore di testo (`CONTENT_PROVIDER`)

Il default è `none` (non impostato) — scegli un provider in **Impostazioni → AI** o imposta `CONTENT_PROVIDER` qui.

| `CONTENT_PROVIDER` | Motore | Auth | Variabili d'ambiente chiave |
|---|---|---|---|
| `opencode` | CLI locale | login in abbonamento | `OPENCODE_BINARY`, `OPENCODE_MODEL` |
| `codex` | CLI locale (ChatGPT) | login in abbonamento | `CODEX_BINARY`, `CODEX_MODEL` |
| `gemini` | CLI locale (Google) | login in abbonamento | `GEMINI_BINARY`, `GEMINI_CLI_MODEL` |
| `openai` | API HTTP | `OPENAI_API_KEY` | `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| `openai-compatible` (= `compatible`) | API HTTP | `OPENAI_API_KEY` | `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| `anthropic` | API HTTP | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| `google` | API HTTP | `GOOGLE_API_KEY` | `GOOGLE_MODEL`, `GOOGLE_BASE_URL` |
| `ollama` | HTTP locale | nessuna | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |

**Qualsiasi endpoint compatibile con OpenAI** (OpenRouter, Groq, Together, LM Studio, vLLM, …) funziona con una sola impostazione — puntagli contro `OPENAI_BASE_URL`:

```bash
CONTENT_PROVIDER=openai-compatible
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-...
OPENAI_MODEL=meta-llama/llama-3.1-70b-instruct
```

**Abbonamento via CLI** — se paghi già per ChatGPT o per un piano Google, usa il tool CLI corrispondente: l'app si limiterà ad eseguirlo (es. `opencode run --pure -m <model>`, `codex exec …`, `gemini -p …`) e il tool gestirà l'autenticazione con il tuo account. Puoi innescare il login da **Impostazioni → AI** con il pulsante **Authenticate**. La configurazione nativa del tool (i modelli) risiede nella configurazione di quel tool, non in questa app. opencode viene invocato con `--pure` (nessun plugin esterno) per un output riproducibile.

**Locale e gratuito** — esegui [Ollama](https://ollama.com) e fagli puntare l'app:

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

---

## Motore di immagini (`IMAGE_PROVIDER`)

| `IMAGE_PROVIDER` | Motore | Auth | Variabili d'ambiente chiave |
|---|---|---|---|
| `auto` *(default)* | locale se disponibile, altrimenti solo upload | — | (fallback automatico) |
| `local` | sd‑cli (stable‑diffusion.cpp) | nessuna, GPU locale | `SDCPP_*` (vedi sotto) |
| `openai` | API OpenAI Images | `OPENAI_API_KEY` (condivisa con il testo) | `OPENAI_IMAGE_MODEL` (es. `gpt-image-1`) |
| `google` | API Google Imagen | `GOOGLE_API_KEY` (condivisa con il testo) | `GOOGLE_IMAGE_MODEL` (es. `imagen-3.0-generate-002`) |
| `stability` | Stability AI (Stable Image) | `STABILITY_API_KEY` | `STABILITY_IMAGE_MODEL` (es. `core`, `sd3`, `ultra`) |
| `bfl` | Black Forest Labs (FLUX) | `BFL_API_KEY` | `BFL_IMAGE_MODEL` (es. `flux-dev`, `flux-pro-1.1`) |
| `replicate` | Replicate (qualsiasi modello `owner/name`) | `REPLICATE_API_TOKEN` | `REPLICATE_IMAGE_MODEL` (es. `black-forest-labs/flux-schnell`) |
| `fal` | fal.ai | `FAL_API_KEY` | `FAL_IMAGE_MODEL` (es. `fal-ai/flux/schnell`) |
| `none` | solo upload (nessuna generazione) | — | — |

> **Le chiavi sono per provider (account).** Le immagini `openai`/`google` **riutilizzano la stessa chiave del motore di testo** (`OPENAI_API_KEY` / `GOOGLE_API_KEY`). I quattro provider di immagini dedicati (`stability`, `bfl`, `replicate`, `fal`) sono solo per immagini e ognuno necessita della **propria** chiave.

Quando nessun motore di immagini è disponibile l'app rimane pienamente utilizzabile in modalità **solo upload** — tu fornisci le immagini, tutto il resto (testo, programmazione, pubblicazione) funziona.

**Mappatura dell'aspect ratio** (l'app usa 1:1, 4:5, 9:16, 1.91:1, 16:9):

- OpenAI size: `1:1`→`1024x1024`, `4:5`/`9:16`→`1024x1536`, `1.91:1`/`16:9`→`1536x1024`.
- Google `aspectRatio`: `1:1`→`1:1`, `4:5`→`3:4`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- Stability `aspect_ratio`: `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- BFL (FLUX): pixel esatti `width`/`height` per aspect ratio (invia e fai polling per l'URL del risultato).
- Replicate (FLUX) `aspect_ratio`: `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- fal `image_size`: `1:1`→`square_hd`, `4:5`→`portrait_4_3`, `9:16`→`portrait_16_9`, `1.91:1`/`16:9`→`landscape_16_9`.
- Locale: dimensioni esatte in pixel per aspect ratio.

### Generazione locale di immagini e sostituzione del modello (Z‑Image)

Il backend locale esegue [`stable-diffusion.cpp`](https://github.com/leejet/stable-diffusion.cpp) (`sd-cli`) con **Z‑Image Turbo** di default. È completamente configurabile tramite variabili d'ambiente — puoi farlo puntare a un **modello/backend locale differente** senza toccare il codice:

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

Per utilizzare un'architettura diversa (es. un checkpoint SDXL/Flux supportato da stable‑diffusion.cpp), punta `SDCPP_ZIMAGE_MODEL`/`_VAE`/`_LLM` ai file giusti e regola `SDCPP_BACKEND`. Se un modello necessita di flag CLI diversi rispetto a Z‑Image, vedi "Aggiungere un nuovo provider nel codice" qui sotto per aggiungere un `ImageEngine` dedicato.

---

## Aggiungere un nuovo provider nel codice

I due motori sono gli **unici punti di estensione**, ciascuno con una piccola interfaccia e un registro centrale (uno `switch`). Aggiungere un provider = implementare l'interfaccia + aggiungere un `case`.

### Provider di testo

Interfaccia (`server/src/content/engine.ts`):

```ts
export interface ContentEngine {
  name(): string;
  run(prompt: string): Promise<string>; // returns the model's text answer
}
```

1. Implementalo (HTTP via `fetch` o avviando una CLI). Per i provider HTTP, segui `server/src/content/engineApi.ts` (es. `OpenAICompatibleEngine`, `GoogleGeminiEngine`) — gestiscono il timeout di `AbortController` (`appConfig.engineTimeoutMs`) e lanciano `ContentError` in caso di fallimento.
2. Aggiungi qualsiasi configurazione necessaria a `server/src/config.ts` (letta dall'ambiente).
3. Registralo in `createEngine()` (`server/src/content/engine.ts`):

```ts
case "myprovider":
  return new MyEngine({ apiKey: appConfig.myKey, model: appConfig.myModel });
```

### Provider di immagini

Interfaccia (`server/src/media/imageEngine.ts`):

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

1. Implementalo — vedi `OpenAIImageEngine` / `GoogleImagenImageEngine` per HTTP+base64→file, oppure `LocalSdCliImageEngine` per avviare un binario locale. Mappa `aspect` alle dimensioni/proporzioni del tuo provider.
2. Aggiungi la configurazione a `server/src/config.ts` se necessario.
3. Registralo in `createImageEngine()` (`server/src/media/imageEngine.ts`):

```ts
case "myimages":
  return new MyImageEngine({ apiKey: appConfig.myKey, model: appConfig.myImageModel });
```

Le funzioni pubbliche in `server/src/media/imageGen.ts` (`imageGenAvailable`, `generateSceneImage`, `generateFromPrompt`) delegano automaticamente al motore selezionato — i chiamanti non cambiano.

> Tip: mantieni `run()`/`generate()` resilienti — in caso di errore/timeout termina in modo pulito (testo: lancia `ContentError`; immagine: ritorna `null`) così che l'app possa gestire il fallback in modo corretto.
