# Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.

Il formato è basato su [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
e questo progetto aderisce al [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-20

Prima release pubblica, self-hostable.

### Aggiunto

- Immagine **Docker** single-container (backend + frontend compilato) e configurazione `docker compose`.
- **Analisi del libro & visual bible**: importa un libro in Markdown, estrai profilo e personaggi, e costruisci
  un canone per libro (aspetto, abiti, oggetti di scena, personaggi minori, schede scena per capitolo).
- **Generazione di contenuti** per un piano settimanale: post, reel e storie con citazioni, hashtag e link;
  la logica per la ricerca delle idee e l'umanizzazione è integrata nei prompt, funzionando così su qualsiasi provider.
- **Pianificazione & pubblicazione** su **Facebook** (pianificazione nativa per i post; uno scheduler interno per
  reel/storie) e **Instagram** (Reel/Storie verso account Instagram Business collegati).
- **Gestione Facebook & Instagram**: post, commenti, impostazioni della pagina e insight dell'account, con una
  scheda Facebook/Instagram mostrata quando una Pagina ha un account Instagram collegato.
- **Provider AI pluggable**: chiavi API (OpenAI, Anthropic, Google, qualsiasi endpoint OpenAI-compatibile,
  Ollama locale) o CLI in abbonamento (opencode, Codex, Gemini) con un flusso Authenticate; motori
  di immagini pluggable (`sd-cli` locale, OpenAI, Google, Stability, Black Forest Labs/FLUX, Replicate, fal.ai)
  con un fallback solo upload.
- Schermata **Settings**; i secret vengono mantenuti crittografati a riposo in `secrets.enc` (AES-256-GCM).
- **i18n (IT/EN)** per la UI web, con rilevamento della lingua e switch.
- **Basic Auth opzionale** per proteggere l'app in ambiente self-hosted.
- **Documentazione**: manuale utente, setup, provider AI, Instagram, architettura e contributing.

[0.1.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.1.0
