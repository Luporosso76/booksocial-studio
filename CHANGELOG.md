# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-06-24

### Added

- **Chapter marketing cards**: a persistent narrative understanding of each chapter (non-spoiler
  summary, emotional core, reader question, safe quotes and scored post angles) that grounds post
  generation, built once per chapter and reused.
- **Idea ranker with angle rotation**: posts draw from the chapter's pre-vetted angles and rotate
  through them, so a reused chapter yields a different angle each time (maximum variety).
- **Quality judge**: a final pass that rejects generic posts (ones that could fit any book) and
  regenerates them once with a targeted hint.
- **Per-character chapter presence editor**: manually set in which chapters a character appears.
- **Reproducible images**: the generation seed is stored with each generated image.

### Changed

- **Posts are more grounded**: an internal checklist forces each post to use a concrete detail from the
  chapter, with real non-spoiler quotes and stronger anti-generic, anti-AI wording.
- **Outfits and scene objects follow the book's art direction**: practice/ceremony/era clothing and the
  key objects described in the visual directives are now respected in the canon and the chapter scene cards.
- **Planner quotas are the total for the chosen period** (week/month/custom), with no hidden scaling;
  the planner now guarantees every requested item is placed, even with few posting slots.
- **Scene image panel redesigned**: collapsible Chapters/Characters sections and a more compact layout.

- The quality judge also checks posts against the chapter marketing card, not only the chapter excerpt, avoiding unfair rejections.
- Marketing-card quotes are verified against the real chapter text; invented or paraphrased quotes are dropped.

### Fixed

- Re-importing a book with changed text now invalidates its chapter marketing cards, so posts are grounded on the new text.
- Editing a draft's hashtags now saves correctly.
- Posts, reels and stories without a visual stay as drafts instead of failing on publish.

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
