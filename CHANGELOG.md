# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-07-01

### Added
- **Gemini image provider (Nano Banana)**: a new `gemini` image provider using the Google `:generateContent` API, with a dedicated API key, live model listing fetched from the provider, and per-provider image style.
- **Model-aware image prompts**: the text AI now writes the image prompt specifically for the target image model — a structured sectioned prompt for Gemini, one compact positive paragraph for the local Z-Image engine, or the default paragraph — improving fidelity on each engine.
- **Free-image generator**: book-independent image generation endpoints (generate / status / file / cancel).
- **Live model lists**: for the Gemini and OpenAI image providers the model list is fetched from the provider API (with a minimal offline fallback) instead of a hardcoded list.
- **Per-provider image style**: medium/intensity/vividness (and local steps/cfg) are configured per provider, with independent primary and fallback styles.
- **Multilingual appearance coverage**: the canonical character-trait de-duplication now works for books in Italian, English, French, Spanish and German.

### Changed
- **Book-agnostic prompt code**: all book- and domain-specific visual content has been removed from the source; visual directives, character appearance, clothing and equipment now live solely in the database and are the only source used to build image prompts. The hardcoded visual-directive seed and the old `VISUAL_DOMAINS` system were removed.
- **Image provider `google` → `gemini`**: the old Imagen (`:predict`) engine and the dead `googleImageModel` field were removed.
- **Z-Image prompts**: compact, positive-only (avoiding negation artifacts at low guidance) and front-loaded on subject, pose and equipment for better local rendering.
- **Prompt translation**: image prompts are now translated to English auto-detecting the source language (any language → English).

### Fixed
- **Gemini prompt profile** routed by model family (flash/pro) instead of an exact version match.
- **Timeout** on the Gemini model-list request.
- **Visible fallback** (no longer silent) when image-prompt translation is unavailable.
- Minor robustness: `dashboardHidden` numeric parsing; pruning of the free-image job map.

## [0.5.5] - 2026-06-28

### Added
- **Strict path-on-write**: when a file path is saved to the database it is now stored strictly relative to the data directory via `toDataRelativeStrict()`, rejecting any path outside it (complements the read-side `resolveInsideDataDir`).
- **Audio content validation**: uploaded audio is now checked by magic bytes (OGG, FLAC, WAV, MP3/ID3, MP4/M4A, AAC), mirroring the image check — an audio extension/MIME with non-audio content is rejected.
- **Expanded backend tests**: content-engine provider registry (supported vs unsupported text providers), auth/session (login, lockout, session invalidation), DB migrations (fresh apply, idempotency, schema version), plus path-strict and audio cases.

### Changed
- **Provider config fully aligned**: `server/.env.example` no longer lists unsupported text API providers (OpenAI/Anthropic/Google/OpenAI-compatible) for the text engine — only CLI (opencode/Codex/Claude/agy) + Ollama — and defaults `CONTENT_PROVIDER=none`. The OpenAI/Google keys remain documented under image providers only.
- **Docker default aligned**: `docker-compose.yml` now defaults `CONTENT_PROVIDER=none` (was `opencode`), matching the README and runtime.
- **Production docs use the compiled runtime**: the manual production instructions (all 5 languages) now build and run `node dist/index.js` (`npm run build` + `npm run start:prod`) instead of `npm start` (tsx), matching the Docker image.

## [0.5.4] - 2026-06-28

### Added
- **Dedicated flashback & dream outfits**: characters now receive distinct canonical outfits for memory/flashback and dream scenes, kept consistent across renders.
- **Per-character outfit scope**: outfits are generated only for the settings of the chapters where a character actually appears, instead of for the whole book.
- **Upload validation**: book, image and audio uploads are checked for size, extension, MIME type and (for images) magic bytes; limits are configurable via environment variables.
- **Path safety**: files served from a database path are resolved strictly inside the data directory, blocking absolute-path or `../` traversal escapes.
- **Login hardening**: rate limiting with a temporary lockout after repeated failures, configurable session duration, and invalidation of all sessions on password change.
- **General per-client API rate limit**.
- **Startup configuration check**: a clear error if the data directory is not writable, and warnings if ffmpeg is missing or no text provider is configured.
- **Compiled Docker runtime**: the container now runs the compiled JavaScript (`node dist/index.js`) instead of the TypeScript sources.
- **Documentation**: supported usage modes (local / LAN / public) plus secret-key and backup guidance.

