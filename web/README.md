# BookSocial Studio — Frontend (web/)

UI in React + Vite + TypeScript + Tailwind per BookSocial Studio. Tema scuro,
motion intenzionale (principi Emil Kowalski), contro il contratto API in
`../MIGRATION_SPEC.md`.

## Avvio in sviluppo

```bash
cd web
npm install        # prima volta
npm run dev        # Vite + HMR su http://localhost:5173
```

Le chiamate a `/api` sono inoltrate al backend su `http://127.0.0.1:8770`
tramite il proxy di Vite (`vite.config.ts`). Se il backend non e attivo, la UI
mostra stati di caricamento ed errori gentili senza andare in crash.

## Build di produzione

```bash
npm run build      # tsc -b + vite build -> web/dist
npm run preview    # anteprima del bundle
```

In produzione il backend serve `web/dist` come static piu le rotte `/api`.

## Struttura

```
web/
  src/
    api/        client fetch tipizzato + tipi del contratto + endpoints
    components/
      layout/   Sidebar, Header (stato app)
      ui/       Button, Card, Input/Field, Modal, toast, misc (Badge, EmptyState, Skeleton, Spinner, ErrorBanner)
    lib/        cn, useAsync (loading/error), status provider
    screens/    Connessione, Libri, DettaglioLibro, Pianificatore, Dashboard
  tailwind.config.js   token tema scuro + easing custom
  vite.config.ts       proxy /api -> 8770
```

## Note di design
- Easing custom `cubic-bezier(0.23,1,0.32,1)`, durate 150-250ms.
- Feedback `:active` sui bottoni (`scale 0.97`), modali in `scale(0.96)+opacity`.
- `prefers-reduced-motion`: i movimenti diventano dissolvenze brevi.
- Hashtag base e specifici mostrati distinti nelle bozze.
