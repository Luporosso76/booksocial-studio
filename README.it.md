# BookSocial Studio

Trasforma un libro (Markdown) in **contenuti per social media** pronti da pubblicare — post consapevoli degli spoiler, reel e storie con testo reale, immagini AI e musica — e programmali/pubblicali su Facebook e Instagram.

Funziona **in locale e self-hosted**: i tuoi dati restano sulla tua macchina in un database SQLite integrato. I provider AI sono collegabili (tramite API key o CLI in abbonamento) e l'interfaccia utente è bilingue (italiano/inglese).

## Documentation

- 📘 **[Manuale utente](docs/MANUAL.md)** — guida operativa completa per ogni schermata (caricamento libro, pianificazione, pubblicazione, impostazioni).
- 🚀 **[Guida all'installazione](docs/SETUP.md)** — installazione, scelta di un provider AI, connessione a Facebook (per non sviluppatori).
- 🔌 **[Provider AI](docs/PROVIDERS.md)** — configurazione ed estensione dei motori di testo e immagini.
- 📸 **[Integrazione Instagram](docs/INSTAGRAM.md)** — pubblicazione di Reel/Storie, schede Facebook/Instagram, statistiche dell'account.
- 🏗️ **[Architettura](docs/ARCHITECTURE.md)** — moduli, flusso di importazione → pubblicazione, punti di estensione.
- 🖥️ **[Testato sul nostro hardware](docs/TESTED-ON.md)** — la macchina/configurazione esatta che abbiamo usato e prestazioni realistiche.
- 🤝 **[Contribuire](CONTRIBUTING.md)** — setup di sviluppo, stile del codice, come aggiungere un provider, PR.

Il manuale utente è disponibile anche in italiano, spagnolo, francese, portoghese e tedesco (`docs/MANUAL.it.md`, `.es.md`, `.fr.md`, `.pt.md`, `.de.md`). L'inglese è la versione autorevole.

**Provalo:** importa l'esempio incluso `samples/the-keeper-of-tides.md`.

## Features

- 📖 **Analisi del libro**: importa un libro `.md` → sinossi, generi, tono, personaggi (consapevole degli spoiler).
- 🎨 **Bibbia visiva** per libro: aspetto canonico dei personaggi, abiti per contesto, oggetti ricorrenti (con lato di guida), personaggi minori e schede scena per capitolo — per immagini coerenti.
- 🖼️ **Immagini scena AI** (opzionale, GPU locale) + una libreria di caricamento; rigenerazione per singola immagine e controllo qualità.
- ✍️ **Generazione di contenuti** per un piano settimanale: post / reel / storie con citazioni, hashtag e link di vendita. La logica "trova l'idea, poi umanizzala" è integrata nei prompt, quindi funziona su **qualsiasi** provider.
- 📅 **Programmazione e pubblicazione** su Facebook (programmazione nativa per i post; scheduler interno per reel/storie).
- 📸 **Instagram**: pubblica Reel/Storie su account Instagram Business collegati, gestisci media e commenti, e leggi le statistiche dell'account. Vedi [`docs/INSTAGRAM.md`](docs/INSTAGRAM.md).
- 🎬 Rendering video per reel/storie (ffmpeg) con musica, effetto Ken-Burns e dissolvenze del testo.

## Stack

- **Backend**: Node + TypeScript + [Hono](https://hono.dev), **SQLite** integrato (`better-sqlite3`).
- **Frontend**: React + Vite + Tailwind.
- **Media**: Satori/resvg (schede di testo), ffmpeg (video). Generazione immagini tramite una CLI di diffusione locale (opzionale).

## Prerequisites

- **Node.js 22 o 24** (testato su entrambe in CI; `.nvmrc` usa 24). I moduli nativi (`better-sqlite3`) sono compilati per la tua versione di Node — se cambi Node, esegui `npm rebuild better-sqlite3`.
- Un **motore di testo AI** — scegline uno qualsiasi: una **API key** (OpenAI, Anthropic, Google, o qualsiasi endpoint compatibile con OpenAI come OpenRouter/Groq, oltre a **Ollama** locale), oppure una **CLI in abbonamento** a cui accedi con un pulsante **Authenticate** (`opencode`, Codex/ChatGPT, Gemini). Vedi [`docs/PROVIDERS.md`](docs/PROVIDERS.md).
- Una **App Business Meta (Facebook) + Pagina** per pubblicare: incolli un **token Utente di sistema** nella schermata di Connessione (mantenuto crittografato in `secrets.enc`). Vedi [`docs/SETUP.md`](docs/SETUP.md).
- *Opzionale*: un **motore di immagini** per le immagini di scena AI — locale `sd-cli` (GPU), o un cloud provider (OpenAI, Google Imagen, Stability, Black Forest Labs/FLUX, Replicate, fal.ai). Senza di esso, l'app funziona in modalità **solo caricamento** (tu fornisci le immagini). Vedi [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

## Quick start (Docker)

```bash
git clone <your-fork-url> booksocial-studio
cd booksocial-studio
cp server/.env.example server/.env   # edit as needed
docker compose up -d --build
# → http://localhost:8771   (data persists in ./data)
```

> La generazione di immagini (GPU locale) **non** è disponibile all'interno del container — Docker funziona in modalità solo caricamento.

## Quick start (manual / development)

```bash
# backend
cd server && npm ci && npm run dev      # tsx watch on :8770

# frontend (separate terminal)
cd web && npm ci && npm run dev         # Vite dev server, proxied to the API
```

Produzione (processo singolo che serve il frontend compilato):

```bash
cd web && npm ci && npm run build       # outputs web/dist
cd ../server && npm ci && npm start     # serves API + ../web/dist on :8770
```

## Configuration

Tutta la configurazione avviene tramite variabili d'ambiente — vedi [`server/.env.example`](server/.env.example). Punti salienti:

| Variable | Purpose | Default |
|---|---|---|
| `PORT` / `HOST` | API/server bind | `8770` / `127.0.0.1` |
| `BOOKSOCIAL_DATA_DIR` | data folder (DB + media + music + books) | `./data` (inside the project) |
| `CONTENT_PROVIDER` | AI text engine (or `none`, then configure in Settings) | `none` |
| `FB_API_VERSION` | Meta Graph API version | `v21.0` |

Scegli il tuo provider di testo e modello in **Impostazioni → AI**, o impostali tramite le variabili d'ambiente `*_MODEL` corrispondenti — vedi [`server/.env.example`](server/.env.example) e [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

## Data & storage

Tutto risiede sotto la **directory dei dati** (`BOOKSOCIAL_DATA_DIR`), indipendente da dove l'app è installata:

```
<data>/booksocial.sqlite   # the database (SQLite)
<data>/books/              # imported .md books
<data>/media/              # uploaded & generated images/video
<data>/music/              # per-book music tracks
```

Backup = copia la cartella dei dati. Sposta l'app = sposta la cartella. I **segreti** (token Facebook, chiavi API AI) sono archiviati **crittografati** qui in `secrets.enc`; i login delle CLI in abbonamento risiedono nella CLI.

## Limitations

- **Generazione immagini** viene eseguita localmente su una GPU per impostazione predefinita (`sd-cli`); backend cloud (OpenAI, Google Imagen, Stability, Black Forest Labs/FLUX, Replicate, fal.ai) sono disponibili, e senza alcuno l'app degrada a **solo caricamento**. La generazione locale è lenta senza una GPU dedicata — vedi [`docs/TESTED-ON.md`](docs/TESTED-ON.md).
- **Singolo utente, local-first** (nessun multi-tenancy). Autenticazione HTTP Basic opzionale tramite `AUTH_USER`/`AUTH_PASS`; si lega a `127.0.0.1` per impostazione predefinita.
- Le chiavi dei provider AI e la connessione Meta sono configurate in **Impostazioni** (mantenute crittografate in `secrets.enc`) o tramite `.env`.
- Nessuna musica è inclusa — porta il tuo audio royalty-free per reel e storie.

## Disclaimer

Sei responsabile per i libri che importi (usa contenuti di tua proprietà o che hai il diritto di utilizzare) e per il rispetto dei Termini della Piattaforma Meta e delle policy sulla pubblicazione automatizzata. Questo progetto è fornito così com'è.

## License

**PolyForm Noncommercial License 1.0.0** — libero di usare, modificare, eseguire e condividere per qualsiasi scopo **non commerciale** (personale, ricerca, istruzione, no profit, istituzioni pubbliche). **L'uso commerciale non è consentito.** Vedi [`LICENSE`](LICENSE).

Questa è una licenza *source-available*, non una licenza "open source" OSI (le licenze open-source non possono limitare l'uso commerciale). Per le licenze commerciali, contatta l'autore.

---

*`server/nlp/` è un passaggio preliminare NLP Python opzionale (esegui `server/nlp/setup.sh` per creare il suo venv).*