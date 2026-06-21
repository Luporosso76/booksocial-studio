# Contribuer à BookSocial Studio

Merci de votre intérêt pour l'amélioration de BookSocial Studio. Il s'agit d'un projet **local-first, source-available** et les contributions sont les bienvenues — corrections de bugs, nouveaux fournisseurs d'IA et documentation.

> **Note sur la licence :** le projet est publié sous la **PolyForm Noncommercial License 1.0.0** (voir
> [`LICENSE`](LICENSE)). Il est *source-available* et non sous une licence OSI "open source" : vous pouvez l'utiliser,
> le modifier et le partager à des fins **non commerciales**, mais **l'utilisation commerciale n'est pas autorisée**. En
> contribuant, vous acceptez que vos contributions soient fournies sous ces mêmes conditions.

---

## Structure du dépôt

```
server/          Backend: Node + TypeScript + Hono, embedded SQLite (better-sqlite3)
  src/content/   Text engine (analysis, canon, post generation) — ContentEngine + createEngine()
  src/media/     Image engine + rendering (Satori/resvg, ffmpeg/Remotion) — ImageEngine + createImageEngine()
  src/scheduler/ Background publish scheduler
  src/services/  Higher-level orchestration (week planning, publishing, page connect)
  src/db/        SQLite schema, pool, repositories
  src/secrets/   Encrypted file store for tokens/keys (secrets.enc)
  src/facebook/  Facebook Graph API client
web/             Frontend: React + Vite + Tailwind
  src/screens/   Top-level screens (Books, Planner, Scheduled, Insights, Connection, Page management, Settings…)
docs/            Documentation (MANUAL, SETUP, PROVIDERS, INSTAGRAM, ARCHITECTURE)
samples/         Sample book to try the app
```

Consultez [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour voir comment ces éléments s'articulent.

---

## Exécution en développement

Prérequis : **Node.js 22 ou 24** (voir `.nvmrc`).

```bash
# Backend (hot reload, tsx watch on :8770)
cd server && npm ci && npm run dev

# Frontend (Vite dev server, separate terminal)
cd web && npm ci && npm run dev
```

Copiez `server/.env.example` vers `server/.env` et configurez au moins un fournisseur de texte — voir
[`docs/SETUP.md`](docs/SETUP.md) et [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

---

## Style de code et vérifications

- **TypeScript partout.** Suivez les modèles existants ; gardez les modifications petites et ciblées.
- **Gardez les types au vert.** Avant d'ouvrir une PR :

```bash
# Backend
cd server && npm run typecheck   # tsc --noEmit, must be clean

# Frontend
cd web && npm run build          # tsc -b && vite build, must succeed
```

- Respectez le nommage existant, la gestion des erreurs (les moteurs de texte lancent `ContentError` ; les moteurs d'image retournent `null` en cas d'échec), et les conventions d'importation dans le fichier que vous modifiez.
- Ne commitez pas les secrets, le dossier de données, ou les fichiers de build (`web/dist`, `node_modules`).

---

## Ajout d'un nouveau fournisseur d'IA

Les moteurs de texte et d'image sont les deux points d'extension du projet, chacun avec une petite interface et un registre `switch` centralisé. Ajouter un fournisseur implique d'implémenter l'interface et d'ajouter un `case` — aucune modification n'est nécessaire du côté de l'appelant.

- **Fournisseur de texte :** implémentez `ContentEngine` et enregistrez-le dans `createEngine()`
  (`server/src/content/engine.ts`).
- **Fournisseur d'image :** implémentez `ImageEngine` et enregistrez-le dans `createImageEngine()`
  (`server/src/media/imageEngine.ts`).

Ajoutez toute nouvelle configuration dans `server/src/config.ts` (lue depuis l'environnement) et documentez les variables d'environnement dans `server/.env.example`. Guide complet avec code d'exemple : **[`docs/PROVIDERS.md`](docs/PROVIDERS.md)
→ "Add a new provider in code".**

---

## Proposer des modifications (Pull Requests)

1. Forkez et créez une branche thématique (`fix/...`, `feat/...`, `docs/...`).
2. Effectuez votre modification avec le plus petit diff viable.
3. Exécutez les vérifications ci-dessus (typecheck, build web) et vérifiez localement.
4. Ouvrez une PR en utilisant le [modèle de PR](.github/PULL_REQUEST_TEMPLATE.md) ; liez l'issue associée et décrivez comment vous avez testé.

Pour les bugs et les idées, ouvrez d'abord une issue en utilisant les modèles [rapport de bug](.github/ISSUE_TEMPLATE/bug_report.md) ou [demande de fonctionnalité](.github/ISSUE_TEMPLATE/feature_request.md).

---

## Signaler des problèmes de sécurité ou de tokens

Si une modification risque de faire fuiter des tokens ou des clés, n'incluez **pas** de vrais secrets dans l'issue. Décrivez le problème et les étapes pour le reproduire avec des valeurs fictives.
