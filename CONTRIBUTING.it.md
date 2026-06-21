# Contribuire a BookSocial Studio

Grazie per l'interesse nel migliorare BookSocial Studio. Questo è un progetto **local-first, source-available** e i contributi sono benvenuti — bug fix, nuovi provider AI e documentazione.

> **Nota sulla licenza:** il progetto è rilasciato sotto **PolyForm Noncommercial License 1.0.0** (vedi [`LICENSE`](LICENSE)). È *source-available*, non una licenza OSI "open source": puoi usarlo, modificarlo e condividerlo per qualsiasi scopo **non commerciale**, ma **l'uso commerciale non è permesso**. Contribuendo, accetti che i tuoi contributi siano forniti sotto questi stessi termini.

---

## Struttura della repository

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

Consulta [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) per capire come si integrano.

---

## Esecuzione in sviluppo

Prerequisiti: **Node.js 22 o 24** (vedi `.nvmrc`).

```bash
# Backend (hot reload, tsx watch on :8770)
cd server && npm ci && npm run dev

# Frontend (Vite dev server, separate terminal)
cd web && npm ci && npm run dev
```

Copia `server/.env.example` in `server/.env` e configura almeno un text provider — vedi
[`docs/SETUP.md`](docs/SETUP.md) e [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

---

## Stile del codice & controlli

- **TypeScript ovunque.** Segui i pattern esistenti; mantieni le modifiche piccole e mirate.
- **Mantieni i tipi corretti.** Prima di aprire una PR:

```bash
# Backend
cd server && npm run typecheck   # tsc --noEmit, must be clean

# Frontend
cd web && npm run build          # tsc -b && vite build, must succeed
```

- Rispetta la nomenclatura esistente, la gestione degli errori (i text engine lanciano `ContentError`; gli image engine ritornano `null` in caso di fallimento) e le convenzioni di import nel file che stai modificando.
- Non fare commit di segreti, della cartella dati o dell'output di build (`web/dist`, `node_modules`).

---

## Aggiungere un nuovo provider AI

I text engine e gli image engine sono i due punti di estensione del progetto, ciascuno con una piccola interfaccia e un registro `switch` centrale. Aggiungere un provider significa implementare l'interfaccia e aggiungere un `case` — nessuna modifica ai chiamanti.

- **Text provider:** implementa `ContentEngine` e registralo in `createEngine()`
  (`server/src/content/engine.ts`).
- **Image provider:** implementa `ImageEngine` e registralo in `createImageEngine()`
  (`server/src/media/imageEngine.ts`).

Aggiungi ogni nuova configurazione in `server/src/config.ts` (letta dall'env) e documenta le env var in
`server/.env.example`. Guida completa con codice di esempio: **[`docs/PROVIDERS.md`](docs/PROVIDERS.md)
→ "Aggiungere un nuovo provider nel codice".**

---

## Proporre modifiche (Pull Request)

1. Fai un fork e crea un topic branch (`fix/...`, `feat/...`, `docs/...`).
2. Apporta la tua modifica con il diff più piccolo possibile.
3. Esegui i controlli sopra indicati (typecheck, web build) e verifica localmente.
4. Apri una PR utilizzando il [template della PR](.github/PULL_REQUEST_TEMPLATE.md); collega la issue relativa e descrivi come hai testato la modifica.

Per bug e idee, apri prima una issue utilizzando i template [bug report](.github/ISSUE_TEMPLATE/bug_report.md) o [feature request](.github/ISSUE_TEMPLATE/feature_request.md).

---

## Segnalare problemi di sicurezza o relativi ai token

Se una modifica potrebbe esporre token o chiavi, **non** includere segreti reali nella issue. Descrivi il problema e i passaggi per riprodurlo utilizzando dei placeholder.