### Changed
- **Text AI providers**: only subscription CLIs (opencode, Codex, Claude, agy) and local Ollama are supported. The unsupported text API providers (OpenAI/Anthropic/Google) were removed from configuration, the settings UI and the docs; selecting a stale one now fails with a clear error instead of silently doing nothing.
- **Session cookie**: the `Secure` attribute is set only when the connection is actually HTTPS, so login works over plain HTTP in local/dev.
- **Encryption key**: a warning is logged when the key is stored inside the data directory; setting `BOOKSOCIAL_SECRET_KEY` outside the data volume is recommended.
- **Backend routes** reorganised into per-domain modules (no endpoint or behaviour change).

### Fixed
- Login sessions are no longer dropped over HTTP because of the `Secure` cookie flag.

## [0.5.3] - 2026-06-28

### Added
- **Per-provider image style**: pick the visual style of generated images (graphic novel, painterly, photorealistic, watercolour, concept art and more) with adjustable stylization strength and colour vividness, set independently per image provider — and separately for the primary provider and its fallback, so each renders in its own style.

### Changed
- **Image prompts keep the full art-direction**: the prompt writer now transcribes the book's visual rules in full (equipment, posture, technique) instead of summarising them.
- **Per-scene physics**: a chapter's realism rules now apply only to the objects actually present in the scene, so rules about absent objects no longer leak into the image.
- Clothing guidance in the prompt consolidated for consistency.

### Fixed
- **Facebook token field**: the browser no longer autofills the saved admin login password into the Facebook access-token field on the Connection page.

## [0.5.2] - 2026-06-28

### Changed
- **Image generation — smarter use of the visual bible**: the scene prompt is now built in TWO steps. First, the model picks which single moment of the chapter to illustrate, naming the subject and only the characters and objects actually present in that moment. Then the final image prompt is written using ONLY that scene's canon. Before, every character, object and directive of the whole chapter was poured into one prompt, so unrelated people and objects leaked into the image, characters were duplicated or blended, and the key details were diluted. The two-step flow keeps each scene focused: the right people, the right gear, the right pose — and distinct images across a chapter.
- **Sport and action poses** are now rendered with their full dynamic stance instead of being forced upright.

## [0.5.1] - 2026-06-27

### Added
- **Promote a minor character to a main character**: from the minor/incidental characters editor you can now promote an entry to a full character in one click. Its label becomes the character name and its look and outfit are carried over; chapters and per-context outfits are then filled in by hand. Useful when a background figure grows in importance and needs proper wardrobe contexts.

## [0.5.0] - 2026-06-27

### Added
- **Visual directives as a list**: per-book art-direction rules are now managed as individual, reusable entries — add, edit, delete, enable/disable, with optional trigger keywords that decide when each rule applies (no trigger = always on). An AI-assist turns a plain-language intent into a ready-to-use directive. This replaces the previous single free-text directives box.

### Changed
- **Correct output language everywhere**: every generated value — character age, ethnicity and appearance, scene cards, outfits, marketing cards and posts — is now always written in the book's language. Short fields that could previously come out in English are fixed.
- **More faithful character extraction**: physical appearance and outfits are grounded on the whole book and also capture details that continue right after a character's name (the sentences that describe them with "he/she/the man…"), so the book's stated traits are used instead of being invented.
- **Signature item detection**: a character's recognizable item (a particular hat, glasses, a scarf…) is now detected even when the book introduces it indirectly ("his hat"), not only when it literally says "always".
- **More accurate character presence per chapter**: a cast member is no longer dropped when they appear in a service role (e.g. a bartender or waiter), the narrator counts as present in the chapters they narrate, and someone merely mentioned but not actually in the scene is no longer added — no more invented presences.
- **Scene point of view**: each chapter scene now records its narrator / point-of-view, and on long chapters the most representative key moment is chosen.
- **Marketing card quotes**: quotes are now verbatim, complete phrases taken from the chapter, with stricter spoiler classification.

