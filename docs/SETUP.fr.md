# Guide d'installation

Ceci est un guide étape par étape pour installer **BookSocial Studio** et transformer votre premier livre en contenu pour les réseaux sociaux. Aucune expérience préalable en développement n'est requise — copiez les commandes telles qu'elles sont écrites.

BookSocial Studio fonctionne **localement sur votre propre machine**. Vos livres, images et tokens restent sur votre ordinateur dans une base de données SQLite locale.

> Les captures d'écran de ce guide sont des espaces réservés marqués **TODO screenshot** — elles seront ajoutées plus tard.

---

## 1. Prérequis

Vous avez besoin de **l'un** des éléments suivants :

- **Docker** (recommandé pour un démarrage facile) — [installer Docker](https://docs.docker.com/get-docker/), ou
- **Node.js 22 ou 24** pour une installation manuelle (testé sur les deux en CI ; `.nvmrc` fixe la version 24).

Pour publier sur Facebook, vous aurez également besoin de (plus tard, optionnel au début) :

- Une **Page Facebook** et un compte **Meta Business**.
- Votre propre **application Meta** (création gratuite sur [developers.facebook.com](https://developers.facebook.com)).

Vous pouvez explorer toute l'application (importer un livre, générer du contenu, rendre des vidéos) **sans** Facebook.

---

## 2. Démarrage rapide

### Option A — Docker (recommandé)

```bash
git clone <your-fork-url> booksocial-studio
cd booksocial-studio
cp server/.env.example server/.env   # edit later if needed
docker compose up -d --build
```

Ensuite, ouvrez **http://localhost:8771**. Vos données sont conservées dans le dossier `./data` à côté du projet.

> Remarque : la **génération d'images** par IA locale (GPU) n'est pas disponible dans Docker. Dans le conteneur, l'application fonctionne en mode **upload-only** pour les images, ou vous pouvez la configurer vers un fournisseur d'images cloud (voir étape 4).

![Accueil BookSocial Studio](docs/img/home.png)
*TODO screenshot*

### Option B — Manuel (Node)

```bash
git clone <your-fork-url> booksocial-studio
cd booksocial-studio
cp server/.env.example server/.env   # edit later if needed

# Build the frontend once
cd web && npm ci && npm run build

# Build and start the server (serves the API + the built frontend on :8770)
cd ../server && npm ci && npm run build && npm run start:prod
```

Ouvrez **http://localhost:8770**.

> Si vous changez de version de Node, le module natif de la base de données peut nécessiter une recompilation :
> `cd server && npm rebuild better-sqlite3`.

Pour le développement actif (hot reload), exécutez `npm run dev` dans `server/` et `web/` à la place — voir [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## 3. Choisir et configurer un fournisseur de texte IA

BookSocial Studio utilise un **moteur de texte** IA pour analyser votre livre et écrire les publications. Vous choisissez un fournisseur en configurant `CONTENT_PROVIDER` dans `server/.env`. La valeur par défaut est `none`. Le moteur de texte fonctionne via un outil **CLI** sous abonnement auquel vous vous connectez, ou un serveur **Ollama** local — il n'y a pas de mode API HTTP au jeton pour le texte. Référence complète : [`docs/PROVIDERS.md`](PROVIDERS.md).

### Utiliser un abonnement existant (CLI)

Si vous payez déjà pour ChatGPT, Claude ou un forfait Gemini, l'application peut piloter l'outil CLI correspondant (`opencode`, `codex`, `claude`, `agy`) qui gère l'authentification avec votre compte — configurez `CONTENT_PROVIDER` en conséquence, ou connectez-vous depuis les **Settings → AI** de l'application avec le bouton **Authenticate**. Voir [`docs/PROVIDERS.md`](PROVIDERS.md).

```bash
CONTENT_PROVIDER=codex   # ou opencode | claude | agy
```

### Démarrer avec Ollama (local & gratuit, sans clé)

Installez [Ollama](https://ollama.com), téléchargez un modèle (`ollama pull llama3.1`), puis :

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

> Vous pouvez également choisir le fournisseur plus tard depuis l'écran **Settings → AI** de l'application.

Redémarrez le serveur après avoir modifié `server/.env`.

---

## 4. Images : avec ou sans GPU

Les images de scènes par IA sont **optionnelles**. Le moteur d'images est sélectionné par `IMAGE_PROVIDER` :

- **Pas de GPU ?** Utilisez un fournisseur cloud — `IMAGE_PROVIDER=openai` ou `IMAGE_PROVIDER=google` (ceux-ci utilisent `OPENAI_API_KEY` / `GOOGLE_API_KEY`, la clé de votre compte OpenAI / Google pour les images).
- **Aucun fournisseur d'images du tout ?** Laissez-le sur la valeur par défaut `auto` (ou définissez `none`). L'application fonctionne en mode **upload-only** : vous fournissez les images, et tout le reste (texte, planification, publication) fonctionne.
- **Vous avez un GPU local ?** Définissez `IMAGE_PROVIDER=local` (stable-diffusion.cpp / Z-Image). Ceci n'est **pas** disponible dans Docker — utilisez une installation manuelle.

Détails et changement de modèles : [`docs/PROVIDERS.md`](PROVIDERS.md).

---

## 5. Connecter Facebook (optionnel)

La publication sur une Page Facebook nécessite **votre propre application Meta** et un **token d'accès de page** (page access token). L'application ne demande jamais votre mot de passe Facebook — vous collez un token que vous générez vous-même.

Vous aurez besoin d'une **Page Facebook** et d'un compte **Meta Business**.

### 5.1 Créer une application Meta

1. Allez sur [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
2. Choisissez une application de type **Business** et liez-la à votre portefeuille Business.

### 5.2 Créer un token d'Utilisateur Système dans Business Suite

1. Ouvrez **Meta Business Suite** → **Settings** → **Business settings** → **Users → System users**.
2. Créez (ou sélectionnez) un **Utilisateur Système** (System User) et **Add assets** → assignez votre **Page** avec le contrôle total.
3. Cliquez sur **Generate new token**, sélectionnez votre application, et accordez les permissions de page ci-dessous.
4. Copiez le token généré (une longue chaîne de caractères). Un token d'**Utilisateur Système** a une longue durée de vie — gardez-le privé.

Permissions typiques à accorder :

- `pages_show_list` — lister les Pages que vous gérez.
- `pages_read_engagement` — lire le contenu/l'engagement de la Page.
- `pages_manage_posts` — créer et publier des posts sur la Page.

> L'application lit/met également à jour certaines métadonnées de la Page, ce qui peut nécessiter `pages_manage_metadata`. Si une action sur la Page échoue avec une erreur de permissions, ajoutez le scope manquant et régénérez le token.

### 5.3 Coller le token dans l'application

1. Dans BookSocial Studio, ouvrez l'écran **Connection**.
2. Collez votre token d'Utilisateur Système dans le champ du token et confirmez.
3. L'application appelle Facebook pour lister les Pages que vous gérez et vous permet d'en connecter une.

Votre token est sauvegardé de manière **chiffrée au repos** dans `secrets.enc` à l'intérieur du dossier de données — il n'est jamais commité ou envoyé nulle part ailleurs que vers la Graph API de Facebook.

![Écran de connexion](docs/img/connection.png)
*TODO screenshot*

> Vous êtes responsable du respect des Conditions de la Plateforme Meta et des politiques de publication automatisée.

---

## 6. Essayez maintenant — importer le livre d'exemple

Un roman d'exemple prêt à l'emploi est inclus avec le dépôt : [`samples/the-keeper-of-tides.md`](../samples/the-keeper-of-tides.md).

1. Ouvrez l'écran **Books** et choisissez **Import book**.
2. Sélectionnez `samples/the-keeper-of-tides.md` (un fichier Markdown).
3. Laissez l'analyse s'exécuter — vous obtiendrez un synopsis, des personnages et une bible visuelle.
4. Ouvrez le **Planner** pour créer un plan hebdomadaire de posts, Reels et stories.

![Importer un livre](docs/img/import.png)
*TODO screenshot*

Il s'agit d'un texte fictif original fourni pour que vous puissiez essayer l'application sans utiliser vos propres livres.

---

## 7. Où vivent vos données & comment sauvegarder

Tout est stocké dans le **répertoire de données** (`BOOKSOCIAL_DATA_DIR`, par défaut `./data` dans le dossier du projet, ignoré par git ; Docker mappe le même `./data`) :

```
<data>/booksocial.sqlite   # the database
<data>/books/              # imported .md books
<data>/media/              # uploaded & generated images / video
<data>/music/              # per-book music tracks
```

Les secrets (tokens Facebook, clés API IA) sont conservés **chiffrés** dans `secrets.enc` à l'intérieur du dossier de données (AES-256-GCM). La clé de chiffrement est `BOOKSOCIAL_SECRET_KEY` si elle est définie, sinon une clé `secret.key` auto-générée (mode 0600) dans le même dossier.

**Sauvegarde = copier le dossier de données.** Pour déplacer l'application sur une autre machine, copiez ce dossier. Pour repartir de zéro, arrêtez l'application et supprimez (ou renommez) le dossier.

---

## Dépannage

- **Le serveur ne démarre pas / erreur de fournisseur de texte** — assurez-vous que `CONTENT_PROVIDER` est l'un de `opencode`, `codex`, `claude`, `agy` ou `ollama`, et que la CLI correspondante est installée et authentifiée (ou passez à `ollama`). Redémarrez après modification.
- **Erreurs `better-sqlite3` après avoir changé de version de Node** — exécutez `cd server && npm rebuild better-sqlite3`.
- **Aucune image générée** — c'est normal dans Docker / sans GPU. Utilisez un fournisseur d'images cloud ou uploadez vos propres images. Voir [`docs/PROVIDERS.md`](PROVIDERS.md).
- **La connexion Facebook échoue** — revérifiez les permissions du token (section 5.2) et que l'Utilisateur Système a bien la Page assignée.

Suivant : [`docs/PROVIDERS.md`](PROVIDERS.md) · [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) · [`CONTRIBUTING.md`](../CONTRIBUTING.md)
