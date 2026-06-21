# Fournisseurs d'IA — configuration & extension

BookSocial Studio utilise **deux moteurs d'IA indépendants et modulaires** :

- **Moteur de texte** (`ContentEngine`) — analyse, canon, texte de post. Sélectionné par `CONTENT_PROVIDER`.
- **Moteur d'image** (`ImageEngine`) — images de scène IA. Sélectionné par `IMAGE_PROVIDER`.

Les deux prennent en charge trois modèles d'accès, afin que chacun puisse exécuter l'application comme il le souhaite :

| Modèle d'accès | Mode de paiement / authentification | Exemples |
|---|---|---|
| **Clé API** | par token, votre clé fournisseur | OpenAI, Anthropic, Google, OpenRouter, Groq… |
| **Abonnement / login** | votre forfait existant, via un outil CLI local | opencode, Codex (ChatGPT), Gemini (Google) |
| **Local / gratuit** | s'exécute sur votre machine, sans clé | Ollama (texte), sd‑cli/Z‑Image (images) |

Toute la configuration se fait via des variables d'environnement — voir [`server/.env.example`](../server/.env.example).

---

## Moteur de texte (`CONTENT_PROVIDER`)

La valeur par défaut est `none` (non défini) — choisissez un fournisseur dans **Paramètres → IA** ou définissez `CONTENT_PROVIDER` ici.

| `CONTENT_PROVIDER` | Moteur | Auth | Variables d'environnement clés |
|---|---|---|---|
| `opencode` | CLI local | login d'abonnement | `OPENCODE_BINARY`, `OPENCODE_MODEL` |
| `codex` | CLI local (ChatGPT) | login d'abonnement | `CODEX_BINARY`, `CODEX_MODEL` |
| `gemini` | CLI local (Google) | login d'abonnement | `GEMINI_BINARY`, `GEMINI_CLI_MODEL` |
| `openai` | API HTTP | `OPENAI_API_KEY` | `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| `openai-compatible` (= `compatible`) | API HTTP | `OPENAI_API_KEY` | `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| `anthropic` | API HTTP | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| `google` | API HTTP | `GOOGLE_API_KEY` | `GOOGLE_MODEL`, `GOOGLE_BASE_URL` |
| `ollama` | HTTP local | aucun | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |

**Tout endpoint compatible OpenAI** (OpenRouter, Groq, Together, LM Studio, vLLM, …) fonctionne avec un seul paramètre — pointez `OPENAI_BASE_URL` vers celui-ci :

```bash
CONTENT_PROVIDER=openai-compatible
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-...
OPENAI_MODEL=meta-llama/llama-3.1-70b-instruct
```

**Abonnement via CLI** — si vous payez déjà pour ChatGPT ou un forfait Google, utilisez l'outil CLI correspondant : l'application l'exécute simplement (par ex. `opencode run --pure -m <model>`, `codex exec …`, `gemini -p …`) et l'outil gère l'authentification avec votre compte. Vous pouvez déclencher le login depuis **Paramètres → IA** avec le bouton **Authentifier**. La propre configuration de l'outil (modèles) réside dans la configuration de cet outil, pas dans cette application. opencode est invoqué avec `--pure` (sans plugins externes) pour une sortie reproductible.

