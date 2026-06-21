# Setup-Anleitung

Dies ist eine Schritt-für-Schritt-Anleitung zur Installation von **BookSocial Studio**, um Ihr erstes Buch in Social-Media-Inhalte zu verwandeln. Es werden keine Programmierkenntnisse vorausgesetzt — kopieren Sie die Befehle genau so, wie sie geschrieben sind.

BookSocial Studio läuft **lokal auf Ihrem eigenen Rechner**. Ihre Bücher, Bilder und Tokens verbleiben auf Ihrem Computer in einer lokalen SQLite-Datenbank.

> Screenshots in dieser Anleitung sind Platzhalter, markiert mit **TODO screenshot** — sie werden später hinzugefügt.

---

## 1. Voraussetzungen

Sie benötigen **eines** der folgenden:

- **Docker** (empfohlen für den einfachsten Start) — [Docker installieren](https://docs.docker.com/get-docker/), oder
- **Node.js 22 oder 24** für eine manuelle Installation (getestet mit beiden in der CI; `.nvmrc` pinnt 24).

Um auf Facebook zu veröffentlichen, benötigen Sie außerdem (später, anfangs optional):

- Eine **Facebook Page** und ein **Meta Business**-Konto.
- Ihre eigene **Meta app** (kostenlos erstellbar unter [developers.facebook.com](https://developers.facebook.com)).

Sie können die gesamte App erkunden (ein Buch importieren, Inhalte generieren, Videos rendern) **ohne** Facebook.

---

## 2. Schnellstart

### Option A — Docker (empfohlen)

```bash
git clone <your-fork-url> booksocial-studio
cd booksocial-studio
cp server/.env.example server/.env   # edit later if needed
docker compose up -d --build
```

Öffnen Sie dann **http://localhost:8771**. Ihre Daten bleiben im Ordner `./data` neben dem Projekt erhalten.

> Hinweis: Lokale AI-**Bildgenerierung** (GPU) ist innerhalb von Docker nicht verfügbar. Im Container läuft die App für Bilder im **upload-only**-Modus, oder Sie können sie mit einem Cloud-Bildanbieter verknüpfen (siehe Schritt 4).

![BookSocial Studio Startseite](docs/img/home.png)
*TODO screenshot*

### Option B — Manuell (Node)

```bash
git clone <your-fork-url> booksocial-studio
cd booksocial-studio
cp server/.env.example server/.env   # edit later if needed

# Build the frontend once
cd web && npm ci && npm run build

# Start the server (serves the API + the built frontend on :8770)
cd ../server && npm ci && npm start
```

Öffnen Sie **http://localhost:8770**.

> Wenn Sie die Node-Version wechseln, muss das native Datenbankmodul möglicherweise neu erstellt werden:
> `cd server && npm rebuild better-sqlite3`.

Für die aktive Entwicklung (Hot Reload) führen Sie stattdessen `npm run dev` in `server/` und `web/` aus — siehe [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## 3. Einen AI-Textanbieter auswählen und konfigurieren

BookSocial Studio verwendet eine AI-**Text-Engine**, um Ihr Buch zu analysieren und die Beiträge zu schreiben. Sie wählen einen Anbieter aus, indem Sie `CONTENT_PROVIDER` in `server/.env` festlegen. Es gibt drei Möglichkeiten zur Bezahlung/Authentifizierung. Vollständige Referenz: [`docs/PROVIDERS.md`](PROVIDERS.md).

### Start mit OpenAI (API key)

Holen Sie sich einen Schlüssel aus Ihrem OpenAI-Konto, dann in `server/.env`:

```bash
CONTENT_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Jeder **OpenAI-compatible**-Endpunkt (OpenRouter, Groq, Together, LM Studio, vLLM) funktioniert auf die gleiche Weise — setzen Sie `CONTENT_PROVIDER=openai-compatible` und verweisen Sie `OPENAI_BASE_URL` darauf.

### Start mit Ollama (lokal & kostenlos, kein Schlüssel)

Installieren Sie [Ollama](https://ollama.com), laden Sie ein Modell herunter (`ollama pull llama3.1`), dann:

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

### Ein bestehendes Abonnement nutzen (CLI)

Wenn Sie bereits für ChatGPT oder einen Google AI-Plan bezahlen, kann die App das entsprechende CLI-Tool (`opencode`, `codex`, `gemini`) steuern, welches die Authentifizierung mit Ihrem Konto übernimmt — setzen Sie `CONTENT_PROVIDER` entsprechend oder melden Sie sich in den App-**Settings → AI** über den Button **Authenticate** an. Siehe [`docs/PROVIDERS.md`](PROVIDERS.md).

> Sie können Anbieter-Schlüssel auch später auf dem in-app **Settings**-Bildschirm festlegen; Schlüssel, die Sie dort speichern, werden **verschlüsselt** auf Ihrem Rechner abgelegt.

Starten Sie den Server neu, nachdem Sie `server/.env` bearbeitet haben.

---

## 4. Bilder: mit oder ohne GPU

AI-Szenenbilder sind **optional**. Die Image-Engine wird durch `IMAGE_PROVIDER` ausgewählt:

- **Keine GPU?** Nutzen Sie einen Cloud-Anbieter — `IMAGE_PROVIDER=openai` oder `IMAGE_PROVIDER=google` (diese verwenden denselben `OPENAI_API_KEY` / `GOOGLE_API_KEY` wieder wie die Text-Engine).
- **Gar kein Bildanbieter?** Belassen Sie den Standardwert `auto` (oder setzen Sie `none`). Die App läuft im **upload-only**-Modus: Sie stellen Bilder bereit, und alles andere (Text, Zeitplanung, Veröffentlichung) funktioniert.
- **Haben Sie eine lokale GPU?** Setzen Sie `IMAGE_PROVIDER=local` (stable-diffusion.cpp / Z-Image). Dies ist innerhalb von Docker **nicht** verfügbar — nutzen Sie eine manuelle Installation.

Details und Modellwechsel: [`docs/PROVIDERS.md`](PROVIDERS.md).

---

## 5. Facebook verbinden (optional)

Die Veröffentlichung auf einer Facebook Page erfordert **Ihre eigene Meta app** und einen **page access token**. Die App fragt niemals nach Ihrem Facebook-Passwort — Sie fügen einen Token ein, den Sie selbst generieren.

Sie benötigen eine **Facebook Page** und ein **Meta Business**-Konto.

### 5.1 Eine Meta app erstellen

1. Gehen Sie zu [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
2. Wählen Sie als App-Typ **Business** und verknüpfen Sie sie mit Ihrem Business-Portfolio.

### 5.2 Einen System User Token in der Business Suite erstellen

1. Öffnen Sie die **Meta Business Suite** → **Settings** → **Business settings** → **Users → System users**.
2. Erstellen (oder wählen) Sie einen **System User** und **Add assets** → weisen Sie Ihre **Page** mit voller Kontrolle zu.
3. Klicken Sie auf **Generate new token**, wählen Sie Ihre App aus und gewähren Sie die unten stehenden Seitenberechtigungen.
4. Kopieren Sie den generierten Token (eine lange Zeichenfolge). Ein **System User** Token ist langlebig — halten Sie ihn privat.

Typische zu gewährende Berechtigungen:

- `pages_show_list` — listet die Pages auf, die Sie verwalten.
- `pages_read_engagement` — liest Inhalte/Interaktionen der Page.
- `pages_manage_posts` — erstellt und veröffentlicht Beiträge auf der Page.

> Die App liest/aktualisiert auch einige Page-Metadaten, was möglicherweise `pages_manage_metadata` erfordert. Wenn eine Page-Aktion mit einem Berechtigungsfehler fehlschlägt, fügen Sie den fehlenden Scope hinzu und generieren Sie den Token neu.

### 5.3 Den Token in die App einfügen

1. Öffnen Sie in BookSocial Studio den **Connection**-Bildschirm.
2. Fügen Sie Ihren System User Token in das Token-Feld ein und bestätigen Sie.
3. Die App ruft Facebook auf, um die von Ihnen verwalteten Pages aufzulisten, und lässt Sie eine davon verbinden.

Ihr Token wird **verschlüsselt** (encrypted at rest) in `secrets.enc` innerhalb des Datenordners gespeichert — er wird niemals committet oder irgendwohin gesendet, außer an die Graph API von Facebook.

![Connection-Bildschirm](docs/img/connection.png)
*TODO screenshot*

> Sie sind für die Einhaltung der Platform Terms und der Richtlinien für automatisiertes Posten von Meta verantwortlich.

---

## 6. Jetzt ausprobieren — das Beispielbuch importieren

Ein sofort einsatzbereiter Beispielroman wird mit dem Repo geliefert: [`samples/the-keeper-of-tides.md`](../samples/the-keeper-of-tides.md).

1. Öffnen Sie den **Books**-Bildschirm und wählen Sie **Import book**.
2. Wählen Sie `samples/the-keeper-of-tides.md` (eine Markdown-Datei).
3. Lassen Sie die Analyse laufen — Sie erhalten eine Synopsis, Charaktere und eine visuelle Bibel.
4. Öffnen Sie den **Planner**, um einen Wochenplan für Posts, Reels und Stories zu erstellen.

![Buch importieren](docs/img/import.png)
*TODO screenshot*

Dies ist ein originaler, fiktiver Text, der bereitgestellt wird, damit Sie die App ohne Ihre eigenen Bücher ausprobieren können.

---

## 7. Wo Ihre Daten liegen & wie Sie Backups erstellen

Alles wird unter dem **Datenverzeichnis** (`BOOKSOCIAL_DATA_DIR`, standardmäßig `./data` innerhalb des Projektordners, von Git ignoriert; Docker mappt dasselbe `./data`) gespeichert:

```
<data>/booksocial.sqlite   # the database
<data>/books/              # imported .md books
<data>/media/              # uploaded & generated images / video
<data>/music/              # per-book music tracks
```

Secrets (Facebook-Tokens, AI API Keys) werden **verschlüsselt** in `secrets.enc` innerhalb des Datenordners aufbewahrt (AES-256-GCM). Der Verschlüsselungsschlüssel ist `BOOKSOCIAL_SECRET_KEY`, falls gesetzt, andernfalls eine automatisch generierte `secret.key` (Modus 0600) im selben Ordner.

**Backup = Kopieren des Datenordners.** Um die App auf einen anderen Rechner zu verschieben, kopieren Sie diesen Ordner. Für einen Neustart stoppen Sie die App und löschen (oder benennen) Sie den Ordner um.

---

## Fehlerbehebung

- **Server startet nicht, meldet einen fehlenden Schlüssel** — der ausgewählte `CONTENT_PROVIDER` benötigt seinen API Key in `server/.env`. Fügen Sie ihn hinzu (oder wechseln Sie zu `ollama`) und starten Sie neu.
- **`better-sqlite3`-Fehler nach einem Node-Wechsel** — führen Sie `cd server && npm rebuild better-sqlite3` aus.
- **Keine Bilder generiert** — das ist in Docker / ohne GPU zu erwarten. Nutzen Sie einen Cloud-Bildanbieter oder laden Sie Ihre eigenen Bilder hoch. Siehe [`docs/PROVIDERS.md`](PROVIDERS.md).
- **Facebook connect schlägt fehl** — überprüfen Sie erneut die Berechtigungen des Tokens (Abschnitt 5.2) und ob dem System User die Page zugewiesen ist.

Nächster Schritt: [`docs/PROVIDERS.md`](PROVIDERS.md) · [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) · [`CONTRIBUTING.md`](../CONTRIBUTING.md)
