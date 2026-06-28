# Fournisseurs IA — configurer et étendre

BookSocial Studio utilise **deux moteurs IA indépendants et enfichables** :

- **Moteur de texte** (`ContentEngine`) — analyse, canon, texte des publications. Sélectionné par `CONTENT_PROVIDER`.
- **Moteur d’images** (`ImageEngine`) — images de scènes IA. Sélectionné par `IMAGE_PROVIDER`.

Le moteur de **texte** passe par des **outils CLI** avec abonnement auxquels vous vous connectez, ou par un serveur Ollama **local**. Le moteur d’**images** ajoute des fournisseurs cloud avec **clé API** et un backend GPU **local**. Ainsi, chacun peut exécuter l’application de la manière qui lui convient :

| Modèle d’accès             | Paiement / authentification                    | Utilisé par                                                              |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| **Abonnement / connexion** | votre forfait existant, via un outil CLI local | texte : opencode, Codex, Claude, agy (Gemini) · images : agy             |
| **Clé API**                | au jeton, avec votre clé fournisseur           | images : OpenAI, Google, Stability, Black Forest Labs, Replicate, fal.ai |
| **Local / gratuit**        | s’exécute sur votre machine, sans clé          | texte : Ollama · images : sd‑cli/Z‑Image                                 |

Toute la configuration se fait via des variables d’environnement — voir [`server/.env.example`](../server/.env.example).

---

## Moteur de texte (`CONTENT_PROVIDER`)

La valeur par défaut est `none` (non défini) — choisissez un fournisseur dans **Settings → AI** ou définissez `CONTENT_PROVIDER` ici.

| `CONTENT_PROVIDER` | Moteur                              | Authentification         | Variables d’env clés                |
| ------------------ | ----------------------------------- | ------------------------ | ----------------------------------- |
| `opencode`         | CLI local                           | connexion par abonnement | `OPENCODE_BINARY`, `OPENCODE_MODEL` |
| `codex`            | CLI local (ChatGPT / OpenAI)        | connexion par abonnement | `CODEX_BINARY`, `CODEX_MODEL`       |
| `claude`           | CLI local (Claude Code / Anthropic) | connexion par abonnement | `CLAUDE_BINARY`, `CLAUDE_MODEL`     |
| `agy`              | CLI local (Gemini / Antigravity)    | connexion par abonnement | `AGY_BINARY`                        |
| `ollama`           | HTTP local                          | aucune                   | `OLLAMA_BASE_URL`, `OLLAMA_MODEL`   |

> Le moteur de texte passe par des **outils CLI auxquels vous vous connectez** ou par un serveur Ollama **local** — il n’y a pas
> de mode API HTTP au jeton pour le texte (les CLI couvrent déjà les comptes OpenAI, Anthropic et Google).
> Modèles par défaut : `codex` → `gpt-5.5`; `claude` → `opus`/`sonnet`/`haiku`/`fable`; `opencode`/`agy`/`ollama`
> lisent la liste depuis l’outil. Tous sont modifiables dans **Settings → AI** — rien n’est codé en dur.

**Abonnement via CLI** — si vous payez déjà pour ChatGPT, Claude ou un forfait Gemini, utilisez l’outil
CLI correspondant : l’application ne fait que l’exécuter (par ex. `opencode run -m <model>`, `codex exec …`, `claude -p …`,
`agy --model <model> --print …`) et l’outil gère l’authentification avec votre compte. Vous pouvez déclencher la
connexion depuis **Settings → AI** avec le bouton **Authenticate**. La configuration propre de l’outil (modèles)
se trouve dans la configuration de cet outil, pas dans cette application.

