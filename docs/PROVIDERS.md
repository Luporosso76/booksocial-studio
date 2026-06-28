# AI Providers — configure & extend

BookSocial Studio uses **two independent, pluggable AI engines**:

- **Text engine** (`ContentEngine`) — analysis, canon, post text. Selected by `CONTENT_PROVIDER`.
- **Image engine** (`ImageEngine`) — AI scene images. Selected by `IMAGE_PROVIDER`.

The **text** engine runs through subscription **CLI tools** you log into, or a **local** Ollama
server. The **image** engine adds **API‑key** cloud providers and a **local** GPU backend. So anyone
can run the app the way that suits them:

| Access model             | How you pay / authenticate               | Used by                                                                 |
| ------------------------ | ---------------------------------------- | ----------------------------------------------------------------------- |
| **Subscription / login** | your existing plan, via a local CLI tool | text: opencode, Codex, Claude, agy (Gemini) · images: agy               |
| **API key**              | per‑token, your provider key             | images: OpenAI, Google, Stability, Black Forest Labs, Replicate, fal.ai |
| **Local / free**         | runs on your machine, no key             | text: Ollama · images: sd‑cli/Z‑Image                                   |

All configuration is via environment variables — see [`server/.env.example`](../server/.env.example).

---

## Text engine (`CONTENT_PROVIDER`)

Default is `none` (unset) — pick a provider in **Settings → AI** or set `CONTENT_PROVIDER` here.

| `CONTENT_PROVIDER` | Engine                              | Auth               | Key env vars                        |
| ------------------ | ----------------------------------- | ------------------ | ----------------------------------- |
| `opencode`         | local CLI                           | subscription login | `OPENCODE_BINARY`, `OPENCODE_MODEL` |
| `codex`            | local CLI (ChatGPT / OpenAI)        | subscription login | `CODEX_BINARY`, `CODEX_MODEL`       |
| `claude`           | local CLI (Claude Code / Anthropic) | subscription login | `CLAUDE_BINARY`, `CLAUDE_MODEL`     |
| `agy`              | local CLI (Gemini / Antigravity)    | subscription login | `AGY_BINARY`                        |
| `ollama`           | local HTTP                          | none               | `OLLAMA_BASE_URL`, `OLLAMA_MODEL`   |

> The text engine runs through **CLI tools you log into** or a **local** Ollama server — there is no
> per‑token HTTP API mode for text (the CLIs already cover OpenAI, Anthropic and Google accounts).
> Default models: `codex` → `gpt-5.5`; `claude` → `opus`/`sonnet`/`haiku`/`fable`; `opencode`/`agy`/`ollama`
> read the list from the tool. All are editable in **Settings → AI** — nothing is hardcoded.

**Subscription via CLI** — if you already pay for ChatGPT, Claude or a Gemini plan, use the matching
CLI tool: the app just runs it (e.g. `opencode run -m <model>`, `codex exec …`, `claude -p …`,
`agy --model <model> --print …`) and the tool handles auth with your account. You can trigger the
login from **Settings → AI** with the **Authenticate** button. The tool's own configuration (models)
lives in that tool's config, not in this app.

