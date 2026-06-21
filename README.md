# BookSocial Studio

Turn a book (Markdown) into ready-to-publish **social media content** — spoiler‑aware posts, reels and
stories with real text, AI visuals and music — and schedule/publish them to Facebook and Instagram.

It runs **locally and self‑hosted**: your data stays on your machine in an embedded SQLite database.
AI providers are pluggable (API key or subscription CLI) and the UI is bilingual (Italian/English).

## Documentation

- 📘 **[User manual](docs/MANUAL.md)** — complete operational guide to every screen (book loading, planning, publishing, settings).
- 🚀 **[Setup guide](docs/SETUP.md)** — install, pick an AI provider, connect Facebook (for non‑developers).
- 🔌 **[AI providers](docs/PROVIDERS.md)** — configure & extend the text and image engines.
- 📸 **[Instagram integration](docs/INSTAGRAM.md)** — publish Reels/Stories, Facebook/Instagram tabs, account insights.
- 🏗️ **[Architecture](docs/ARCHITECTURE.md)** — modules, the import → publish flow, extension points.
- 🖥️ **[Tested on our hardware](docs/TESTED-ON.md)** — the exact machine/config we used and realistic performance.
- 🤝 **[Contributing](CONTRIBUTING.md)** — dev setup, code style, how to add a provider, PRs.

The user manual is also available in Italian, Spanish, French, Portuguese and German
(`docs/MANUAL.it.md`, `.es.md`, `.fr.md`, `.pt.md`, `.de.md`). English is the authoritative version.

**Try it:** import the bundled sample `samples/the-keeper-of-tides.md`.

## Features

- 📖 **Book analysis**: import a `.md` book → synopsis, genres, tone, characters (spoiler‑aware).
- 🎨 **Visual bible** per book: canonical character appearance, per‑context outfits, recurring objects
  (with driving side), minor characters and per‑chapter scene cards — for consistent imagery.
- 🖼️ **AI scene images** (optional, local GPU) + an upload library; per‑image regeneration and quality check.
- ✍️ **Content generation** to a weekly plan: posts / reels / stories with quotes, hashtags and sale links.
  The "find the idea, then humanize it" logic is baked into the prompts, so it works on **any** provider.
- 📅 **Scheduling & publishing** to Facebook (native scheduling for posts; internal scheduler for reels/stories).
- 📸 **Instagram**: publish Reels/Stories to linked Instagram Business accounts, manage media & comments,
  and read account insights. See [`docs/INSTAGRAM.md`](docs/INSTAGRAM.md).
- 🎬 Reel/story video rendering (ffmpeg) with music, Ken‑Burns and text fades.

## Stack

- **Backend**: Node + TypeScript + [Hono](https://hono.dev), embedded **SQLite** (`better-sqlite3`).
- **Frontend**: React + Vite + Tailwind.
- **Media**: Satori/resvg (text cards), ffmpeg (video). Image generation via a local diffusion CLI (optional).

## Prerequisites

- **Node.js 24** (see `.nvmrc`). Native modules (`better-sqlite3`) are
  built for your Node version — if you switch Node, run `npm rebuild better-sqlite3`.
- An **AI text engine** — choose any: an **API key** (OpenAI, Anthropic, Google, or any
  OpenAI‑compatible endpoint like OpenRouter/Groq, plus local **Ollama**), or a **subscription CLI**
  you log into with an **Authenticate** button (`opencode`, Codex/ChatGPT, Gemini). See
  [`docs/PROVIDERS.md`](docs/PROVIDERS.md).
- A **Meta (Facebook) Business app + Page** to publish: you paste a **System User token** in the
  Connection screen (kept encrypted in `secrets.enc`). See [`docs/SETUP.md`](docs/SETUP.md).
- *Optional*: an **image engine** for AI scene images — local `sd-cli` (GPU), or a cloud provider
  (OpenAI, Google Imagen, Stability, Black Forest Labs/FLUX, Replicate, fal.ai). Without one, the app
  runs in **upload‑only** mode (you provide images). See [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

## Quick start (Docker)

```bash
git clone https://github.com/Luporosso76/booksocial-studio.git
cd booksocial-studio
cp server/.env.example server/.env   # edit as needed
docker compose up -d --build
# → http://localhost:8771   (data persists in ./data)
```

> Image generation (local GPU) is **not** available inside the container — Docker runs in upload‑only mode.

## Quick start (manual / development)

```bash
# backend
cd server && npm ci && npm run dev      # tsx watch on :8770

# frontend (separate terminal)
cd web && npm ci && npm run dev         # Vite dev server, proxied to the API
```

Production (single process serving the built frontend):

```bash
cd web && npm ci && npm run build       # outputs web/dist
cd ../server && npm ci && npm start     # serves API + ../web/dist on :8770
```

## Configuration

All config is via environment variables — see [`server/.env.example`](server/.env.example). Highlights:

| Variable | Purpose | Default |
|---|---|---|
| `PORT` / `HOST` | API/server bind | `8770` / `127.0.0.1` |
| `BOOKSOCIAL_DATA_DIR` | data folder (DB + media + music + books) | `~/.local/share/book-social` |
| `CONTENT_PROVIDER` | AI text engine (or `none`, then configure in Settings) | `none` |
| `FB_API_VERSION` | Meta Graph API version | `v21.0` |

Pick your text provider and model in **Settings → AI**, or set them via the matching `*_MODEL` env
vars — see [`server/.env.example`](server/.env.example) and [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

## Data & storage

Everything lives under the **data directory** (`BOOKSOCIAL_DATA_DIR`), independent of where the app is
installed:

```
<data>/booksocial.sqlite   # the database (SQLite)
<data>/books/              # imported .md books
<data>/media/              # uploaded & generated images/video
<data>/music/              # per-book music tracks
```

Back up = copy the data folder. Move the app = move the folder. **Secrets** (Facebook tokens, AI API
keys) are stored **encrypted** here in `secrets.enc`; subscription‑CLI logins live in the CLI.

## Limitations

- **Image generation** runs locally on a GPU by default (`sd-cli`); cloud backends (OpenAI, Google
  Imagen, Stability, Black Forest Labs/FLUX, Replicate, fal.ai) are available, and without any the app
  degrades to **upload‑only**. Local generation is slow without a discrete GPU — see
  [`docs/TESTED-ON.md`](docs/TESTED-ON.md).
- **Single‑user, local‑first** (no multi‑tenancy). Optional HTTP Basic Auth via `AUTH_USER`/`AUTH_PASS`;
  binds to `127.0.0.1` by default.
- AI provider keys & Meta connection are configured in **Settings** (kept encrypted in `secrets.enc`) or via `.env`.
- No music is bundled — bring your own royalty‑free audio for reels and stories.

## Disclaimer

You are responsible for the books you import (use content you own or have the right to use) and for
complying with Meta's Platform Terms and automated‑posting policies. This project is provided as‑is.

## License

**PolyForm Noncommercial License 1.0.0** — free to use, modify, run and share for any
**noncommercial** purpose (personal, research, education, nonprofits, public institutions).
**Commercial use is not permitted.** See [`LICENSE`](LICENSE).

This is a *source-available* license, not an OSI "open source" license (open-source licenses cannot
restrict commercial use). For commercial licensing, contact the author.

---

*`server/nlp/` is an optional Python NLP pre‑pass (run `server/nlp/setup.sh` to create its venv).*
