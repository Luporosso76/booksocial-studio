# Provider AI — configurazione ed estensione

BookSocial Studio usa **due motori AI indipendenti e collegabili**:

- **Motore di testo** (`ContentEngine`) — analisi, canone, testo dei post. Selezionato da `CONTENT_PROVIDER`.
- **Motore di immagini** (`ImageEngine`) — immagini AI delle scene. Selezionato da `IMAGE_PROVIDER`.

Il motore di **testo** funziona tramite **strumenti CLI** con abbonamento a cui effettui l'accesso, oppure tramite un server Ollama **locale**. Il motore di **immagini** aggiunge provider cloud con **chiave API** e un backend GPU **locale**. Così chiunque può eseguire l'app nel modo più adatto:

| Modello di accesso        | Come paghi / ti autentichi                               | Usato da                                                                  |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Abbonamento / accesso** | il tuo piano esistente, tramite uno strumento CLI locale | testo: opencode, Codex, Claude, agy (Gemini) · immagini: agy              |
| **Chiave API**            | a token, con la chiave del tuo provider                  | immagini: OpenAI, Google, Stability, Black Forest Labs, Replicate, fal.ai |
| **Locale / gratuito**     | eseguito sulla tua macchina, senza chiave                | testo: Ollama · immagini: sd‑cli/Z‑Image                                  |

Tutta la configurazione avviene tramite variabili d'ambiente — vedi [`server/.env.example`](../server/.env.example).

---

## Motore di testo (`CONTENT_PROVIDER`)

Il valore predefinito è `none` (non impostato) — scegli un provider in **Impostazioni → AI** oppure imposta qui `CONTENT_PROVIDER`.

| `CONTENT_PROVIDER` | Motore                               | Autenticazione          | Variabili d'ambiente principali     |
| ------------------ | ------------------------------------ | ----------------------- | ----------------------------------- |
| `opencode`         | CLI locale                           | accesso con abbonamento | `OPENCODE_BINARY`, `OPENCODE_MODEL` |
| `codex`            | CLI locale (ChatGPT / OpenAI)        | accesso con abbonamento | `CODEX_BINARY`, `CODEX_MODEL`       |
| `claude`           | CLI locale (Claude Code / Anthropic) | accesso con abbonamento | `CLAUDE_BINARY`, `CLAUDE_MODEL`     |
| `agy`              | CLI locale (Gemini / Antigravity)    | accesso con abbonamento | `AGY_BINARY`                        |
| `ollama`           | HTTP locale                          | nessuna                 | `OLLAMA_BASE_URL`, `OLLAMA_MODEL`   |

> Il motore di testo funziona tramite **strumenti CLI a cui effettui l'accesso** o un server Ollama **locale** — non esiste
> una modalità API HTTP a token per il testo (le CLI coprono già gli account OpenAI, Anthropic e Google).
> Modelli predefiniti: `codex` → `gpt-5.5`; `claude` → `opus`/`sonnet`/`haiku`/`fable`; `opencode`/`agy`/`ollama`
> leggono l'elenco dallo strumento. Tutti sono modificabili in **Impostazioni → AI** — nulla è hardcoded.

**Abbonamento tramite CLI** — se paghi già per ChatGPT, Claude o un piano Gemini, usa lo strumento
CLI corrispondente: l'app si limita a eseguirlo (ad es. `opencode run -m <model>`, `codex exec …`, `claude -p …`,
`agy --model <model> --print …`) e lo strumento gestisce l'autenticazione con il tuo account. Puoi avviare il
login da **Impostazioni → AI** con il pulsante **Autentica**. La configurazione propria dello strumento (modelli)
risiede nella configurazione di quello strumento, non in questa app.