**Local & gratuit** — exécutez [Ollama](https://ollama.com) et pointez l'application vers lui :

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

---

## Moteur d'image (`IMAGE_PROVIDER`)

| `IMAGE_PROVIDER` | Moteur | Auth | Variables d'environnement clés |
|---|---|---|---|
| `auto` *(défaut)* | local si disponible, sinon upload uniquement | — | (repli automatique) |
| `local` | sd‑cli (stable‑diffusion.cpp) | aucun, GPU local | `SDCPP_*` (voir ci-dessous) |
| `openai` | OpenAI Images API | `OPENAI_API_KEY` (partagée avec le texte) | `OPENAI_IMAGE_MODEL` (par ex. `gpt-image-1`) |
| `google` | Google Imagen API | `GOOGLE_API_KEY` (partagée avec le texte) | `GOOGLE_IMAGE_MODEL` (par ex. `imagen-3.0-generate-002`) |
| `stability` | Stability AI (Stable Image) | `STABILITY_API_KEY` | `STABILITY_IMAGE_MODEL` (par ex. `core`, `sd3`, `ultra`) |
| `bfl` | Black Forest Labs (FLUX) | `BFL_API_KEY` | `BFL_IMAGE_MODEL` (par ex. `flux-dev`, `flux-pro-1.1`) |
| `replicate` | Replicate (tout modèle `owner/name`) | `REPLICATE_API_TOKEN` | `REPLICATE_IMAGE_MODEL` (par ex. `black-forest-labs/flux-schnell`) |
| `fal` | fal.ai | `FAL_API_KEY` | `FAL_IMAGE_MODEL` (par ex. `fal-ai/flux/schnell`) |
| `none` | upload uniquement (pas de génération) | — | — |

> **Les clés sont par fournisseur (compte).** Les images `openai`/`google` **réutilisent la même clé que le moteur de texte** (`OPENAI_API_KEY` / `GOOGLE_API_KEY`). Les quatre fournisseurs d'images dédiés (`stability`, `bfl`, `replicate`, `fal`) sont uniquement pour l'image et chacun nécessite sa **propre** clé.

Lorsqu'aucun moteur d'image n'est disponible, l'application reste entièrement utilisable en mode **upload uniquement** — vous fournissez les images, tout le reste (texte, planification, publication) fonctionne.

**Mapping des ratios** (l'application utilise 1:1, 4:5, 9:16, 1.91:1, 16:9) :

- Taille OpenAI : `1:1`→`1024x1024`, `4:5`/`9:16`→`1024x1536`, `1.91:1`/`16:9`→`1536x1024`.
- Google `aspectRatio` : `1:1`→`1:1`, `4:5`→`3:4`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- Stability `aspect_ratio` : `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- BFL (FLUX) : pixels exacts `width`/`height` par ratio (soumettez puis interrogez pour l'URL de résultat).
- Replicate (FLUX) `aspect_ratio` : `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- fal `image_size` : `1:1`→`square_hd`, `4:5`→`portrait_4_3`, `9:16`→`portrait_16_9`, `1.91:1`/`16:9`→`landscape_16_9`.
- Local : dimensions exactes en pixels par ratio.

### Génération d'image locale & changement du modèle (Z‑Image)

Le backend local exécute [`stable-diffusion.cpp`](https://github.com/leejet/stable-diffusion.cpp) (`sd-cli`) avec **Z‑Image Turbo** par défaut. Il est entièrement configurable via l'environnement — vous pouvez le faire pointer vers un **modèle/backend local différent** sans toucher au code :

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

Pour utiliser une architecture différente (par ex. un checkpoint SDXL/Flux pris en charge par stable‑diffusion.cpp), pointez `SDCPP_ZIMAGE_MODEL`/`_VAE`/`_LLM` vers les bons fichiers et ajustez `SDCPP_BACKEND`. Si un modèle a besoin de flags CLI différents de Z‑Image, consultez "Ajouter un nouveau fournisseur dans le code" ci-dessous pour ajouter un `ImageEngine` dédié.

---

## Ajouter un nouveau fournisseur dans le code

Les deux moteurs sont les **seuls points d'extension**, chacun avec une petite interface et un registre central (un `switch`). Ajouter un fournisseur = implémenter l'interface + ajouter un `case`.

### Fournisseur de texte

Interface (`server/src/content/engine.ts`) :

```ts
export interface ContentEngine {
  name(): string;
  run(prompt: string): Promise<string>; // returns the model's text answer
}
```

1. Implémentez-la (HTTP via `fetch`, ou lancez un CLI). Pour les fournisseurs HTTP, suivez `server/src/content/engineApi.ts` (par ex. `OpenAICompatibleEngine`, `GoogleGeminiEngine`) — ils gèrent le timeout `AbortController` (`appConfig.engineTimeoutMs`) et lèvent une `ContentError` en cas d'échec.
2. Ajoutez toute configuration nécessaire à `server/src/config.ts` (lue depuis l'environnement).
3. Enregistrez-la dans `createEngine()` (`server/src/content/engine.ts`) :

```ts
case "myprovider":
  return new MyEngine({ apiKey: appConfig.myKey, model: appConfig.myModel });
```

### Fournisseur d'image

Interface (`server/src/media/imageEngine.ts`) :

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

1. Implémentez-la — voir `OpenAIImageEngine` / `GoogleImagenImageEngine` pour HTTP+base64→fichier, ou `LocalSdCliImageEngine` pour lancer un binaire local. Mappez `aspect` à la taille/au ratio de votre fournisseur.
2. Ajoutez la configuration à `server/src/config.ts` si nécessaire.
3. Enregistrez-la dans `createImageEngine()` (`server/src/media/imageEngine.ts`) :

```ts
case "myimages":
  return new MyImageEngine({ apiKey: appConfig.myKey, model: appConfig.myImageModel });
```

Les fonctions publiques dans `server/src/media/imageGen.ts` (`imageGenAvailable`, `generateSceneImage`, `generateFromPrompt`) délèguent automatiquement au moteur sélectionné — les appelants ne changent pas.

> Astuce : gardez `run()`/`generate()` résilients — en cas d'erreur/timeout, retournez proprement (texte : levez `ContentError` ; image : retournez `null`) pour que l'application puisse utiliser une solution de repli de manière fluide.
