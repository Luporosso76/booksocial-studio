# Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.

Il formato è basato su [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
e questo progetto aderisce al [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-06-26

### Aggiunto

- **Età ed etnia dei personaggi**: ora campi dedicati e modificabili (non più diluiti nella descrizione fisica). Vengono indicati esplicitamente in ogni prompt immagine, così l'età apparente e l'etnia restano coerenti in tutte le illustrazioni.
- **Capo firma**: un capo o accessorio che un personaggio indossa sempre (es. un cappello particolare) si imposta una volta e viene reso in ogni scena, sopra l'abito della scena.
- **Momenti di scena (sogno / flashback)**: ogni scheda capitolo registra ora la natura della scena principale (normale, sogno o flashback) più eventuali sogni o flashback secondari, tutti modificabili in tab dedicati. Le scene di sogno hanno un aspetto onirico; i flashback rendono i personaggi più giovani.
- **Utilizzo immagini**: ogni immagine mostra quante volte è stata usata e in cosa (reel, storie, post), con un filtro per vedere solo le usate o le mai usate.
- **Utilizzo musiche**: le tracce mostrano lo stesso badge di utilizzo (reel / storie) con filtro usate / mai usate.
- **Sotto-tab immagini per formato e capitolo**: la libreria immagini si filtra per formato e, dentro un formato, per capitolo, con i conteggi — e puoi generare immagini solo per quel capitolo.
- **Pulizia automatica dei media pubblicati**: i video di reel/storie/post renderizzati vengono cancellati 24 ore dopo la pubblicazione su Facebook e Instagram, per liberare spazio. I file renderizzati sono ora in una sottocartella dedicata `media/renders/`.

### Modificato

- **Maggiore coerenza dei personaggi nei prompt immagine**: età, etnia, corporatura e capelli sono sempre indicati per ogni persona; quando due o più personaggi sono nell'inquadratura restano distinti e non vengono mai scambiati; le pose sono naturali e dritte; un personaggio richiesto esplicitamente compare sempre.

### Corretto

- **Niente più soggetti fuori posto**: ciò che compare solo in un sogno, un ricordo o un modo di dire (e gli omonimi come la manovra "tartaruga" nel surf) non finisce più nella scena reale del capitolo.

## [0.3.1] - 2026-06-24

### Aggiunto

- **Annulla i singoli elementi in coda**: ora puoi annullare un singolo lotto in attesa nella coda di
  generazione immagini, oltre ad «Annulla tutto».

### Modificato

- **Generazione immagini serializzata**: le generazioni di libri diversi e le rigenerazioni vengono ora
  accodate ed eseguite una alla volta invece che in parallelo; l'indicatore di attività distingue
  «in corso» da «in coda».

### Corretto

- **Pannello attività in primo piano**: il menu attività dell'header ora compare sopra la griglia delle
  immagini quando si scorre.

## [0.3.0] - 2026-06-24

### Aggiunto

- **Schede marketing del capitolo**: una comprensione narrativa persistente di ogni capitolo (sintesi
  non-spoiler, nucleo emotivo, domanda al lettore, citazioni sicure e angoli-post con punteggio) che
  fonda la generazione dei post, costruita una volta per capitolo e riusata.
- **Idea ranker con rotazione degli angoli**: i post attingono agli angoli pre-vagliati del capitolo e
  ruotano tra loro, così un capitolo riusato dà ogni volta un angolo diverso (massima varietà).
- **Giudice di qualità**: un passaggio finale che scarta i post generici (quelli che andrebbero bene per
  qualunque libro) e li rigenera una volta con un'indicazione mirata.
- **Editor della presenza personaggio per capitolo**: imposta a mano in quali capitoli compare un personaggio.
- **Immagini riproducibili**: il seed di generazione viene salvato con ogni immagine generata.

### Modificato

- **Post più ancorati al libro**: una checklist interna impone a ogni post di usare un dettaglio concreto
  del capitolo, con citazioni reali non-spoiler e un linguaggio più anti-generico e anti-AI.
- **Abiti e oggetti di scena seguono le direttive visive del libro**: gli abiti per pratiche/cerimonie/
  epoca e gli oggetti chiave descritti nelle direttive vengono ora rispettati nel canone e nelle schede
  scena dei capitoli.
- **Le quote del pianificatore sono il totale del periodo scelto** (settimana/mese/personalizzato),
  senza scalature nascoste; il pianificatore ora garantisce che ogni contenuto richiesto venga piazzato,
  anche con pochi slot orari.
- **Pannello immagini di scena ridisegnato**: sezioni Capitoli/Personaggi collassabili e layout più compatto.

- Il giudice di qualità valuta i post anche rispetto alla scheda marketing del capitolo, non solo all'estratto, evitando bocciature ingiuste.
- Le citazioni della scheda marketing vengono verificate sul testo reale del capitolo; quelle inventate o parafrasate vengono scartate.

### Corretto

- Reimportare un libro con testo modificato ora invalida le schede marketing dei capitoli, così i post si basano sul nuovo testo.
- La generazione dei post viene bloccata quando la scheda del libro non è aggiornata rispetto al testo importato, così i post non si basano mai su una scheda superata.
- La modifica degli hashtag di una bozza ora viene salvata correttamente.
- Post, reel e storie senza visual restano bozze invece di fallire in pubblicazione.

## [0.2.0] - 2026-06-23

### Aggiunto

- **Istruzioni extra dei prompt modificabili** (Impostazioni): testo libero aggiunto in coda ai prompt di testo e immagine,
  sia globali che per libro, in aggiunta al core ingegnerizzato (le regole core non vengono mai sovrascritte).
- **Dashboard**: un **calendario** settimanale + mensile dei contenuti programmati con colori per libro, KPI compatti
  per pagina (Facebook + Instagram) e una scheda delle attività in background con progresso e timer live.
- **Provider AI CLI-first**: generazione di testi e immagini tramite CLI in abbonamento (opencode, Codex,
  Gemini) affiancate alle chiavi API, con un provider/modello di fallback dedicato e un pannello delle impostazioni AI a quattro schede.
- **Schede dei formati di immagine** (verticale 9:16 / quadrato / orizzontale) con conteggi nella libreria di immagini di un libro.
- Azione di **re-indicizzazione NLP rapida**: ri-estrarre citazioni reali senza rieseguire l'analisi completa.
- Campo **Momento chiave** sulle schede delle scene per capitolo, utilizzato per ancorare il soggetto dell'immagine.
- UI e documentazione in **cinque lingue** (IT/EN/FR/ES/DE).

### Modificato

- **Meno ripetizioni**: post, reels e stories ora scelgono le citazioni, le immagini, la musica
  e i capitoli usati meno di recente tra le varie esecuzioni, in modo che i piani settimanali consecutivi e le rigenerazioni
  scorrano l'intero materiale invece di ripeterlo.
- **Prompt AI riscritti in inglese**, mentre l'output generato rimane sempre nella lingua del libro.
- **Canone visivo più preciso**: l'aspetto dei personaggi e gli outfit sono basati su passaggi reali del libro,
  con ancoraggio a etnia/paese/epoca e parole chiave dell'abbigliamento tratte dal vocabolario effettivo del libro.
- Un passaggio extra di **umanizzazione anti-AI** sui post generati, applicato nella lingua di output.

### Corretto

- L'eliminazione di una bozza ora libera immediatamente le sue citazioni, immagini, musica e capitolo per il riutilizzo.
- I post di Facebook programmati nativamente vengono riconciliati come "pubblicati" dopo l'orario pianificato (nessun
  elemento rimasto bloccato come "programmato nel passato").
- I post pubblicati possono essere nascosti dalla dashboard senza essere eliminati.

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

[0.2.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.2.0
[0.1.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.1.0