**Local & free** — run [Ollama](https://ollama.com) and point the app at it:

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

---

## Image engine (`IMAGE_PROVIDER`)

| `IMAGE_PROVIDER`   | Engine                               | Auth                                | Key env vars                                                          |
| ------------------ | ------------------------------------ | ----------------------------------- | --------------------------------------------------------------------- |
| `auto` _(default)_ | local if available, else upload‑only | —                                   | (falls back automatically)                                            |
| `local`            | sd‑cli (stable‑diffusion.cpp)        | none, local GPU                     | `SDCPP_*` (see below)                                                 |
| `agy`              | Gemini image agent (CLI)             | subscription login                  | `AGY_BINARY`, `AGY_IMAGE_MODEL` (default `Gemini 3.5 Flash (Medium)`) |
| `openai`           | OpenAI Images API                    | `OPENAI_API_KEY`                    | `OPENAI_IMAGE_MODEL` (e.g. `gpt-image-1`)                             |
| `google`           | Google Imagen API                    | `GOOGLE_API_KEY`                    | `GOOGLE_IMAGE_MODEL` (e.g. `imagen-3.0-generate-002`)                 |
| `stability`        | Stability AI (Stable Image)          | `STABILITY_API_KEY`                 | `STABILITY_IMAGE_MODEL` (e.g. `core`, `sd3`, `ultra`)                 |
| `bfl`              | Black Forest Labs (FLUX)             | `BFL_API_KEY`                       | `BFL_IMAGE_MODEL` (e.g. `flux-dev`, `flux-pro-1.1`)                   |
| `replicate`        | Replicate (any `owner/name` model)   | `REPLICATE_API_TOKEN`               | `REPLICATE_IMAGE_MODEL` (e.g. `black-forest-labs/flux-schnell`)       |
| `fal`              | fal.ai                               | `FAL_API_KEY`                       | `FAL_IMAGE_MODEL` (e.g. `fal-ai/flux/schnell`)                        |
| `none`             | upload‑only (no generation)          | —                                   | —                                                                     |

> **Keys are per provider (account).** The `openai`/`google` image providers use `OPENAI_API_KEY` / `GOOGLE_API_KEY` (your OpenAI / Google account key). The four dedicated image providers
> (`stability`, `bfl`, `replicate`, `fal`) are image‑only and each needs its **own** key.

When no image engine is available the app stays fully usable in **upload‑only** mode — you provide
images, everything else (text, scheduling, publishing) works.

**Aspect mapping** (the app uses 1:1, 4:5, 9:16, 1.91:1, 16:9):

- OpenAI size: `1:1`→`1024x1024`, `4:5`/`9:16`→`1024x1536`, `1.91:1`/`16:9`→`1536x1024`.
- Google `aspectRatio`: `1:1`→`1:1`, `4:5`→`3:4`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- Stability `aspect_ratio`: `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- BFL (FLUX): exact `width`/`height` pixels per aspect (submit then poll for the result URL).
- Replicate (FLUX) `aspect_ratio`: `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- fal `image_size`: `1:1`→`square_hd`, `4:5`→`portrait_4_3`, `9:16`→`portrait_16_9`,
  `1.91:1`/`16:9`→`landscape_16_9`.
- Local: exact pixel dimensions per aspect.
- agy: best‑effort — it is an image _agent_, not a txt2img model, so the requested aspect/scene may not
  be honored exactly. Use a cloud provider or `local` when fidelity matters.

### Local image generation & swapping the model (Z‑Image)

The local backend runs [`stable-diffusion.cpp`](https://github.com/leejet/stable-diffusion.cpp)
(`sd-cli`) with **Z‑Image Turbo** by default. It is fully configurable via env — you can point it at a
**different local model/backend** without touching code:

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

To use a different architecture (e.g. an SDXL/Flux checkpoint supported by stable‑diffusion.cpp),
point `SDCPP_ZIMAGE_MODEL`/`_VAE`/`_LLM` at the right files and adjust `SDCPP_BACKEND`. If a model
needs different CLI flags than Z‑Image, see "Add a new provider in code" below to add a dedicated
`ImageEngine`.

---

## Add a new provider in code

The two engines are the **only extension points**, each with a small interface and a central registry
(a `switch`). Adding a provider = implement the interface + add one `case`.

### Text provider

Interface (`server/src/content/engine.ts`):

```ts
export interface ContentEngine {
  name(): string;
  run(prompt: string): Promise<string>; // returns the model's text answer
}
```

1. Implement it (HTTP via `fetch`, or spawn a CLI). For HTTP providers, follow
   `server/src/content/engineApi.ts` (e.g. `OpenAICompatibleEngine`) — they
   handle the `AbortController` timeout (`appConfig.engineTimeoutMs`) and throw `ContentError` on failure.
2. Add any config you need to `server/src/config.ts` (read from env).
3. Register it in `createEngine()` (`server/src/content/engine.ts`):

```ts
case "myprovider":
  return new MyEngine({ apiKey: appConfig.myKey, model: appConfig.myModel });
```

### Image provider

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

1. Implement it — see `OpenAIImageEngine` / `GoogleImagenImageEngine` for HTTP+base64→file, or
   `LocalSdCliImageEngine` for spawning a local binary. Map `aspect` to your provider's size/ratio.
2. Add config to `server/src/config.ts` if needed.
3. Register it in `createImageEngine()` (`server/src/media/imageEngine.ts`):

```ts
case "myimages":
  return new MyImageEngine({ apiKey: appConfig.myKey, model: appConfig.myImageModel });
```

The public functions in `server/src/media/imageGen.ts` (`imageGenAvailable`, `generateSceneImage`,
`generateFromPrompt`) automatically delegate to the selected engine — callers don't change.

> Tip: keep `run()`/`generate()` resilient — on error/timeout return cleanly (text: throw
> `ContentError`; image: return `null`) so the app can fall back gracefully.
