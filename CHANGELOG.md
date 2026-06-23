# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-23

### Added

- **Editable extra prompt instructions** (Settings): free text appended to the text and image prompts,
  both global and per-book, on top of the engineered core (the core rules are never overridden).
- **Dashboard**: a weekly + monthly **calendar** of scheduled content with per-book colours, compact
  per-page KPIs (Facebook + Instagram), and a background-activity card with progress and live timers.
- **CLI-first AI providers**: text and image generation through subscription CLIs (opencode, Codex,
  Gemini) alongside API keys, with a dedicated fallback provider/model and a four-tab AI settings panel.
- **Image format tabs** (vertical 9:16 / square / horizontal) with counts in a book's image library.
- **Fast NLP re-index** action: re-extract real quotes without re-running the full analysis.
- **Key moment** field on per-chapter scene cards, used to anchor the image subject.
- UI and documentation in **five languages** (IT/EN/FR/ES/DE).

### Changed

- **Less repetition**: posts, reels and stories now pick the least-recently-used quotes, images, music
  and chapters across runs, so consecutive weekly plans and regenerations cycle through the whole
  material instead of repeating it.
- **AI prompts rewritten in English**, while the generated output always stays in the book's language.
- **More precise visual canon**: character appearance and outfits are grounded in real book passages,
  with ethnicity/country/era anchoring and clothing keywords taken from the book's actual vocabulary.
- An extra **anti-AI humanization** pass on generated posts, applied in the output language.

### Fixed

- Deleting a draft now frees its quotes, images, music and chapter for reuse immediately.
- Natively-scheduled Facebook posts are reconciled to "published" after their scheduled time (no more
  entries stuck as "scheduled in the past").
- Published posts can be hidden from the dashboard without deleting them.

## [0.1.0] - 2026-06-20

First public, self-hostable release.

### Added

- Single-container **Docker** image (backend + built frontend) and `docker compose` setup.
- **Book analysis & visual bible**: import a Markdown book, extract profile and characters, and build
  a per-book canon (appearance, outfits, props, minor characters, per-chapter scene cards).
- **Content generation** to a weekly plan: posts, reels and stories with quotes, hashtags and links;
  the idea-finding and humanization logic is embedded in the prompts, so it works on any provider.
- **Scheduling & publishing** to **Facebook** (native scheduling for posts; an internal scheduler for
  reels/stories) and **Instagram** (Reels/Stories to linked Instagram Business accounts).
- **Facebook & Instagram management**: posts, comments, page settings, and account insights, with a
  Facebook/Instagram tab shown when a Page has a linked Instagram account.
- **Pluggable AI providers**: API keys (OpenAI, Anthropic, Google, any OpenAI-compatible endpoint,
  local Ollama) or subscription CLIs (opencode, Codex, Gemini) with an Authenticate flow; pluggable
  image engines (local `sd-cli`, OpenAI, Google, Stability, Black Forest Labs/FLUX, Replicate, fal.ai)
  with an upload-only fallback.
- **Settings** screen; secrets kept encrypted at rest in `secrets.enc` (AES-256-GCM).
- **i18n (IT/EN)** for the web UI, with language detection and switching.
- **Optional Basic Auth** to protect the app when self-hosted.
- **Documentation**: user manual, setup, AI providers, Instagram, architecture and contributing.

[0.2.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.2.0
[0.1.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.1.0
