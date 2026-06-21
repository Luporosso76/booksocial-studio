# Beitragen zu BookSocial Studio

Danke für dein Interesse daran, BookSocial Studio zu verbessern. Dies ist ein **local-first, source-available** Projekt und Beiträge sind willkommen — Bugfixes, neue AI Provider und Dokumentation.

> **Lizenzhinweis:** Das Projekt wird unter der **PolyForm Noncommercial License 1.0.0** veröffentlicht (siehe [`LICENSE`](LICENSE)). Es ist *source-available*, keine OSI-"Open Source"-Lizenz: Du darfst es für jeden **nicht-kommerziellen** Zweck nutzen, modifizieren und teilen, aber **kommerzielle Nutzung ist nicht gestattet**. Indem du zu diesem Projekt beiträgst, stimmst du zu, dass deine Beiträge unter denselben Bedingungen bereitgestellt werden.

---

## Repository-Struktur

```
server/          Backend: Node + TypeScript + Hono, embedded SQLite (better-sqlite3)
  src/content/   Text engine (analysis, canon, post generation) — ContentEngine + createEngine()
  src/media/     Image engine + rendering (Satori/resvg, ffmpeg/Remotion) — ImageEngine + createImageEngine()
  src/scheduler/ Background publish scheduler
  src/services/  Higher-level orchestration (week planning, publishing, page connect)
  src/db/        SQLite schema, pool, repositories
  src/secrets/   Encrypted file store for tokens/keys (secrets.enc)
  src/facebook/  Facebook Graph API client
web/             Frontend: React + Vite + Tailwind
  src/screens/   Top-level screens (Books, Planner, Scheduled, Insights, Connection, Page management, Settings…)
docs/            Documentation (MANUAL, SETUP, PROVIDERS, INSTAGRAM, ARCHITECTURE)
samples/         Sample book to try the app
```

Siehe [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) um zu sehen, wie diese zusammenwirken.

---

## In der Entwicklung ausführen

Voraussetzung: **Node.js 22 oder 24** (siehe `.nvmrc`).

```bash
# Backend (hot reload, tsx watch on :8770)
cd server && npm ci && npm run dev

# Frontend (Vite dev server, separate terminal)
cd web && npm ci && npm run dev
```

Kopiere `server/.env.example` nach `server/.env` und konfiguriere mindestens einen Text-Provider — siehe [`docs/SETUP.md`](docs/SETUP.md) und [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

---

## Code-Style & Checks

- **Überall TypeScript.** Befolge die bestehenden Muster; halte Änderungen klein und fokussiert.
- **Halte die Typen grün.** Bevor du einen PR öffnest:

```bash
# Backend
cd server && npm run typecheck   # tsc --noEmit, must be clean

# Frontend
cd web && npm run build          # tsc -b && vite build, must succeed
```

- Passe dich den bestehenden Benennungs-, Fehlerbehandlungs- (Text-Engines werfen `ContentError`; Image-Engines geben bei Fehler `null` zurück) und Import-Konventionen in der Datei an, die du bearbeitest.
- Committe keine Secrets, den data-Ordner oder Build-Ausgaben (`web/dist`, `node_modules`).

---

## Einen neuen AI Provider hinzufügen

Die Text- und Image-Engines sind die beiden Erweiterungspunkte des Projekts, jeweils mit einem kleinen Interface und einer zentralen `switch`-Registrierung. Einen Provider hinzuzufügen bedeutet, das Interface zu implementieren und ein `case` hinzuzufügen — keine Änderungen an den Aufrufern.

- **Text-Provider:** implementiere `ContentEngine` und registriere sie in `createEngine()` (`server/src/content/engine.ts`).
- **Image-Provider:** implementiere `ImageEngine` und registriere sie in `createImageEngine()` (`server/src/media/imageEngine.ts`).

Füge jede neue Konfiguration zu `server/src/config.ts` hinzu (aus env gelesen) und dokumentiere die env-Variablen in `server/.env.example`. Vollständiger Leitfaden mit Beispielcode: **[`docs/PROVIDERS.md`](docs/PROVIDERS.md) → "Einen neuen Provider im Code hinzufügen".**

---

## Änderungen vorschlagen (Pull Requests)

1. Forke und erstelle einen Topic-Branch (`fix/...`, `feat/...`, `docs/...`).
2. Nimm deine Änderung mit dem kleinstmöglichen Diff vor.
3. Führe die obigen Checks aus (typecheck, web build) und überprüfe lokal.
4. Öffne einen PR mithilfe des [PR-Templates](.github/PULL_REQUEST_TEMPLATE.md); verlinke das zugehörige Issue und beschreibe, wie du getestet hast.

Für Bugs und Ideen öffne zuerst ein Issue mithilfe der [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) oder [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) Templates.

---

## Sicherheits- oder Token-Probleme melden

Falls eine Änderung Tokens oder Keys leaken könnte, füge **keine** echten Secrets in das Issue ein. Beschreibe das Problem und die Schritte zur Reproduktion mit Platzhaltern.
