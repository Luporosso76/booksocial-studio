# Proveedores de IA — configurar y ampliar

BookSocial Studio usa **dos motores de IA independientes y conectables**:

- **Motor de texto** (`ContentEngine`) — análisis, canon, texto de publicaciones. Seleccionado por `CONTENT_PROVIDER`.
- **Motor de imágenes** (`ImageEngine`) — imágenes de escenas con IA. Seleccionado por `IMAGE_PROVIDER`.

El motor de **texto** se ejecuta mediante **herramientas CLI** de suscripción en las que inicias sesión, o un servidor Ollama **local**. El motor de **imágenes** añade proveedores en la nube con **clave de API** y un backend de GPU **local**. Así cualquiera puede ejecutar la app de la forma que mejor le convenga:

| Modelo de acceso                   | Cómo pagas / te autenticas                            | Usado por                                                                 |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| **Suscripción / inicio de sesión** | tu plan existente, mediante una herramienta CLI local | texto: opencode, Codex, Claude, agy (Gemini) · imágenes: agy              |
| **Clave de API**                   | por token, tu clave del proveedor                     | imágenes: OpenAI, Google, Stability, Black Forest Labs, Replicate, fal.ai |
| **Local / gratuito**               | se ejecuta en tu máquina, sin clave                   | texto: Ollama · imágenes: sd‑cli/Z‑Image                                  |

Toda la configuración se realiza mediante variables de entorno — consulta [`server/.env.example`](../server/.env.example).

---

## Motor de texto (`CONTENT_PROVIDER`)

El valor predeterminado es `none` (sin definir) — elige un proveedor en **Configuración → IA** o define `CONTENT_PROVIDER` aquí.

| `CONTENT_PROVIDER` | Motor                               | Autenticación                   | Variables de entorno clave          |
| ------------------ | ----------------------------------- | ------------------------------- | ----------------------------------- |
| `opencode`         | CLI local                           | inicio de sesión de suscripción | `OPENCODE_BINARY`, `OPENCODE_MODEL` |
| `codex`            | CLI local (ChatGPT / OpenAI)        | inicio de sesión de suscripción | `CODEX_BINARY`, `CODEX_MODEL`       |
| `claude`           | CLI local (Claude Code / Anthropic) | inicio de sesión de suscripción | `CLAUDE_BINARY`, `CLAUDE_MODEL`     |
| `agy`              | CLI local (Gemini / Antigravity)    | inicio de sesión de suscripción | `AGY_BINARY`                        |
| `ollama`           | HTTP local                          | ninguna                         | `OLLAMA_BASE_URL`, `OLLAMA_MODEL`   |

> El motor de texto se ejecuta mediante **herramientas CLI en las que inicias sesión** o un servidor Ollama **local** — no hay modo de API HTTP por token para texto (las CLI ya cubren cuentas de OpenAI, Anthropic y Google).
> Modelos predeterminados: `codex` → `gpt-5.5`; `claude` → `opus`/`sonnet`/`haiku`/`fable`; `opencode`/`agy`/`ollama`
> leen la lista desde la herramienta. Todos son editables en **Configuración → IA** — nada está codificado de forma fija.

**Suscripción mediante CLI** — si ya pagas por ChatGPT, Claude o un plan de Gemini, usa la herramienta CLI correspondiente: la app simplemente la ejecuta (p. ej. `opencode run -m <model>`, `codex exec …`, `claude -p …`,
`agy --model <model> --print …`) y la herramienta gestiona la autenticación con tu cuenta. Puedes iniciar el
inicio de sesión desde **Configuración → IA** con el botón **Autenticar**. La configuración propia de la herramienta (modelos)
vive en la configuración de esa herramienta, no en esta app.

