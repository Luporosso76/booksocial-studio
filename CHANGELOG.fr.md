# Changelog

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
et ce projet respecte le [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-20

Première version publique, auto-hébergeable.

### Ajouté

- Image **Docker** à conteneur unique (backend + frontend compilé) et configuration `docker compose`.
- **Analyse de livre & bible visuelle** : import d'un livre Markdown, extraction du profil et des personnages, et construction d'un canon par livre (apparence, tenues, accessoires, personnages secondaires, fiches de scène par chapitre).
- **Génération de contenu** vers un planning hebdomadaire : posts, Reels et Stories avec citations, hashtags et liens ; la logique de recherche d'idées et d'humanisation est intégrée dans les prompts, afin de fonctionner sur n'importe quel fournisseur.
- **Planification & publication** sur **Facebook** (planification native pour les posts ; un planificateur interne pour les Reels/Stories) et **Instagram** (Reels/Stories vers des comptes Instagram Business liés).
- **Gestion Facebook & Instagram** : posts, commentaires, paramètres de page et statistiques de compte, avec un onglet Facebook/Instagram affiché lorsqu'une Page possède un compte Instagram lié.
- **Fournisseurs d'IA modulaires** : clés API (OpenAI, Anthropic, Google, tout point d'accès compatible OpenAI, Ollama local) ou CLI d'abonnement (opencode, Codex, Gemini) avec un flux Authenticate ; moteurs d'images modulaires (`sd-cli` local, OpenAI, Google, Stability, Black Forest Labs/FLUX, Replicate, fal.ai) avec une solution de repli par upload uniquement.
- Écran **Settings** ; secrets conservés chiffrés au repos dans `secrets.enc` (AES-256-GCM).
- **i18n (IT/EN)** pour l'UI web, avec détection et changement de langue.
- **Basic Auth optionnelle** pour protéger l'application lors de l'auto-hébergement.
- **Documentation** : manuel d'utilisation, configuration, fournisseurs d'IA, Instagram, architecture et contribution.

[0.1.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.1.0
