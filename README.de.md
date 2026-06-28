# BookSocial Studio

**[English](README.md) · [Italiano](README.it.md) · [Français](README.fr.md) · [Español](README.es.md) · [Deutsch](README.de.md)**

![CI](https://github.com/Luporosso76/booksocial-studio/actions/workflows/ci.yml/badge.svg)
![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue)
![Node](https://img.shields.io/badge/node-22%20%7C%2024-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

Verwandle ein Buch (Markdown) in veröffentlichungsfertigen **Social-Media-Content** — spoilerfreie Posts, Reels und Storys mit echtem Text, KI-Bildern und Musik — und plane/veröffentliche sie auf Facebook und Instagram.

Es läuft **lokal und selbstgehostet**: Deine Daten bleiben auf deiner Maschine in einer eingebetteten SQLite-Datenbank. KI-Provider sind steckbar (API-Schlüssel oder Abonnement-CLI) und die UI ist mehrsprachig (Italienisch, Englisch, Französisch, Spanisch, Deutsch).

## Screenshots

> Die Oberfläche ist mehrsprachig (Italienisch, Englisch, Französisch, Spanisch, Deutsch); die Screenshots sind auf Englisch.

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/dashboard.png" alt="Dashboard — KPIs, Kalender und Beitragsstatus"><br/><sub><b>Dashboard — KPIs, Kalender und Beitragsstatus</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/books.png" alt="Bibliothek — deine importierten Bücher"><br/><sub><b>Bibliothek — deine importierten Bücher</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/book_profile.png" alt="Buchprofil — KI-Analyse"><br/><sub><b>Buchprofil — KI-Analyse</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/book_chapters.png" alt="Kapitel und Szenenkarten"><br/><sub><b>Kapitel und Szenenkarten</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/book_characters.png" alt="Figuren und visuelle Bibel"><br/><sub><b>Figuren und visuelle Bibel</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/book_image.png" alt="KI-Szenenbilder"><br/><sub><b>KI-Szenenbilder</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/book_music.png" alt="Musikbibliothek"><br/><sub><b>Musikbibliothek</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/planner.png" alt="Wochenplaner"><br/><sub><b>Wochenplaner</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/page_management.png" alt="Seitenverwaltung (Facebook/Instagram)"><br/><sub><b>Seitenverwaltung (Facebook/Instagram)</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/settings_text_ai.png" alt="Einstellungen — Text-KI"><br/><sub><b>Einstellungen — Text-KI</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/settings_image_ai.png" alt="Einstellungen — Bild-KI"><br/><sub><b>Einstellungen — Bild-KI</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/settings_content_images.png" alt="Einstellungen — Inhaltsbilder"><br/><sub><b>Einstellungen — Inhaltsbilder</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/settings_quality_images.png" alt="Einstellungen — Bildqualitätsprüfung"><br/><sub><b>Einstellungen — Bildqualitätsprüfung</b></sub></td>
  </tr>
</table>

## Dokumentation

- 📘 **[Benutzerhandbuch](docs/MANUAL.md)** — vollständige Bedienungsanleitung für jeden Bildschirm (Buch laden, Planung, Veröffentlichung, Einstellungen).
- 🚀 **[Setup-Leitfaden](docs/SETUP.md)** — Installation, Auswahl eines KI-Providers, Facebook verbinden (für Nicht-Entwickler).
- 🔌 **[KI-Provider](docs/PROVIDERS.md)** — Konfiguration & Erweiterung der Text- und Image-Engines.
- 📸 **[Instagram-Integration](docs/INSTAGRAM.md)** — Reels/Storys veröffentlichen, Facebook/Instagram-Tabs, Account-Insights.
- 🏗️ **[Architektur](docs/ARCHITECTURE.md)** — Module, der Import → Publish-Flow, Erweiterungspunkte.
- 🖥️ **[Getestet auf unserer Hardware](docs/TESTED-ON.md)** — die genaue Maschine/Konfiguration, die wir verwendet haben, und realistische Performance.
- 🤝 **[Mitwirken](CONTRIBUTING.md)** — Dev-Setup, Code-Style, wie man einen Provider hinzufügt, PRs.

Das Benutzerhandbuch ist auch auf Italienisch, Spanisch, Französisch, Portugiesisch und Deutsch verfügbar (`docs/MANUAL.it.md`, `.es.md`, `.fr.md`, `.pt.md`, `.de.md`). Englisch ist die maßgebliche Version.

**Ausprobieren:** Importiere das mitgelieferte Beispiel `samples/the-keeper-of-tides.md`.

## Features

- 📖 **Buchanalyse**: Importiere ein `.md` Buch → Synopsis, Genres, Ton, Charaktere (spoilerfrei).
- 🎨 **Visuelle Bibel** pro Buch: kanonisches Erscheinungsbild der Charaktere, kontextbezogene Outfits, wiederkehrende Objekte (mit Fahrseite), Nebencharaktere und kapitelweise Szenenkarten — für konsistentes Bildmaterial.
- 🖼️ **KI-Szenenbilder** (optional, lokale GPU) + eine Upload-Bibliothek; bildweise Neuerstellung und Qualitätskontrolle.
- ✍️ **Content-Generierung** für einen Wochenplan: Posts / Reels / Storys mit Zitaten, Hashtags und Verkaufslinks. Die Logik "Idee finden, dann vermenschlichen" ist in die Prompts integriert, sodass es auf **jedem** Provider funktioniert.
- 📅 **Planung & Veröffentlichung** auf Facebook (natives Scheduling für Posts; interner Scheduler für Reels/Storys).
- 📸 **Instagram**: Veröffentliche Reels/Storys auf verknüpften Instagram Business-Accounts, verwalte Medien & Kommentare und lese Account-Insights. Siehe [`docs/INSTAGRAM.md`](docs/INSTAGRAM.md).
- 🎬 Reel/Story-Videorendering (ffmpeg) mit Musik, Ken-Burns und Textüberblendungen.

## Stack

- **Backend**: Node + TypeScript + [Hono](https://hono.dev), eingebettetes **SQLite** (`better-sqlite3`).
- **Frontend**: React + Vite + Tailwind.
- **Media**: Satori/resvg (Textkarten), ffmpeg (Video). Bildgenerierung über eine lokale Diffusion-CLI (optional).

## Voraussetzungen

- **Node.js 22 oder 24** (getestet auf beiden in der CI; `.nvmrc` pinnt 24). Native Module (`better-sqlite3`) werden für deine Node-Version erstellt — wenn du Node wechselst, führe `npm rebuild better-sqlite3` aus.
- Eine **KI-Text-Engine** — eine **Abonnement-CLI**, bei der du dich mit einem **Authenticate**-Button anmeldest (`opencode`, Codex/ChatGPT, Claude, Gemini/agy), oder ein lokaler **Ollama**-Server (kein Schlüssel). Siehe [`docs/PROVIDERS.md`](docs/PROVIDERS.md).
- Eine **Meta (Facebook) Business App + Page** zum Veröffentlichen: Du fügst ein **System User Token** im Connection-Bildschirm ein (wird verschlüsselt in `secrets.enc` aufbewahrt). Siehe [`docs/SETUP.md`](docs/SETUP.md).
- *Optional*: Eine **Image-Engine** für KI-Szenenbilder — lokale `sd-cli` (GPU), oder ein Cloud-Provider (OpenAI, Google Imagen, Stability, Black Forest Labs/FLUX, Replicate, fal.ai). Ohne diese läuft die App im **Upload-Only**-Modus (du stellst Bilder bereit). Siehe [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

## Schnellstart (Docker)

```bash
git clone https://github.com/Luporosso76/booksocial-studio.git
cd booksocial-studio
cp server/.env.example server/.env   # edit as needed
docker compose up -d --build
# → http://localhost:8771   (data persists in ./data)
```

> Bildgenerierung (lokale GPU) ist innerhalb des Containers **nicht** verfügbar — Docker läuft im Upload-Only-Modus.

## Schnellstart (manuell / Entwicklung)

```bash
# backend
cd server && npm ci && npm run dev      # tsx watch on :8770

# frontend (separate terminal)
cd web && npm ci && npm run dev         # Vite dev server, proxied to the API
```

Produktion (einzelner Prozess, der das erstellte Frontend bereitstellt):

```bash
cd web && npm ci && npm run build       # outputs web/dist
cd ../server && npm ci && npm start     # serves API + ../web/dist on :8770
```

## Sicherheitshinweis für Remote-Server

BookSocial Studio ist als **Local-First, Single-User**-App konzipiert und bindet standardmäßig an `127.0.0.1`. Das gebündelte Docker Compose setzt `HOST=0.0.0.0` und mappt einen Port der Einfachheit halber — wenn du es auf einem VPS ausführst oder außerhalb von localhost exponierst, **aktiviere `AUTH_USER` und `AUTH_PASS`** und setze es hinter einen Reverse Proxy mit HTTPS. Exponiere die App nicht öffentlich ohne Authentifizierung: Sie kann auf lokale Projektdaten, KI-Provider-Schlüssel und Social-Publishing-Tokens zugreifen.

## Unterstützte Betriebsmodi

### Lokale Nutzung (Einzelperson)
Starte den Server auf deinem lokalen Rechner (`HOST=127.0.0.1`, Standard) und greife nur von dieser Maschine darauf zu. HTTPS ist optional: Wenn kein TLS-Zertifikat bereitgestellt wird und `openssl` verfügbar ist, generiert der Server automatisch ein selbstsigniertes Zertifikat (der Common Name wird über `TLS_CN` gesetzt, Standard `localhost`); andernfalls fällt er auf einfaches HTTP zurück. Akzeptiere die Browserwarnung einmalig bei Verwendung eines selbstsignierten Zertifikats.

### Heimnetz oder Büro-LAN
Die Bereitstellung im lokalen Netzwerk ist möglich, wenn folgende Vorkehrungen getroffen werden:
- Ändere die Standardzugangsdaten `admin` / `12345678` (die App erzwingt dies vor der ersten Nutzung).
- Nutze **HTTPS** (selbstsigniertes Zertifikat oder eines einer internen CA).
- Der Login ist durch **Rate-Limiting** geschützt: Nach `LOGIN_MAX_ATTEMPTS` aufeinanderfolgenden Fehlversuchen (Standard 5) wird das Konto für `LOGIN_BLOCK_SECONDS` Sekunden gesperrt (Standard 900). Die Sitzungsdauer ist über `SESSION_TTL_DAYS` konfigurierbar (Standard 30 Tage); alle Sitzungen werden bei Passwortänderung invalidiert. Das Session-Cookie trägt das `Secure`-Flag nur, wenn der Kanal HTTPS ist.
- Hochgeladene Dateien werden auf Größe, Erweiterung, MIME-Typ und Magic Bytes geprüft (`MAX_BOOK_BYTES`, `MAX_IMAGE_BYTES`, `MAX_MUSIC_BYTES`).
- Generiere einen `BOOKSOCIAL_SECRET_KEY` (siehe unten) und bewahre ihn **außerhalb** des Datenvolumens auf.

### Öffentliches Internet (ohne zusätzliches Hardening nicht empfohlen)
BookSocial Studio ist nicht für die direkte Exposition im Internet ausgelegt. Falls du es dennoch tust: Beende TLS an einem Reverse Proxy (nginx, Caddy…), erzwinge Rate Limits, führe regelmäßige Backups durch und setze einen starken externen `BOOKSOCIAL_SECRET_KEY`. **`0.0.0.0` ohne HTTPS zu binden legt den gesamten Datenverkehr im Klartext offen** — der Server protokolliert in diesem Fall eine Warnung.

### Geheimer Schlüssel & Backups

**Geheimer Schlüssel.** Secrets (Facebook-Tokens, KI-API-Schlüssel) werden verschlüsselt in `secrets.enc` im Datenverzeichnis gespeichert. Der AES-Schlüssel wird aus `BOOKSOCIAL_SECRET_KEY` gelesen, sofern gesetzt; andernfalls generiert der Server automatisch eine `secret.key`-Datei im Datenverzeichnis und protokolliert eine Warnung. Für jede Nutzung, die über eine rein lokale Maschine hinausgeht, generiere einen starken Schlüssel und bewahre ihn außerhalb des Datenvolumens auf:

```bash
openssl rand -hex 32
```

Speichere ihn in einem Passwort-Manager oder Secrets-Vault und übergib ihn als Umgebungsvariable (`BOOKSOCIAL_SECRET_KEY=<Wert>` in `server/.env` oder deiner Docker Compose-Umgebung). Geht der Schlüssel verloren, wird `secrets.enc` unlesbar — du musst alle Tokens und API-Schlüssel in den Einstellungen neu eingeben.

**Backups.** Der gesamte Anwendungszustand liegt im Datenverzeichnis (`BOOKSOCIAL_DATA_DIR`). Backup = dieses Verzeichnis kopieren, einschließlich `secrets.enc`:

```
<data>/booksocial.sqlite   # alle App-Daten
<data>/books/              # importierte Bücher
<data>/media/              # Bilder und Videos
<data>/music/              # Musiktracks
<data>/secrets.enc         # verschlüsselte Secrets
```

Bewahre `BOOKSOCIAL_SECRET_KEY` an einem separaten, sicheren Ort auf. Ohne ihn kann `secrets.enc` nicht entschlüsselt werden.

## Konfiguration

Alle Konfigurationen erfolgen über Umgebungsvariablen — siehe [`server/.env.example`](server/.env.example). Highlights:

| Variable | Zweck | Standard |
|---|---|---|
| `PORT` / `HOST` | API/Server Bind | `8770` / `127.0.0.1` |
| `BOOKSOCIAL_DATA_DIR` | Datenordner (DB + Medien + Musik + Bücher) | `./data` (innerhalb des Projekts) |
| `CONTENT_PROVIDER` | KI-Text-Engine (oder `none`, dann in den Einstellungen konfigurieren) | `none` |
| `FB_API_VERSION` | Meta Graph API Version | `v21.0` |

> **Wo ist der Datenordner?** Standardmäßig befindet er sich in `./data` innerhalb des Projektordners (er wird von git ignoriert, also niemals committet) — ein Ort für die DB, Medien, Musik und Bücher. Setze `BOOKSOCIAL_DATA_DIR`, um ihn an einen beliebigen anderen Ort zu legen (ein absoluter Pfad wird für die Produktion empfohlen). Das gebündelte Docker-Setup verwendet `BOOKSOCIAL_DATA_DIR=/data`, das auf `./data` gemappt ist, sodass es dem Standard entspricht.

Wähle deinen Text-Provider und dein Modell in **Settings → AI** aus, oder setze sie über die entsprechenden `*_MODEL` Umgebungsvariablen — siehe [`server/.env.example`](server/.env.example) und [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

## Daten & Speicherung

Alles befindet sich unter dem **Datenverzeichnis** (`BOOKSOCIAL_DATA_DIR`), unabhängig davon, wo die App installiert ist:

```
<data>/booksocial.sqlite   # the database (SQLite)
<data>/books/              # imported .md books
<data>/media/              # uploaded & generated images/video
<data>/music/              # per-book music tracks
```

Backup = Datenordner kopieren. App verschieben = Ordner verschieben. **Secrets** (Facebook-Tokens, KI-API-Schlüssel) werden hier **verschlüsselt** in `secrets.enc` gespeichert; Abonnement-CLI-Logins verbleiben in der CLI.

## Einschränkungen

- **Bildgenerierung** läuft standardmäßig lokal auf einer GPU (`sd-cli`); Cloud-Backends (OpenAI, Google Imagen, Stability, Black Forest Labs/FLUX, Replicate, fal.ai) sind verfügbar, und ohne diese degradiert die App zu **Upload-Only**. Lokale Generierung ist ohne dedizierte GPU langsam — siehe [`docs/TESTED-ON.md`](docs/TESTED-ON.md).
- **Single-User, Local-First** (keine Mandantenfähigkeit). Optionale HTTP Basic Auth über `AUTH_USER`/`AUTH_PASS`; bindet standardmäßig an `127.0.0.1`.
- KI-Provider-Schlüssel & Meta-Verbindung werden in den **Settings** (verschlüsselt in `secrets.enc` aufbewahrt) oder über `.env` konfiguriert.
- Es ist keine Musik gebündelt — bring dein eigenes lizenzfreies Audio für Reels und Storys mit.

## Haftungsausschluss

Du bist verantwortlich für die Bücher, die du importierst (verwende Inhalte, die dir gehören oder für die du die Nutzungsrechte hast), und für die Einhaltung der Meta-Plattformbedingungen und der Richtlinien für automatisierte Veröffentlichungen. Dieses Projekt wird wie besehen (as-is) bereitgestellt.

## Lizenz

**PolyForm Noncommercial License 1.0.0** — kostenlos zu nutzen, modifizieren, auszuführen und zu teilen für jeden **nicht-kommerziellen** Zweck (persönlich, Forschung, Bildung, Non-Profit-Organisationen, öffentliche Einrichtungen). **Kommerzielle Nutzung ist nicht gestattet.** Siehe [`LICENSE`](LICENSE).

Dies ist eine *Source-Available*-Lizenz, keine OSI "Open Source"-Lizenz (Open-Source-Lizenzen können die kommerzielle Nutzung nicht einschränken). Für kommerzielle Lizensierung kontaktiere den Autor.

---

*`server/nlp/` ist ein optionaler Python-NLP-Pre-Pass (führe `server/nlp/setup.sh` aus, um seine venv zu erstellen).*
