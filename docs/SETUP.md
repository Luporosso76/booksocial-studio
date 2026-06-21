# Setup guide

This is a step-by-step guide to install **BookSocial Studio** and turn your first book into
social-media content. It assumes no prior development experience — copy the commands as written.

BookSocial Studio runs **locally on your own machine**. Your books, images and tokens stay on your
computer in a local SQLite database.

> Screenshots in this guide are placeholders marked **TODO screenshot** — they will be added later.

---

## 1. Prerequisites

You need **one** of the following:

- **Docker** (recommended for the easiest start) — [install Docker](https://docs.docker.com/get-docker/), or
- **Node.js 22 or 24** for a manual install (tested on both in CI; `.nvmrc` pins 24).

To publish to Facebook you will also need (later, optional at first):

- A **Facebook Page** and a **Meta Business** account.
- Your own **Meta app** (free to create at [developers.facebook.com](https://developers.facebook.com)).

You can explore the whole app (import a book, generate content, render videos) **without** Facebook.

---

## 2. Quick start

### Option A — Docker (recommended)

```bash
git clone <your-fork-url> booksocial-studio
cd booksocial-studio
cp server/.env.example server/.env   # edit later if needed
docker compose up -d --build
```

Then open **http://localhost:8771**. Your data persists in the `./data` folder next to the project.

> Note: local AI **image generation** (GPU) is not available inside Docker. In the container the app
> runs in **upload-only** mode for images, or you can point it at a cloud image provider (see step 4).

![BookSocial Studio home](docs/img/home.png)
*TODO screenshot*

### Option B — Manual (Node)

```bash
git clone <your-fork-url> booksocial-studio
cd booksocial-studio
cp server/.env.example server/.env   # edit later if needed

# Build the frontend once
cd web && npm ci && npm run build

# Start the server (serves the API + the built frontend on :8770)
cd ../server && npm ci && npm start
```

Open **http://localhost:8770**.

> If you switch Node versions, the native database module may need a rebuild:
> `cd server && npm rebuild better-sqlite3`.

For active development (hot reload) run `npm run dev` in `server/` and `web/` instead — see
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## 3. Choose and configure an AI text provider

BookSocial Studio uses an AI **text engine** to analyse your book and write the posts. You pick one
provider by setting `CONTENT_PROVIDER` in `server/.env`. There are three ways to pay/authenticate.
Full reference: [`docs/PROVIDERS.md`](PROVIDERS.md).

### Start with OpenAI (API key)

Get a key from your OpenAI account, then in `server/.env`:

```bash
CONTENT_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Any **OpenAI-compatible** endpoint (OpenRouter, Groq, Together, LM Studio, vLLM) works the same way —
set `CONTENT_PROVIDER=openai-compatible` and point `OPENAI_BASE_URL` at it.

### Start with Ollama (local & free, no key)

Install [Ollama](https://ollama.com), pull a model (`ollama pull llama3.1`), then:

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

### Use an existing subscription (CLI)

If you already pay for ChatGPT or a Google AI plan, the app can drive the matching CLI tool
(`opencode`, `codex`, `gemini`) which handles auth with your account — set `CONTENT_PROVIDER`
accordingly, or log in from the in-app **Settings → AI** with the **Authenticate** button. See
[`docs/PROVIDERS.md`](PROVIDERS.md).

> You can also set provider keys later from the in-app **Settings** screen; keys you save there are
> stored **encrypted** on your machine.

Restart the server after editing `server/.env`.

---

## 4. Images: with or without a GPU

AI scene images are **optional**. The image engine is selected by `IMAGE_PROVIDER`:

- **No GPU?** Use a cloud provider — `IMAGE_PROVIDER=openai` or `IMAGE_PROVIDER=google` (these reuse
  the same `OPENAI_API_KEY` / `GOOGLE_API_KEY` as the text engine).
- **No image provider at all?** Leave it on the default `auto` (or set `none`). The app runs in
  **upload-only** mode: you provide images, and everything else (text, scheduling, publishing) works.
- **Have a local GPU?** Set `IMAGE_PROVIDER=local` (stable-diffusion.cpp / Z-Image). This is **not**
  available inside Docker — use a manual install.

Details and model-swapping: [`docs/PROVIDERS.md`](PROVIDERS.md).

---

## 5. Connect Facebook (optional)

Publishing to a Facebook Page requires **your own Meta app** and a **page access token**. The app
never asks for your Facebook password — you paste a token that you generate yourself.

You will need a **Facebook Page** and a **Meta Business** account.

### 5.1 Create a Meta app

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
2. Choose a **Business** type app and link it to your Business portfolio.

### 5.2 Create a System User token in Business Suite

1. Open **Meta Business Suite** → **Settings** → **Business settings** → **Users → System users**.
2. Create (or select) a **System User** and **Add assets** → assign your **Page** with full control.
3. Click **Generate new token**, select your app, and grant the page permissions below.
4. Copy the generated token (a long string). A **System User** token is long-lived — keep it private.

Typical permissions to grant:

- `pages_show_list` — list the Pages you manage.
- `pages_read_engagement` — read Page content/engagement.
- `pages_manage_posts` — create and publish posts on the Page.

> The app also reads/updates some Page metadata, which may require `pages_manage_metadata`. If a Page
> action fails with a permissions error, add the missing scope and regenerate the token.

### 5.3 Paste the token in the app

1. In BookSocial Studio open the **Connection** screen.
2. Paste your System User token into the token field and confirm.
3. The app calls Facebook to list the Pages you manage and lets you connect one.

Your token is saved **encrypted at rest** in `secrets.enc` inside the data folder — it is never
committed or sent anywhere except Facebook's Graph API.

![Connection screen](docs/img/connection.png)
*TODO screenshot*

> You are responsible for complying with Meta's Platform Terms and automated-posting policies.

---

## 6. Try it now — import the sample book

A ready-to-use sample novel ships with the repo: [`samples/the-keeper-of-tides.md`](../samples/the-keeper-of-tides.md).

1. Open the **Books** screen and choose **Import book**.
2. Select `samples/the-keeper-of-tides.md` (a Markdown file).
3. Let the analysis run — you'll get a synopsis, characters and a visual bible.
4. Open the **Planner** to create a weekly plan of posts, reels and stories.

![Import book](docs/img/import.png)
*TODO screenshot*

This is original, fictional text provided so you can try the app without using your own books.

---

## 7. Where your data lives & how to back up

Everything is stored under the **data directory** (`BOOKSOCIAL_DATA_DIR`, default
`~/.local/share/book-social`; with Docker it's the `./data` folder next to the project):

```
<data>/booksocial.sqlite   # the database
<data>/books/              # imported .md books
<data>/media/              # uploaded & generated images / video
<data>/music/              # per-book music tracks
```

Secrets (Facebook tokens, AI API keys) are kept **encrypted** in `secrets.enc` inside the data
folder (AES-256-GCM). The encryption key is `BOOKSOCIAL_SECRET_KEY` if set, otherwise an
auto-generated `secret.key` (mode 0600) in the same folder.

**Backup = copy the data folder.** To move the app to another machine, copy this folder over. To
start fresh, stop the app and delete (or rename) the folder.

---

## Troubleshooting

- **Server won't start, complains about a missing key** — the selected `CONTENT_PROVIDER` needs its
  API key in `server/.env`. Add it (or switch to `ollama`) and restart.
- **`better-sqlite3` errors after changing Node** — run `cd server && npm rebuild better-sqlite3`.
- **No images generated** — that's expected in Docker / without a GPU. Use a cloud image provider or
  upload your own images. See [`docs/PROVIDERS.md`](PROVIDERS.md).
- **Facebook connect fails** — re-check the token's permissions (section 5.2) and that the System User
  has the Page assigned.

Next: [`docs/PROVIDERS.md`](PROVIDERS.md) · [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) · [`CONTRIBUTING.md`](../CONTRIBUTING.md)