**Local y gratuito** — ejecuta [Ollama](https://ollama.com) y apunta la app a él:

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

---

## Motor de imágenes (`IMAGE_PROVIDER`)

| `IMAGE_PROVIDER`          | Motor                                       | Autenticación                           | Variables de entorno clave                                                   |
| ------------------------- | ------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| `auto` _(predeterminado)_ | local si está disponible; si no, solo carga | —                                       | (recurre automáticamente al modo alternativo)                                |
| `local`                   | sd‑cli (stable‑diffusion.cpp)               | ninguna, GPU local                      | `SDCPP_*` (consulta más abajo)                                               |
| `agy`                     | agente de imágenes Gemini (CLI)             | inicio de sesión de suscripción         | `AGY_BINARY`, `AGY_IMAGE_MODEL` (predeterminado `Gemini 3.5 Flash (Medium)`) |
| `openai`                  | API de imágenes de OpenAI                   | `OPENAI_API_KEY`                        | `OPENAI_IMAGE_MODEL` (p. ej. `gpt-image-1`)                                  |
| `google`                  | API de Google Imagen                        | `GOOGLE_API_KEY`                        | `GOOGLE_IMAGE_MODEL` (p. ej. `imagen-3.0-generate-002`)                      |
| `stability`               | Stability AI (Stable Image)                 | `STABILITY_API_KEY`                     | `STABILITY_IMAGE_MODEL` (p. ej. `core`, `sd3`, `ultra`)                      |
| `bfl`                     | Black Forest Labs (FLUX)                    | `BFL_API_KEY`                           | `BFL_IMAGE_MODEL` (p. ej. `flux-dev`, `flux-pro-1.1`)                        |
| `replicate`               | Replicate (cualquier modelo `owner/name`)   | `REPLICATE_API_TOKEN`                   | `REPLICATE_IMAGE_MODEL` (p. ej. `black-forest-labs/flux-schnell`)            |
| `fal`                     | fal.ai                                      | `FAL_API_KEY`                           | `FAL_IMAGE_MODEL` (p. ej. `fal-ai/flux/schnell`)                             |
| `none`                    | solo carga (sin generación)                 | —                                       | —                                                                            |

> **Las claves son por proveedor (cuenta).** Los proveedores de imágenes `openai`/`google` usan `OPENAI_API_KEY` / `GOOGLE_API_KEY` (la clave de tu cuenta de OpenAI / Google). Los cuatro proveedores dedicados de imágenes
> (`stability`, `bfl`, `replicate`, `fal`) son solo para imágenes y cada uno necesita su **propia** clave.

Cuando no hay ningún motor de imágenes disponible, la app sigue siendo completamente usable en modo **solo carga** — tú proporcionas
las imágenes y todo lo demás (texto, programación, publicación) funciona.

**Mapeo de aspecto** (la app usa 1:1, 4:5, 9:16, 1.91:1, 16:9):

- Tamaño de OpenAI: `1:1`→`1024x1024`, `4:5`/`9:16`→`1024x1536`, `1.91:1`/`16:9`→`1536x1024`.
- `aspectRatio` de Google: `1:1`→`1:1`, `4:5`→`3:4`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- `aspect_ratio` de Stability: `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- BFL (FLUX): píxeles exactos de `width`/`height` por aspecto (envía y luego consulta la URL del resultado).
- `aspect_ratio` de Replicate (FLUX): `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- `image_size` de fal: `1:1`→`square_hd`, `4:5`→`portrait_4_3`, `9:16`→`portrait_16_9`,
  `1.91:1`/`16:9`→`landscape_16_9`.
- Local: dimensiones de píxel exactas por aspecto.
- agy: mejor esfuerzo — es un _agente_ de imágenes, no un modelo txt2img, por lo que el aspecto/escena solicitados pueden no
  respetarse exactamente. Usa un proveedor en la nube o `local` cuando importe la fidelidad.

### Generación local de imágenes y cambio del modelo (Z‑Image)

El backend local ejecuta [`stable-diffusion.cpp`](https://github.com/leejet/stable-diffusion.cpp)
(`sd-cli`) con **Z‑Image Turbo** de forma predeterminada. Es completamente configurable mediante env — puedes apuntarlo a un
**modelo/backend local diferente** sin tocar código:

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

Para usar una arquitectura diferente (p. ej. un checkpoint SDXL/Flux compatible con stable‑diffusion.cpp),
apunta `SDCPP_ZIMAGE_MODEL`/`_VAE`/`_LLM` a los archivos correctos y ajusta `SDCPP_BACKEND`. Si un modelo
necesita flags de CLI distintos a Z‑Image, consulta "Añadir un nuevo proveedor en código" más abajo para añadir un
`ImageEngine` dedicado.

---

## Añadir un nuevo proveedor en código

Los dos motores son los **únicos puntos de extensión**, cada uno con una interfaz pequeña y un registro central
(un `switch`). Añadir un proveedor = implementar la interfaz + añadir un `case`.

### Proveedor de texto

Interfaz (`server/src/content/engine.ts`):

```ts
export interface ContentEngine {
  name(): string;
  run(prompt: string): Promise<string>; // returns the model's text answer
}
```

1. Impleméntala (HTTP mediante `fetch`, o lanza una CLI). Para proveedores HTTP, sigue
   `server/src/content/engineApi.ts` (p. ej. `OpenAICompatibleEngine`) — ellos
   gestionan el timeout de `AbortController` (`appConfig.engineTimeoutMs`) y lanzan `ContentError` en caso de fallo.
2. Añade cualquier configuración que necesites a `server/src/config.ts` (leída desde env).
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
    prompt: string; // full, styled prompt
    aspect: SceneAspect; // "1:1" | "4:5" | "1.91:1" | "9:16" | "16:9"
    outPath: string; // write the resulting image here (PNG)
    signal?: AbortSignal; // honor cancellation
  }): Promise<string | null>; // outPath on success, null on failure/unavailable
}
```

1. Impleméntalo — consulta `OpenAIImageEngine` / `GoogleImagenImageEngine` para HTTP+base64→archivo, o
   `LocalSdCliImageEngine` para lanzar un binario local. Mapea `aspect` al tamaño/ratio de tu proveedor.
2. Añade configuración a `server/src/config.ts` si hace falta.
3. Regístralo en `createImageEngine()` (`server/src/media/imageEngine.ts`):

```ts
case "myimages":
  return new MyImageEngine({ apiKey: appConfig.myKey, model: appConfig.myImageModel });
```

Las funciones públicas en `server/src/media/imageGen.ts` (`imageGenAvailable`, `generateSceneImage`,
`generateFromPrompt`) delegan automáticamente al motor seleccionado — los llamadores no cambian.

> Consejo: mantén `run()`/`generate()` resilientes — en caso de error/timeout, sal limpiamente (texto: lanza
> `ContentError`; imagen: devuelve `null`) para que la app pueda recurrir al modo alternativo con elegancia.
