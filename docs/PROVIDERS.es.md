# Proveedores de IA — configuración y extensión

BookSocial Studio utiliza **dos motores de IA independientes y conectables**:

- **Motor de texto** (`ContentEngine`) — análisis, canon, texto de publicaciones. Seleccionado por `CONTENT_PROVIDER`.
- **Motor de imágenes** (`ImageEngine`) — imágenes de escenas por IA. Seleccionado por `IMAGE_PROVIDER`.

Ambos soportan tres modelos de acceso, para que cualquiera pueda ejecutar la aplicación de la forma que más le convenga:

| Modelo de acceso | Cómo pagas / autenticas | Ejemplos |
|---|---|---|
| **API key** | por token, la clave de tu proveedor | OpenAI, Anthropic, Google, OpenRouter, Groq… |
| **Suscripción / inicio de sesión** | tu plan existente, mediante una herramienta CLI local | opencode, Codex (ChatGPT), Gemini (Google) |
| **Local / gratuito** | se ejecuta en tu máquina, sin clave | Ollama (texto), sd‑cli/Z‑Image (imágenes) |

Toda la configuración se realiza mediante variables de entorno — consulta [`server/.env.example`](../server/.env.example).

---

## Motor de texto (`CONTENT_PROVIDER`)

El valor por defecto es `none` (no establecido) — elige un proveedor en **Configuración → IA** o establece `CONTENT_PROVIDER` aquí.

| `CONTENT_PROVIDER` | Motor | Autenticación | Vars de entorno clave |
|---|---|---|---|
| `opencode` | CLI local | inicio de sesión por suscripción | `OPENCODE_BINARY`, `OPENCODE_MODEL` |
| `codex` | CLI local (ChatGPT) | inicio de sesión por suscripción | `CODEX_BINARY`, `CODEX_MODEL` |
| `gemini` | CLI local (Google) | inicio de sesión por suscripción | `GEMINI_BINARY`, `GEMINI_CLI_MODEL` |
| `openai` | HTTP API | `OPENAI_API_KEY` | `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| `openai-compatible` (= `compatible`) | HTTP API | `OPENAI_API_KEY` | `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| `anthropic` | HTTP API | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| `google` | HTTP API | `GOOGLE_API_KEY` | `GOOGLE_MODEL`, `GOOGLE_BASE_URL` |
| `ollama` | HTTP local | ninguna | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |

**Cualquier endpoint compatible con OpenAI** (OpenRouter, Groq, Together, LM Studio, vLLM, …) funciona con una sola configuración — apunta `OPENAI_BASE_URL` hacia él:

```bash
CONTENT_PROVIDER=openai-compatible
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-...
OPENAI_MODEL=meta-llama/llama-3.1-70b-instruct
```

**Suscripción vía CLI** — si ya pagas por ChatGPT o un plan de Google, usa la herramienta CLI correspondiente: la aplicación simplemente la ejecuta (ej. `opencode run --pure -m <model>`, `codex exec …`, `gemini -p …`) y la herramienta maneja la autenticación con tu cuenta. Puedes iniciar sesión desde **Configuración → IA** con el botón **Autenticar**. La configuración propia de la herramienta (modelos) reside en la configuración de dicha herramienta, no en esta aplicación. opencode se invoca con `--pure` (sin plugins externos) para obtener resultados reproducibles.

