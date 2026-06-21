# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.1.0
