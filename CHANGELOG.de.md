# Changelog

Alle wesentlichen Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
und dieses Projekt hält sich an [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-20

Erste öffentliche, selbst-hostbare Version.

### Hinzugefügt

- Einzel-Container-**Docker**-Image (Backend + gebautes Frontend) und `docker compose`-Setup.
- **Buchanalyse & visuelle Bibel**: Importiere ein Markdown-Buch, extrahiere Profil und Charaktere und erstelle einen buchspezifischen Kanon (Aussehen, Outfits, Requisiten, Nebencharaktere, kapitelweise Szenenkarten).
- **Content-Generierung** für einen Wochenplan: Posts, Reels und Stories mit Zitaten, Hashtags und Links; die Logik zur Ideenfindung und Humanisierung ist in die Prompts eingebettet, sodass sie mit jedem Provider funktioniert.
- **Planung & Veröffentlichung** auf **Facebook** (native Planung für Posts; ein interner Scheduler für Reels/Stories) und **Instagram** (Reels/Stories an verknüpfte Instagram Business-Konten).
- **Facebook & Instagram Management**: Posts, Kommentare, Seiteneinstellungen und Account-Insights, mit einem Facebook/Instagram-Tab, der angezeigt wird, wenn eine Seite ein verknüpftes Instagram-Konto hat.
- **Erweiterbare KI-Provider**: API-Schlüssel (OpenAI, Anthropic, Google, jeder OpenAI-kompatible Endpunkt, lokales Ollama) oder Abonnement-CLIs (opencode, Codex, Gemini) mit einem Authenticate-Flow; erweiterbare Image-Engines (lokales `sd-cli`, OpenAI, Google, Stability, Black Forest Labs/FLUX, Replicate, fal.ai) mit einem reinen Upload-Fallback.
- **Einstellungen**-Bildschirm; Secrets werden im Ruhezustand verschlüsselt in `secrets.enc` (AES-256-GCM) aufbewahrt.
- **i18n (IT/EN)** für die Web-UI, mit Spracherkennung und -umschaltung.
- **Optionales Basic Auth** zum Schutz der App beim Self-Hosting.
- **Dokumentation**: Benutzerhandbuch, Setup, KI-Provider, Instagram, Architektur und Contributing.

[0.1.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.1.0
