# Testé sur notre matériel

## Aperçu

Il s'agit de la machine de référence et de la configuration que les mainteneurs ont utilisées pour développer et tester BookSocial Studio. Vos résultats peuvent varier, en particulier pour la génération locale d'images.

## Spécifications de la machine

| Composant | Configuration testée |
| --- | --- |
| Système d'exploitation | Ubuntu 26.04 LTS |
| Noyau | Linux 7.0 |
| CPU | AMD Ryzen 7 6800H, 8 cœurs / 16 threads |
| RAM | 26 Gio |
| GPU | iGPU AMD Radeon 680M intégré, RDNA2 "Rembrandt" |
| Pilote GPU/API | Vulkan via RADV |
| GPU dédié | Aucun |
| Environnement d'exécution | Node.js, le service s'exécute sur v24, builds sur v22 |
| Base de données | SQLite, fichier unique |

Les étapes d'installation sont documentées séparément dans [SETUP.md](./SETUP.md).

## Génération locale d'images

### Résumé de la configuration

Les images de scènes de livres ont été générées sur l'appareil avec `sd-cli` de `stable-diffusion.cpp`, en exécutant Z-Image-Turbo sur l'iGPU AMD Radeon 680M intégré via Vulkan.

La répartition testée était :

| Composant | Appareil |
| --- | --- |
| Encodeur de texte | CPU |
| VAE | CPU |
| Diffusion | GPU intégré via `vulkan0` |

Le paramètre par défaut du backend était :

```bash
SDCPP_BACKEND="te=cpu,vae=cpu,diffusion=vulkan0"
```

La génération s'exécute en série : une image à la fois sur un seul iGPU.

La configuration d'échantillonnage testée était :

| Paramètre | Valeur |
| --- | --- |
| Étapes | 8 |
| Échelle CFG | 1.0 |
| Échantillonneur | Euler |
| Flash attention | Activé |
| Déchargement vers CPU | Activé, pour tenir dans la mémoire iGPU |

### Fichiers du modèle

| Objectif | Fichier |
| --- | --- |
| Modèle de diffusion | `z_image_turbo-Q8_0.gguf` |
| LLM de l'encodeur de texte | `qwen_3_4b-Q8_0.gguf` |
| VAE | `ae_bf16.safetensors` |

### Variables d'environnement

| Variable | Objectif |
| --- | --- |
| `SDCPP_DIR` | Pointer vers un répertoire `stable-diffusion.cpp` personnalisé |
| `SDCPP_CLI` | Pointer vers un binaire `sd-cli` personnalisé |
| `SDCPP_BACKEND` | Modifier la répartition du backend |
| `SDCPP_ZIMAGE_DIR` | Pointer vers le répertoire du modèle Z-Image |
| `SDCPP_ZIMAGE_MODEL` | Pointer vers le fichier du modèle de diffusion |
| `SDCPP_ZIMAGE_LLM` | Pointer vers le fichier LLM de l'encodeur de texte |
| `SDCPP_ZIMAGE_VAE` | Pointer vers le fichier VAE |
| `SDCPP_TIMEOUT_MS` | Délai d'attente de la génération d'images ; la valeur par défaut est de 15 minutes |
| `IMAGEGEN_ENABLED` | Définir sur `false` pour forcer le mode téléchargement uniquement |

### Performances

Sur ce GPU intégré, la génération d'une image 1024x1024 prend environ 11 minutes.

C'est lent car la machine n'a pas de GPU dédié. Un GPU dédié serait beaucoup plus rapide, et les fournisseurs d'images cloud sont presque instantanés en comparaison.

### Comment changer de modèle ou de moteur

L'implémentation du moteur d'images local se trouve dans :

```text
server/src/media/imageEngine.ts
```

Cherchez :

```text
LocalSdCliImageEngine
```

Le guide générique sur les fournisseurs se trouve dans [PROVIDERS.md](./PROVIDERS.md).

## Fournisseur de texte IA

Pendant les tests, les mainteneurs ont utilisé `opencode`, la CLI d'abonnement, comme fournisseur de texte IA.

La logique post-génération est intégrée directement dans les prompts : BookSocial Studio demande au fournisseur de trouver l'idée autonome la plus forte dans un chapitre, puis de l'humaniser. Comme cette logique est en ligne, elle fonctionne avec n'importe quel fournisseur sans installer de compétences supplémentaires.

## Ce que nous avons testé de bout en bout

Les flux suivants ont été testés de bout en bout sur la machine de référence :

| Domaine | Flux testé |
| --- | --- |
| Importation de livre | Importation du livre d'exemple inclus et des propres livres des mainteneurs |
| Bible visuelle | Exécution de l'analyse complète de la bible visuelle : apparence des personnages, cartes de scènes de chapitres, tenues, accessoires, personnages secondaires et présence des personnages |
| Images locales | Génération de lots d'images de scènes de romans graphiques localement |
| Comptes sociaux | Connexion de deux pages Facebook et de leurs comptes Instagram Business liés |
| Publication | Planification et publication de Reels et de Stories sur Facebook et Instagram en direct |

## Ce qu'il faut retenir pour votre propre matériel

Utilisez un GPU dédié ou un fournisseur d'images cloud si vous souhaitez une génération d'images rapide.

BookSocial Studio fonctionne également très bien sans GPU local en mode téléchargement uniquement. Définissez :

```bash
IMAGEGEN_ENABLED=false
```

Tout est léger, à l'exception de la génération locale d'images. La principale charge de travail sensible au matériel est la génération d'images localement sur l'appareil.
