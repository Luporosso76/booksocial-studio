# Changelog

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
et ce projet respecte le [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-23

### Ajouté

- **Instructions de prompt supplémentaires modifiables** (Paramètres) : texte libre ajouté aux prompts de texte et d'image, à la fois globaux et par livre, en plus du noyau conçu (les règles de base ne sont jamais remplacées).
- **Tableau de bord** : un **calendrier** hebdomadaire + mensuel de contenu planifié avec des couleurs par livre, des KPI compacts par page (Facebook + Instagram), et une carte d'activité en arrière-plan avec progression et minuteurs en direct.
- **Fournisseurs d'IA orientés CLI** : génération de texte et d'images via des CLI sur abonnement (opencode, Codex, Gemini) aux côtés des clés API, avec un fournisseur/modèle de secours dédié et un panneau de paramètres d'IA à quatre onglets.
- **Onglets de format d'image** (vertical 9:16 / carré / horizontal) avec le décompte dans la bibliothèque d'images d'un livre.
- Action de **ré-indexation NLP rapide** : ré-extraire les citations réelles sans relancer l'analyse complète.
- Champ **moment clé** sur les fiches de scène par chapitre, utilisé pour ancrer le sujet de l'image.
- Interface utilisateur et documentation en **cinq langues** (IT/EN/FR/ES/DE).

### Modifié

- **Moins de répétitions** : les posts, reels et stories sélectionnent désormais les citations, images, musiques et chapitres les moins récemment utilisés au fil des exécutions, de sorte que les plans hebdomadaires consécutifs et les régénérations parcourent l'ensemble du matériel au lieu de le répéter.
- **Prompts IA réécrits en anglais**, tandis que le résultat généré reste toujours dans la langue du livre.
- **Canon visuel plus précis** : l'apparence et les tenues des personnages sont basées sur de réels passages du livre, avec un ancrage par ethnie/pays/époque et des mots-clés de vêtements tirés du vocabulaire réel du livre.
- Une passe supplémentaire d'**humanisation anti-IA** sur les posts générés, appliquée dans la langue de sortie.

### Corrigé

- Supprimer un brouillon libère désormais immédiatement ses citations, images, musiques et chapitres pour réutilisation.
- Les posts Facebook programmés nativement sont réconciliés en "publiés" après leur heure programmée (plus aucune entrée bloquée comme "programmée dans le passé").
- Les posts publiés peuvent être masqués du tableau de bord sans les supprimer.

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

[0.2.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.2.0
[0.1.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.1.0