**Local et gratuit** — exécutez [Ollama](https://ollama.com) et pointez l’application vers lui :

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

---

## Moteur d’images (`IMAGE_PROVIDER`)

| `IMAGE_PROVIDER`      | Moteur                                              | Authentification                          | Variables d’env clés                                                     |
| --------------------- | --------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| `auto` _(par défaut)_ | local si disponible, sinon téléversement uniquement | —                                         | (bascule automatiquement)                                                |
| `local`               | sd‑cli (stable‑diffusion.cpp)                       | aucune, GPU local                         | `SDCPP_*` (voir ci-dessous)                                              |
| `agy`                 | agent d’image Gemini (CLI)                          | connexion par abonnement                  | `AGY_BINARY`, `AGY_IMAGE_MODEL` (par défaut `Gemini 3.5 Flash (Medium)`) |
| `openai`              | API OpenAI Images                                   | `OPENAI_API_KEY`                          | `OPENAI_IMAGE_MODEL` (par ex. `gpt-image-1`)                             |
| `google`              | API Google Imagen                                   | `GOOGLE_API_KEY`                          | `GOOGLE_IMAGE_MODEL` (par ex. `imagen-3.0-generate-002`)                 |
| `stability`           | Stability AI (Stable Image)                         | `STABILITY_API_KEY`                       | `STABILITY_IMAGE_MODEL` (par ex. `core`, `sd3`, `ultra`)                 |
| `bfl`                 | Black Forest Labs (FLUX)                            | `BFL_API_KEY`                             | `BFL_IMAGE_MODEL` (par ex. `flux-dev`, `flux-pro-1.1`)                   |
| `replicate`           | Replicate (n’importe quel modèle `owner/name`)      | `REPLICATE_API_TOKEN`                     | `REPLICATE_IMAGE_MODEL` (par ex. `black-forest-labs/flux-schnell`)       |
| `fal`                 | fal.ai                                              | `FAL_API_KEY`                             | `FAL_IMAGE_MODEL` (par ex. `fal-ai/flux/schnell`)                        |
| `none`                | téléversement uniquement (pas de génération)        | —                                         | —                                                                        |

> **Les clés sont propres à chaque fournisseur (compte).** Les fournisseurs d’images `openai`/`google` utilisent `OPENAI_API_KEY` / `GOOGLE_API_KEY` (la clé de votre compte OpenAI / Google). Les quatre fournisseurs d’images dédiés
> (`stability`, `bfl`, `replicate`, `fal`) sont réservés aux images et chacun nécessite sa **propre** clé.

Lorsqu’aucun moteur d’images n’est disponible, l’application reste pleinement utilisable en mode **téléversement uniquement** — vous fournissez
les images, tout le reste (texte, planification, publication) fonctionne.

**Correspondance des formats** (l’application utilise 1:1, 4:5, 9:16, 1.91:1, 16:9) :

- Taille OpenAI : `1:1`→`1024x1024`, `4:5`/`9:16`→`1024x1536`, `1.91:1`/`16:9`→`1536x1024`.
- `aspectRatio` Google : `1:1`→`1:1`, `4:5`→`3:4`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- `aspect_ratio` Stability : `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- BFL (FLUX) : pixels exacts `width`/`height` selon le format (soumettez puis interrogez l’URL du résultat).
- `aspect_ratio` Replicate (FLUX) : `1:1`→`1:1`, `4:5`→`4:5`, `9:16`→`9:16`, `1.91:1`/`16:9`→`16:9`.
- `image_size` fal : `1:1`→`square_hd`, `4:5`→`portrait_4_3`, `9:16`→`portrait_16_9`,
  `1.91:1`/`16:9`→`landscape_16_9`.
- Local : dimensions exactes en pixels selon le format.
- agy : au mieux — c’est un _agent_ d’image, pas un modèle txt2img, donc le format/la scène demandés peuvent ne pas
  être respectés exactement. Utilisez un fournisseur cloud ou `local` lorsque la fidélité est importante.

### Génération d’images locale et remplacement du modèle (Z‑Image)

Le backend local exécute [`stable-diffusion.cpp`](https://github.com/leejet/stable-diffusion.cpp)
(`sd-cli`) avec **Z‑Image Turbo** par défaut. Il est entièrement configurable via les variables d’environnement — vous pouvez le faire pointer vers un
**modèle/backend local différent** sans toucher au code :

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

Pour utiliser une architecture différente (par ex. un checkpoint SDXL/Flux pris en charge par stable‑diffusion.cpp),
faites pointer `SDCPP_ZIMAGE_MODEL`/`_VAE`/`_LLM` vers les bons fichiers et ajustez `SDCPP_BACKEND`. Si un modèle
nécessite des options CLI différentes de Z‑Image, voir « Ajouter un nouveau fournisseur dans le code » ci-dessous pour ajouter un
`ImageEngine` dédié.

---

## Ajouter un nouveau fournisseur dans le code

Les deux moteurs sont les **seuls points d’extension**, chacun avec une petite interface et un registre central
(un `switch`). Ajouter un fournisseur = implémenter l’interface + ajouter un `case`.

### Fournisseur de texte

Interface (`server/src/content/engine.ts`) :

```ts
export interface ContentEngine {
  name(): string;
  run(prompt: string): Promise<string>; // returns the model's text answer
}
```

1. Implémentez-la (HTTP via `fetch`, ou lancement d’un CLI). Pour les fournisseurs HTTP, suivez
   `server/src/content/engineApi.ts` (par ex. `OpenAICompatibleEngine`) — ils
   gèrent le délai d’expiration `AbortController` (`appConfig.engineTimeoutMs`) et lèvent `ContentError` en cas d’échec.
2. Ajoutez toute configuration nécessaire à `server/src/config.ts` (lue depuis l’environnement).
3. Enregistrez-le dans `createEngine()` (`server/src/content/engine.ts`) :

```ts
case "myprovider":
  return new MyEngine({ apiKey: appConfig.myKey, model: appConfig.myModel });
```

### Fournisseur d’images

Interface (`server/src/media/imageEngine.ts`) :

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

1. Implémentez-le — voir `OpenAIImageEngine` / `GoogleImagenImageEngine` pour HTTP+base64→fichier, ou
   `LocalSdCliImageEngine` pour le lancement d’un binaire local. Mappez `aspect` vers la taille/le ratio de votre fournisseur.
2. Ajoutez la configuration à `server/src/config.ts` si nécessaire.
3. Enregistrez-le dans `createImageEngine()` (`server/src/media/imageEngine.ts`) :

```ts
case "myimages":
  return new MyImageEngine({ apiKey: appConfig.myKey, model: appConfig.myImageModel });
```

Les fonctions publiques dans `server/src/media/imageGen.ts` (`imageGenAvailable`, `generateSceneImage`,
`generateFromPrompt`) délèguent automatiquement au moteur sélectionné — les appelants ne changent pas.

> Astuce : gardez `run()`/`generate()` résilients — en cas d’erreur/délai dépassé, retournez proprement (texte : lever
> `ContentError`; image : retourner `null`) afin que l’application puisse se rabattre proprement.