**Local y gratuito** — ejecuta [Ollama](https://ollama.com) y apunta la aplicación hacia él:

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

---

## Motor de imágenes (`IMAGE_PROVIDER`)

| `IMAGE_PROVIDER` | Motor | Autenticación | Vars de entorno clave |
|---|---|---|---|
| `auto` *(por defecto)* | local si está disponible, sino solo subida | — | (retrocede automáticamente) |
| `local` | sd‑cli (stable‑diffusion.cpp) | ninguna, GPU local | `SDCPP_*` (ver abajo) |
| `openai` | OpenAI Images API | `OPENAI_API_KEY` (compartida con texto) | `OPENAI_IMAGE_MODEL` (ej. `gpt-image-1`) |
| `google` | Google Imagen API | `GOOGLE_API_KEY` (compartida con texto) | `GOOGLE_IMAGE_MODEL` (ej. `imagen-3.0-generate-002`) |
| `stability` | Stability AI (Stable Image) | `STABILITY_API_KEY` | `STABILITY_IMAGE_MODEL` (ej. `core`, `sd3`, `ultra`) |
| `bfl` | Black Forest Labs (FLUX) | `BFL_API_KEY` | `BFL_IMAGE_MODEL` (ej. `flux-dev`, `flux-pro-1.1`) |
| `replicate` | Replicate (cualquier modelo `owner/name`) | `REPLICATE_API_TOKEN` | `REPLICATE_IMAGE_MODEL` (ej. `black-forest-labs/flux-schnell`) |
| `fal` | fal.ai | `FAL_API_KEY` | `FAL_IMAGE_MODEL` (ej. `fal-ai/flux/schnell`) |
| `none` | solo subida (sin generación) | — | — |

> **Las claves son por proveedor (cuenta).** Las imágenes de `openai`/`google` **reutilizan la misma clave que el motor de texto** (`OPENAI_API_KEY` / `GOOGLE_API_KEY`). Los cuatro proveedores dedicados de imágenes (`stability`, `bfl`, `replicate`, `fal`) son exclusivos para imágenes y cada uno necesita su **propia** clave.

Cuando no hay un motor de imágenes disponible, la aplicación sigue siendo totalmente utilizable en modo de **solo subida** — tú proporcionas las imágenes y todo lo demás (texto, programación, publicación) funciona.

**Mapeo de proporciones** (la aplicación usa 1:1, 4:5, 9:16, 1.91:1, 16:9):

- Tamaño OpenAI: `1:1`→`1024x1024`, `4:5`/`9:16`→`1024x1536`, `1.91:1`/`16:9`→`1536x1024`.
- `aspectRatio` de Google: `1:1`→`1:1`, `4:5`→`3:4`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- `aspect_ratio` de Stability: `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- BFL (FLUX): píxeles exactos de `width`/`height` por proporción (enviar y luego sondear la URL del resultado).
- `aspect_ratio` de Replicate (FLUX): `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- `image_size` de fal: `1:1`→`square_hd`, `4:5`→`portrait_4_3`, `9:16`→`portrait_16_9`, `1.91:1`/`16:9`→`landscape_16_9`.
- Local: dimensiones exactas en píxeles por proporción.

### Generación de imágenes locales e intercambio del modelo (Z‑Image)

El backend local ejecuta [`stable-diffusion.cpp`](https://github.com/leejet/stable-diffusion.cpp) (`sd-cli`) con **Z‑Image Turbo** por defecto. Es totalmente configurable mediante variables de entorno — puedes apuntarlo a un **modelo/backend local diferente** sin tocar código:

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

Para usar una arquitectura diferente (ej. un checkpoint de SDXL/Flux soportado por stable‑diffusion.cpp), apunta `SDCPP_ZIMAGE_MODEL`/`_VAE`/`_LLM` a los archivos correctos y ajusta `SDCPP_BACKEND`. Si un modelo necesita flags de CLI diferentes a Z‑Image, consulta "Añadir un nuevo proveedor en código" a continuación para añadir un `ImageEngine` dedicado.

---

## Añadir un nuevo proveedor en código

Los dos motores son los **únicos puntos de extensión**, cada uno con una pequeña interfaz y un registro central (un `switch`). Añadir un proveedor = implementar la interfaz + añadir un `case`.

### Proveedor de texto

Interfaz (`server/src/content/engine.ts`):

```ts
export interface ContentEngine {
  name(): string;
  run(prompt: string): Promise<string>; // returns the model's text answer
}
```

1. Impleméntala (HTTP vía `fetch`, o generando una CLI). Para proveedores HTTP, sigue `server/src/content/engineApi.ts` (ej. `OpenAICompatibleEngine`, `GoogleGeminiEngine`) — estos manejan el timeout de `AbortController` (`appConfig.engineTimeoutMs`) y lanzan un `ContentError` en caso de fallo.
2. Añade cualquier configuración que necesites a `server/src/config.ts` (leída desde el entorno).
3. Regístrala en `createEngine()` (`server/src/content/engine.ts`):

```ts
case "myprovider":
  return new MyEngine({ apiKey: appConfig.myKey, model: appConfig.myModel });
```

### Proveedor de imágenes

Interfaz (`server/src/media/imageEngine.ts`):

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

1. Impleméntala — consulta `OpenAIImageEngine` / `GoogleImagenImageEngine` para HTTP+base64→archivo, o `LocalSdCliImageEngine` para ejecutar un binario local. Mapea `aspect` al tamaño/proporción de tu proveedor.
2. Añade la configuración a `server/src/config.ts` si es necesario.
3. Regístrala en `createImageEngine()` (`server/src/media/imageEngine.ts`):

```ts
case "myimages":
  return new MyImageEngine({ apiKey: appConfig.myKey, model: appConfig.myImageModel });
```

Las funciones públicas en `server/src/media/imageGen.ts` (`imageGenAvailable`, `generateSceneImage`, `generateFromPrompt`) delegan automáticamente en el motor seleccionado — quienes las llaman no cambian.

> Consejo: mantén `run()`/`generate()` resilientes — en caso de error/timeout retorna limpiamente (texto: lanza `ContentError`; imagen: retorna `null`) para que la aplicación pueda retroceder de manera elegante.