**Locale e gratuito** — esegui [Ollama](https://ollama.com) e indirizza l'app verso di esso:

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

---

## Motore di immagini (`IMAGE_PROVIDER`)

| `IMAGE_PROVIDER`       | Motore                                             | Autenticazione                            | Variabili d'ambiente principali                                           |
| ---------------------- | -------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| `auto` _(predefinito)_ | locale se disponibile, altrimenti solo caricamento | —                                         | (ripiega automaticamente)                                                 |
| `local`                | sd‑cli (stable‑diffusion.cpp)                      | nessuna, GPU locale                       | `SDCPP_*` (vedi sotto)                                                    |
| `agy`                  | agente immagini Gemini (CLI)                       | accesso con abbonamento                   | `AGY_BINARY`, `AGY_IMAGE_MODEL` (predefinito `Gemini 3.5 Flash (Medium)`) |
| `openai`               | OpenAI Images API                                  | `OPENAI_API_KEY` (condivisa con il testo) | `OPENAI_IMAGE_MODEL` (ad es. `gpt-image-1`)                               |
| `google`               | Google Imagen API                                  | `GOOGLE_API_KEY` (condivisa con il testo) | `GOOGLE_IMAGE_MODEL` (ad es. `imagen-3.0-generate-002`)                   |
| `stability`            | Stability AI (Stable Image)                        | `STABILITY_API_KEY`                       | `STABILITY_IMAGE_MODEL` (ad es. `core`, `sd3`, `ultra`)                   |
| `bfl`                  | Black Forest Labs (FLUX)                           | `BFL_API_KEY`                             | `BFL_IMAGE_MODEL` (ad es. `flux-dev`, `flux-pro-1.1`)                     |
| `replicate`            | Replicate (qualsiasi modello `owner/name`)         | `REPLICATE_API_TOKEN`                     | `REPLICATE_IMAGE_MODEL` (ad es. `black-forest-labs/flux-schnell`)         |
| `fal`                  | fal.ai                                             | `FAL_API_KEY`                             | `FAL_IMAGE_MODEL` (ad es. `fal-ai/flux/schnell`)                          |
| `none`                 | solo caricamento (nessuna generazione)             | —                                         | —                                                                         |

> **Le chiavi sono per provider (account).** Le immagini `openai`/`google` **riutilizzano la stessa chiave del motore di testo**
> (`OPENAI_API_KEY` / `GOOGLE_API_KEY`). I quattro provider di immagini dedicati
> (`stability`, `bfl`, `replicate`, `fal`) sono solo per immagini e ciascuno richiede la **propria** chiave.

Quando non è disponibile alcun motore di immagini, l'app resta pienamente utilizzabile in modalità **solo caricamento** — fornisci tu
le immagini, tutto il resto (testo, pianificazione, pubblicazione) funziona.

**Mappatura degli aspetti** (l'app usa 1:1, 4:5, 9:16, 1.91:1, 16:9):

- Dimensione OpenAI: `1:1`→`1024x1024`, `4:5`/`9:16`→`1024x1536`, `1.91:1`/`16:9`→`1536x1024`.
- Google `aspectRatio`: `1:1`→`1:1`, `4:5`→`3:4`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- Stability `aspect_ratio`: `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- BFL (FLUX): pixel esatti di `width`/`height` per aspetto (invia e poi interroga per l'URL del risultato).
- Replicate (FLUX) `aspect_ratio`: `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- fal `image_size`: `1:1`→`square_hd`, `4:5`→`portrait_4_3`, `9:16`→`portrait_16_9`,
  `1.91:1`/`16:9`→`landscape_16_9`.
- Locale: dimensioni in pixel esatte per aspetto.
- agy: best effort — è un _agente_ di immagini, non un modello txt2img, quindi l'aspetto/la scena richiesti potrebbero non
  essere rispettati esattamente. Usa un provider cloud o `local` quando la fedeltà è importante.

### Generazione locale di immagini e sostituzione del modello (Z‑Image)

Il backend locale esegue [`stable-diffusion.cpp`](https://github.com/leejet/stable-diffusion.cpp)
(`sd-cli`) con **Z‑Image Turbo** come impostazione predefinita. È completamente configurabile tramite env — puoi indirizzarlo verso un
**modello/backend locale diverso** senza toccare il codice:

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

Per usare un'architettura diversa (ad es. un checkpoint SDXL/Flux supportato da stable‑diffusion.cpp),
punta `SDCPP_ZIMAGE_MODEL`/`_VAE`/`_LLM` ai file corretti e regola `SDCPP_BACKEND`. Se un modello
richiede flag CLI diversi da Z‑Image, vedi "Aggiungere un nuovo provider nel codice" sotto per aggiungere un
`ImageEngine` dedicato.

---

## Aggiungere un nuovo provider nel codice

I due motori sono gli **unici punti di estensione**, ciascuno con una piccola interfaccia e un registro centrale
(uno `switch`). Aggiungere un provider = implementare l'interfaccia + aggiungere un `case`.

### Provider di testo

Interfaccia (`server/src/content/engine.ts`):

```ts
export interface ContentEngine {
  name(): string;
  run(prompt: string): Promise<string>; // returns the model's text answer
}
```

1. Implementala (HTTP tramite `fetch`, oppure avvia una CLI). Per i provider HTTP, segui
   `server/src/content/engineApi.ts` (ad es. `OpenAICompatibleEngine`, `GoogleGeminiEngine`) — gestiscono
   il timeout di `AbortController` (`appConfig.engineTimeoutMs`) e generano `ContentError` in caso di errore.
2. Aggiungi qualsiasi configurazione necessaria a `server/src/config.ts` (letta da env).
3. Registrala in `createEngine()` (`server/src/content/engine.ts`):

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
    prompt: string; // full, styled prompt
    aspect: SceneAspect; // "1:1" | "4:5" | "1.91:1" | "9:16" | "16:9"
    outPath: string; // write the resulting image here (PNG)
    signal?: AbortSignal; // honor cancellation
  }): Promise<string | null>; // outPath on success, null on failure/unavailable
}
```

1. Implementalo — vedi `OpenAIImageEngine` / `GoogleImagenImageEngine` per HTTP+base64→file, oppure
   `LocalSdCliImageEngine` per avviare un binario locale. Mappa `aspect` alla dimensione/al rapporto del tuo provider.
2. Aggiungi la configurazione a `server/src/config.ts` se necessario.
3. Registralo in `createImageEngine()` (`server/src/media/imageEngine.ts`):

```ts
case "myimages":
  return new MyImageEngine({ apiKey: appConfig.myKey, model: appConfig.myImageModel });
```

Le funzioni pubbliche in `server/src/media/imageGen.ts` (`imageGenAvailable`, `generateSceneImage`,
`generateFromPrompt`) delegano automaticamente al motore selezionato — i chiamanti non cambiano.

> Suggerimento: mantieni `run()`/`generate()` resilienti — in caso di errore/timeout, termina in modo pulito (testo: genera
> `ContentError`; immagine: restituisci `null`) così l'app può ripiegare con grazia.
