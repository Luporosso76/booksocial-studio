# BookSocial Studio

**[English](README.md) · [Italiano](README.it.md) · [Français](README.fr.md) · [Español](README.es.md) · [Deutsch](README.de.md)**

![CI](https://github.com/Luporosso76/booksocial-studio/actions/workflows/ci.yml/badge.svg)
![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue)
![Node](https://img.shields.io/badge/node-22%20%7C%2024-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

Turn a book (Markdown) into ready-to-publish **social media content** — spoiler‑aware posts, reels and
stories with real text, AI visuals and music — and schedule/publish them to Facebook and Instagram.

It runs **locally and self‑hosted**: your data stays on your machine in an embedded SQLite database.
AI providers are pluggable (API key or subscription CLI) and the UI is bilingual (Italian/English).

## Screenshots

> The interface is bilingual (Italian/English); screenshots are in English.

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/dashboard.png" alt="Dashboard — KPIs, calendar & post status"><br/><sub><b>Dashboard — KPIs, calendar & post status</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/books.png" alt="Library — your imported books"><br/><sub><b>Library — your imported books</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/book_profile.png" alt="Book profile — AI analysis"><br/><sub><b>Book profile — AI analysis</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/book_chapters.png" alt="Chapters & scene cards"><br/><sub><b>Chapters & scene cards</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/book_characters.png" alt="Characters & visual bible"><br/><sub><b>Characters & visual bible</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/book_image.png" alt="AI scene images"><br/><sub><b>AI scene images</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/book_music.png" alt="Music library"><br/><sub><b>Music library</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/planner.png" alt="Weekly planner"><br/><sub><b>Weekly planner</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/page_management.png" alt="Page management (Facebook/Instagram)"><br/><sub><b>Page management (Facebook/Instagram)</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/settings_text_ai.png" alt="Settings — Text AI"><br/><sub><b>Settings — Text AI</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/settings_image_ai.png" alt="Settings — Image AI"><br/><sub><b>Settings — Image AI</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/settings_content_images.png" alt="Settings — Content images"><br/><sub><b>Settings — Content images</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/settings_quality_images.png" alt="Settings — Image quality check"><br/><sub><b>Settings — Image quality check</b></sub></td>
  </tr>
</table>

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

- **Node.js 22 or 24** (tested on both in CI; `.nvmrc` pins 24). Native modules (`better-sqlite3`) are
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

## Security note for remote servers

BookSocial Studio is designed as a **local-first, single-user** app and binds to `127.0.0.1` by
default. The bundled Docker Compose sets `HOST=0.0.0.0` and maps a port for convenience — if you run
it on a VPS or expose it outside localhost, **enable `AUTH_USER` and `AUTH_PASS`** and put it behind a
reverse proxy with HTTPS. Do not expose the app publicly without authentication: it can access local
project data, AI provider keys, and social publishing tokens.

## Configuration

All config is via environment variables — see [`server/.env.example`](server/.env.example). Highlights:

| Variable | Purpose | Default |
|---|---|---|
| `PORT` / `HOST` | API/server bind | `8770` / `127.0.0.1` |
| `BOOKSOCIAL_DATA_DIR` | data folder (DB + media + music + books) | `./data` (inside the project) |
| `CONTENT_PROVIDER` | AI text engine (or `none`, then configure in Settings) | `none` |
| `FB_API_VERSION` | Meta Graph API version | `v21.0` |

> **Where is the data folder?** By default it lives in `./data` inside the project folder (it is
> git-ignored, so it is never committed) — one place for the DB, media, music and books. Set
> `BOOKSOCIAL_DATA_DIR` to put it anywhere else (an absolute path is recommended for production). The
> bundled Docker setup uses `BOOKSOCIAL_DATA_DIR=/data` mapped to `./data`, so it matches the default.

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
