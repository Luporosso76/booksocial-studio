# Contributing to BookSocial Studio

Thanks for your interest in improving BookSocial Studio. This is a **local-first, source-available**
project and contributions are welcome — bug fixes, new AI providers, and documentation.

> **License note:** the project is released under **PolyForm Noncommercial License 1.0.0** (see
> [`LICENSE`](LICENSE)). It is *source-available*, not an OSI "open source" license: you may use,
> modify and share it for any **noncommercial** purpose, but **commercial use is not permitted**. By
> contributing you agree your contributions are provided under these same terms.

---

## Repository structure

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

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how these fit together.

---

## Running in development

Prerequisite: **Node.js 24** (see `.nvmrc`).

```bash
# Backend (hot reload, tsx watch on :8770)
cd server && npm ci && npm run dev

# Frontend (Vite dev server, separate terminal)
cd web && npm ci && npm run dev
```

Copy `server/.env.example` to `server/.env` and configure at least a text provider — see
[`docs/SETUP.md`](docs/SETUP.md) and [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

---

## Code style & checks

- **TypeScript everywhere.** Follow the existing patterns; keep changes small and focused.
- **Keep the types green.** Before opening a PR:

```bash
# Backend
cd server && npm run typecheck   # tsc --noEmit, must be clean

# Frontend
cd web && npm run build          # tsc -b && vite build, must succeed
```

- Match existing naming, error handling (text engines throw `ContentError`; image engines return
  `null` on failure), and import conventions in the file you're editing.
- Don't commit secrets, the data folder, or build output (`web/dist`, `node_modules`).

---

## Adding a new AI provider

The text and image engines are the project's two extension points, each with a small interface and a
central `switch` registry. Adding a provider means implementing the interface and adding one `case` —
no caller changes.

- **Text provider:** implement `ContentEngine` and register it in `createEngine()`
  (`server/src/content/engine.ts`).
- **Image provider:** implement `ImageEngine` and register it in `createImageEngine()`
  (`server/src/media/imageEngine.ts`).

Add any new config to `server/src/config.ts` (read from env) and document the env vars in
`server/.env.example`. Full walkthrough with example code: **[`docs/PROVIDERS.md`](docs/PROVIDERS.md)
→ "Add a new provider in code".**

---

## Proposing changes (Pull Requests)

1. Fork and create a topic branch (`fix/...`, `feat/...`, `docs/...`).
2. Make your change with the smallest viable diff.
3. Run the checks above (typecheck, web build) and verify locally.
4. Open a PR using the [PR template](.github/PULL_REQUEST_TEMPLATE.md); link the related issue and
   describe how you tested it.

For bugs and ideas, open an issue first using the
[bug report](.github/ISSUE_TEMPLATE/bug_report.md) or
[feature request](.github/ISSUE_TEMPLATE/feature_request.md) templates.

---

## Reporting security or token issues

If a change could leak tokens or keys, do **not** include real secrets in the issue. Describe the
problem and steps to reproduce with placeholders.