### Fixed
- **Stricter, clearer input handling**: the book language is required at import and malformed or invalid requests are rejected explicitly instead of silently falling back to a default — which previously could produce content in the wrong language.

## [0.4.0] - 2026-06-26

### Added
- **Authentication**: a built-in login now protects the app. On first run the credentials are `admin` / `12345678` and a password change is required; the password is stored hashed. Log out from the sidebar. (Replaces the old optional HTTP Basic Auth.)
- **HTTPS**: the server can serve over HTTPS. Mount your own certificate in Docker (`TLS_CERT_PATH`/`TLS_KEY_PATH`), or a self-signed one is generated automatically; otherwise it falls back to HTTP. See the README.
- **Mobile layout**: the whole interface is now responsive — a collapsible sidebar with a hamburger menu and screens that adapt to phone widths.
- **Generate dream/flashback images**: the image generator can target a chapter's dream or flashback moment, or pick at random across present/dream/flashback, instead of only the present scene.
- **Per-character flashback age**: in a flashback you can set each character's exact age for that scene, so characters with different age anchors render correctly.

- **Character age & ethnicity**: now dedicated, editable fields (no longer buried in the physical description). They are stated explicitly in every image prompt, so a character's apparent age and ethnicity stay consistent across all illustrations.
- **Signature outfit item**: a garment or accessory a character always wears (e.g. a particular hat) can be set once and is rendered in every scene, on top of the scene's outfit.
- **Scene moments (dream / flashback)**: each chapter card now records the nature of its main scene (normal, dream or flashback) plus any secondary dreams or flashbacks, all editable in dedicated tabs. Dream scenes are rendered with a dreamlike look; flashbacks render the characters younger.
- **Image usage**: each image shows how many times it has been used and in what (reels, stories, posts), with a filter for used / never-used images.
- **Music usage**: music tracks show the same usage badge (reels / stories) with a used / unused filter.
- **Per-format and per-chapter image sub-tabs**: the image library can be filtered by format and, within a format, by chapter, with counts — and you can generate images for just that chapter.
- **Automatic cleanup of published media**: rendered reel/story/post videos are deleted 24 hours after they are published on both Facebook and Instagram, to free disk space. Rendered files are now kept in a dedicated `media/renders/` subfolder.

### Changed
- **Flashback image generation**: the generate panel's flashback toggle is now a simple on/off — it renders using the per-character ages set in the chapter card; the manual "years younger" field was removed.

- **Stronger character consistency in image prompts**: age, ethnicity, build and hair are always stated for every person; when two or more characters share a frame they are kept visually distinct and never swapped; poses are natural and upright; a character explicitly requested for an image is always featured.

### Fixed
- **Chapter scene extraction**: a chapter that contains both a real scene and a dream/flashback now keeps BOTH (the waking scene as the main one, plus the dream/flashback as a separate moment) instead of collapsing the whole chapter to the dream; long multi-section chapters no longer lose a dream/flashback that lives in its own section.

- **No more out-of-place subjects**: things that appear only inside a dream, a memory or a figure of speech (and homonyms such as the surf "turtle roll" manoeuvre) no longer leak into a chapter's waking scene.

## [0.3.1] - 2026-06-24

### Added

- **Cancel individual queued items**: you can now cancel a single batch waiting in the
  image-generation queue, in addition to "Cancel all".

### Changed

- **Image generation is serialized**: generations for different books and image regenerations are now
  queued and run one at a time instead of in parallel; the activity indicator distinguishes
  "in progress" from "queued".

### Fixed

- **Activity panel stacking**: the header activity dropdown now appears above the image grid when
  scrolling.

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
- Post generation is blocked when the book's profile is out of date relative to the imported text, so posts are never based on a stale book sheet.
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
