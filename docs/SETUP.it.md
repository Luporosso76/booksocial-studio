# Guida al setup

Questa è una guida passo passo per installare **BookSocial Studio** e trasformare il tuo primo libro in contenuti per i social media. Non richiede esperienza di sviluppo precedente — copia i comandi così come sono scritti.

BookSocial Studio viene eseguito **localmente sulla tua macchina**. I tuoi libri, immagini e token rimangono sul tuo computer in un database SQLite locale.

> Gli screenshot in questa guida sono segnaposto contrassegnati con **TODO screenshot** — verranno aggiunti in seguito.

---

## 1. Prerequisiti

Hai bisogno di **uno** dei seguenti elementi:

- **Docker** (consigliato per iniziare più facilmente) — [installa Docker](https://docs.docker.com/get-docker/), oppure
- **Node.js 22 o 24** per un'installazione manuale (testato su entrambi in CI; `.nvmrc` fissa la 24).

Per pubblicare su Facebook avrai anche bisogno di (successivamente, inizialmente opzionale):

- Una **Pagina Facebook** e un account **Meta Business**.
- La tua **app Meta** (creabile gratuitamente su [developers.facebook.com](https://developers.facebook.com)).

Puoi esplorare l'intera app (importare un libro, generare contenuti, renderizzare video) **senza** Facebook.

---

## 2. Avvio rapido

### Opzione A — Docker (consigliato)

```bash
git clone <your-fork-url> booksocial-studio
cd booksocial-studio
cp server/.env.example server/.env   # edit later if needed
docker compose up -d --build
```

Quindi apri **http://localhost:8771**. I tuoi dati persistono nella cartella `./data` accanto al progetto.

> Nota: la **generazione di immagini** AI locale (GPU) non è disponibile all'interno di Docker. Nel container l'app funziona in modalità **solo upload** per le immagini, oppure puoi puntarla verso un provider di immagini cloud (vedi passo 4).

![Home di BookSocial Studio](docs/img/home.png)
*TODO screenshot*

### Opzione B — Manuale (Node)

```bash
git clone <your-fork-url> booksocial-studio
cd booksocial-studio
cp server/.env.example server/.env   # edit later if needed

# Build the frontend once
cd web && npm ci && npm run build

# Build and start the server (serves the API + the built frontend on :8770)
cd ../server && npm ci && npm run build && npm run start:prod
```

Apri **http://localhost:8770**.

> Se cambi versione di Node, il modulo database nativo potrebbe richiedere una ricompilazione:
> `cd server && npm rebuild better-sqlite3`.

Per lo sviluppo attivo (hot reload) esegui invece `npm run dev` in `server/` e `web/` — vedi [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## 3. Scegli e configura un text provider AI

BookSocial Studio utilizza un **text engine** AI per analizzare il tuo libro e scrivere i post. Scegli un provider impostando `CONTENT_PROVIDER` in `server/.env`. Il valore predefinito è `none`. Il text engine funziona tramite uno strumento **CLI** con abbonamento a cui accedi, oppure un server **Ollama** locale — non esiste una modalità API HTTP a token per il testo. Riferimento completo: [`docs/PROVIDERS.md`](PROVIDERS.md).

### Usa un abbonamento esistente (CLI)

Se paghi già per ChatGPT, Claude o un piano Gemini, l'app può pilotare il tool CLI corrispondente (`opencode`, `codex`, `claude`, `agy`) che gestisce l'autenticazione con il tuo account — imposta `CONTENT_PROVIDER` di conseguenza, oppure accedi da **Settings → AI** nell'app con il pulsante **Authenticate**. Vedi [`docs/PROVIDERS.md`](PROVIDERS.md).

```bash
CONTENT_PROVIDER=codex   # oppure opencode | claude | agy
```

### Inizia con Ollama (locale e gratuito, senza key)

Installa [Ollama](https://ollama.com), scarica un modello (`ollama pull llama3.1`), quindi:

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

> Puoi anche scegliere il provider in seguito dalla schermata **Settings → AI** nell'app.

Riavvia il server dopo aver modificato `server/.env`.

---

## 4. Immagini: con o senza GPU

Le immagini AI delle scene sono **opzionali**. L'image engine è selezionato tramite `IMAGE_PROVIDER`:

- **Nessuna GPU?** Usa un provider cloud — `IMAGE_PROVIDER=openai` o `IMAGE_PROVIDER=google` (questi usano `OPENAI_API_KEY` / `GOOGLE_API_KEY`, la chiave del tuo account OpenAI / Google per le immagini).
- **Nessun provider di immagini?** Lascialo sul valore predefinito `auto` (o imposta `none`). L'app funziona in modalità **solo upload**: fornisci tu le immagini e tutto il resto (testo, programmazione, pubblicazione) funziona.
- **Hai una GPU locale?** Imposta `IMAGE_PROVIDER=local` (stable-diffusion.cpp / Z-Image). Questo **non** è disponibile all'interno di Docker — usa un'installazione manuale.

Dettagli e cambio modello: [`docs/PROVIDERS.md`](PROVIDERS.md).

---

## 5. Connetti Facebook (opzionale)

La pubblicazione su una Pagina Facebook richiede **la tua app Meta** e un **page access token**. L'app non chiede mai la tua password di Facebook — incolli un token che generi tu stesso.

Avrai bisogno di una **Pagina Facebook** e di un account **Meta Business**.

### 5.1 Crea un'app Meta

1. Vai su [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
2. Scegli un'app di tipo **Business** e collegala al tuo portafoglio Business.

### 5.2 Crea un token System User in Business Suite

1. Apri **Meta Business Suite** → **Settings** → **Business settings** → **Users → System users**.
2. Crea (o seleziona) un **System User** e **Add assets** → assegna la tua **Pagina** con controllo completo.
3. Clicca su **Generate new token**, seleziona la tua app e concedi i permessi della pagina qui sotto.
4. Copia il token generato (una lunga stringa). Un token **System User** è a lunga scadenza — mantienilo privato.

Permessi tipici da concedere:

- `pages_show_list` — elenca le Pagine che gestisci.
- `pages_read_engagement` — leggi i contenuti/interazioni della Pagina.
- `pages_manage_posts` — crea e pubblica post sulla Pagina.

> L'app legge/aggiorna anche alcuni metadati della Pagina, che potrebbero richiedere `pages_manage_metadata`. Se un'azione sulla Pagina fallisce con un errore di permessi, aggiungi lo scope mancante e rigenera il token.

### 5.3 Incolla il token nell'app

1. In BookSocial Studio apri la schermata **Connection**.
2. Incolla il tuo token System User nel campo token e conferma.
3. L'app chiama Facebook per elencare le Pagine che gestisci e ti permette di connetterne una.

Il tuo token è salvato **crittografato a riposo** in `secrets.enc` all'interno della cartella data — non viene mai committato o inviato da nessuna parte tranne alla Graph API di Facebook.

![Schermata Connection](docs/img/connection.png)
*TODO screenshot*

> Sei responsabile del rispetto dei Platform Terms di Meta e delle policy sulla pubblicazione automatizzata.

---

## 6. Provalo ora — importa il libro di esempio

Un romanzo di esempio pronto all'uso è incluso nel repository: [`samples/the-keeper-of-tides.md`](../samples/the-keeper-of-tides.md).

1. Apri la schermata **Books** e scegli **Import book**.
2. Seleziona `samples/the-keeper-of-tides.md` (un file Markdown).
3. Lascia che l'analisi proceda — otterrai una sinossi, i personaggi e una bibbia visiva.
4. Apri il **Planner** per creare un piano settimanale di post, Reel e storie.

![Importa libro](docs/img/import.png)
*TODO screenshot*

Questo è un testo originale e fittizio fornito per permetterti di provare l'app senza usare i tuoi libri.

---

## 7. Dove risiedono i tuoi dati e come fare backup

Tutto è memorizzato nella **directory dei dati** (`BOOKSOCIAL_DATA_DIR`, predefinita `./data` all'interno della cartella del progetto, ignorata da git; Docker mappa la stessa `./data`):

```
<data>/booksocial.sqlite   # the database
<data>/books/              # imported .md books
<data>/media/              # uploaded & generated images / video
<data>/music/              # per-book music tracks
```

I segreti (token di Facebook, chiavi API AI) sono conservati **crittografati** in `secrets.enc` all'interno della cartella dei dati (AES-256-GCM). La chiave di crittografia è `BOOKSOCIAL_SECRET_KEY` se impostata, altrimenti una `secret.key` autogenerata (permessi 0600) nella stessa cartella.

**Backup = copia la cartella data.** Per spostare l'app su un'altra macchina, copia questa cartella. Per ricominciare da zero, ferma l'app ed elimina (o rinomina) la cartella.

---

## Risoluzione dei problemi

- **Il server non si avvia / errore del text provider** — assicurati che `CONTENT_PROVIDER` sia uno tra `opencode`, `codex`, `claude`, `agy` o `ollama`, e che la CLI corrispondente sia installata e autenticata (oppure passa a `ollama`). Riavvia dopo la modifica.
- **Errori `better-sqlite3` dopo aver cambiato Node** — esegui `cd server && npm rebuild better-sqlite3`.
- **Nessuna immagine generata** — è normale in Docker / senza una GPU. Usa un provider di immagini cloud o carica le tue immagini. Vedi [`docs/PROVIDERS.md`](PROVIDERS.md).
- **La connessione a Facebook fallisce** — ricontrolla i permessi del token (sezione 5.2) e che il System User abbia la Pagina assegnata.

Successivo: [`docs/PROVIDERS.md`](PROVIDERS.md) · [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) · [`CONTRIBUTING.md`](../CONTRIBUTING.md)
