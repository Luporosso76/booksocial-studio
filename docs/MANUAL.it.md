# Manuale utente di BookSocial Studio

## Panoramica

BookSocial Studio trasforma un libro in contenuti social attenti agli spoiler per le Pagine Facebook e gli account Instagram Business collegati. Ti aiuta a importare e analizzare manoscritti, generare bozze e contenuti visivi, programmare post, pubblicare contenuti, gestire commenti e analizzare gli insight.

L'app è local-first. I tuoi dati risiedono in un database SQLite locale e in file locali. I segreti come i token di Facebook e le chiavi API AI sono archiviati crittografati in `secrets.enc` all'interno della cartella dei dati, non nel database.

L'interfaccia è bilingue, italiano e inglese. Le voci di navigazione principali sono: **Books**, **Planner**, **Scheduled**, **Insights**, **Connection**, **Page management** e **Settings**.

Per l'installazione e la prima configurazione, vedi [SETUP.md](./SETUP.md). Per i dettagli sui provider AI, vedi [PROVIDERS.md](./PROVIDERS.md). Per la configurazione e il comportamento specifici di Instagram, vedi [INSTAGRAM.md](./INSTAGRAM.md). Per la macchina locale testata e le note sulla generazione di immagini, vedi [TESTED-ON.md](./TESTED-ON.md).

## Concetti principali

| Concetto | Significato |
| --- | --- |
| Libri | Manoscritti Markdown importati. L'app analizza ogni libro ricavandone un profilo, personaggi, capitoli e una bibbia visiva. |
| Pagine | Pagine Facebook connesse. Una Pagina può avere anche un account Instagram Business collegato. |
| Bozze | Contenuti social generati non ancora programmati o pubblicati. |
| Post programmati | Contenuti in coda per la pubblicazione futura. Alcuni elementi sono programmati nativamente su Facebook, mentre altri sono gestiti dallo scheduler interno dell'app. |
| Provider di testo | Il provider AI utilizzato per scrivere post, analizzare libri, profili, personaggi, hashtag e altre attività testuali. |
| Provider di immagini | Il provider o motore locale utilizzato per generare immagini di scena e contenuti visivi. |
| Bibbia visiva | Un insieme di riferimenti visivi strutturati per il libro, tra cui l'aspetto dei personaggi, le schede scena, gli abiti, gli oggetti di scena, i dettagli del mondo, i personaggi secondari e la presenza dei personaggi per capitolo. |

### Modello di pubblicazione

| Tipo di contenuto | Come viene programmato | Cosa deve essere in esecuzione al momento della pubblicazione |
| --- | --- | --- |
| Post nativi Facebook | Programmati su Facebook | Facebook li pubblica anche se BookSocial Studio è spento. |
| Facebook Reels e Stories | Scheduler interno | Il server di BookSocial Studio deve essere in esecuzione. |
| Elementi Instagram | Scheduler interno | Il server di BookSocial Studio deve essere in esecuzione. |

Instagram non ha una programmazione nativa in questa app. Ogni elemento programmato su Instagram è un job locale separato collegato al suo gemello su Facebook.

## Sommario

- [Libri](#books)
- [Analisi del libro e bibbia visiva](#book-analysis-and-the-visual-bible)
- [Dettagli del libro](#book-detail)
- [Connessione](#connection)
- [Gestione pagina](#page-management)
- [Planner](#planner)
- [Programmati](#scheduled)
- [Insight](#insights)
- [Impostazioni: AI](#settings-ai)
- [Configurazione Graph API: Meta](#graph-api-setup-meta)
- [Flussi di lavoro comuni](#common-workflows)
- [Note importanti](#important-notes)

## Libri

La schermata **Books** è la tua libreria. Elenca i libri importati come schede e ti fornisce il punto di accesso per importare, aprire, provare un esempio o eliminare libri.

### Cosa fa

Ogni scheda del libro mostra il titolo del libro, l'autore, il badge della lingua e il conteggio degli hashtag di base. Se la libreria è vuota, la schermata offre due punti di partenza: importare un libro o provare il libro di esempio incluso, **The Keeper of the Tides**.

### Cosa puoi fare

| Azione | Come funziona |
| --- | --- |
| Importare un libro | Importa un file Markdown con estensione `.md`. |
| Impostare metadati opzionali | Durante l'importazione, puoi impostare l'autore e la lingua. |
| Aprire un libro | Apri la scheda del libro per gestire profilo, capitoli, personaggi, link, immagini e musica. |
| Provare il libro di esempio | Importa il libro di esempio incluso, **The Keeper of the Tides**. |
| Eliminare un libro | Rimuovi un libro dalla libreria. |

### Note

- Solo i file Markdown con estensione `.md` possono essere importati.
- Il libro appare immediatamente dopo l'importazione.
- L'analisi AI viene eseguita in background dopo l'importazione.
- L'analisi richiede un text provider configurato. Se non è configurato alcun text provider, l'analisi fallisce con un errore chiaro.
- Il progresso viene interrogato dall'app e un avviso conferma il completamento.

## Analisi del libro e bibbia visiva

Dopo che un libro è stato importato, BookSocial Studio lo analizza e costruisce una struttura attenta agli spoiler utilizzata per la generazione dei post e la coerenza delle immagini.

### Cosa fa

L'analisi estrae i capitoli, crea un profilo generato dall'AI con sinossi, generi e tono, e identifica i personaggi. La bibbia visiva è una pipeline in background, ripristinabile, in modalità best-effort. Se un passaggio fallisce, gli altri possono comunque essere eseguiti.

I passaggi canonici della bibbia visiva sono:

| Ordine | Passaggio | Scopo |
| --- | --- | --- |
| 1 | Aspetto dei personaggi | Crea una descrizione fisica stabile per ogni personaggio per immagini coerenti. |
| 2 | Schede scena dei capitoli | Crea luogo per capitolo, ambiente, oggetti principali e secondari, personaggi presenti e regole di fisica o realismo. Questi guidano i prompt delle immagini. |
| 3 | Abiti | Crea abbigliamento canonico per ogni personaggio, con varianti per le ambientazioni ricorrenti. |
| 4 | Oggetti di scena e mondo | Estrae veicoli e oggetti ricorrenti, oltre al lato di guida (destro o sinistro) dedotto dal libro. |
| 5 | Personaggi secondari | Analizza figure incidentali per ogni capitolo e assegna aspetti fissi. Questo passaggio è lento. |
| 6 | Presenza dei personaggi | Registra in quali capitoli appare ogni personaggio. Questo viene usato per filtrare la generazione di immagini per personaggio. |

### Cosa puoi fare

| Azione | Dove | Risultato |
| --- | --- | --- |
| Seguire il progresso dell'importazione | Modale di importazione | Mostra i tre passaggi di importazione: Leggi, Analizza, Salva. |
| Rivedere lo stato della bibbia visiva | Pannello bibbia visiva nella schermata del libro | Mostra ogni passaggio come in attesa, in esecuzione, completato o fallito, con un contatore completati/totali. |
| Costruire l'intera bibbia visiva | Pannello bibbia visiva | Esegue tutti i passaggi della bibbia visiva. |
| Eseguire un singolo passaggio | Pannello bibbia visiva | Esegue solo il passaggio della bibbia visiva selezionato. |

### Note

- La bibbia visiva viene costruita in background.
- Il processo è ripristinabile e in modalità best-effort.
- Un fallimento in un passaggio della bibbia visiva non blocca gli altri.
- Il passaggio della presenza dei personaggi viene utilizzato in seguito quando si scelgono i personaggi per la generazione delle immagini.

## Dettagli del libro

La schermata dei dettagli del libro è dove gestisci i dati operativi per un singolo libro. Ha sei schede: **Profile**, **Chapters**, **Characters**, **Links**, **Images** e **Music**.

### Cosa fa

Questa schermata ti permette di modificare i dati del libro che controllano la generazione dei contenuti: titolo, autore, hashtag, direttive visive, Pagine associate, capitoli, personaggi, link del libro, immagini generate e dati musicali legati al libro.

### Cosa puoi fare

| Scheda | Azioni |
| --- | --- |
| Profile | Rinomina titolo e autore; modifica hashtag di base; configura direttive visive; modifica oggetti di scena e mondo; rivedi personaggi secondari; associa il libro alle Pagine connesse. |
| Chapters | Includi o escludi capitoli; modifica schede scena; rigenera schede scena; salva le modifiche alle schede scena. |
| Characters | Aggiungi, modifica ed elimina personaggi; generare aspetti; generare abiti; rivedere la presenza nei capitoli in sola lettura. |
| Links | Aggiungi, modifica ed elimina link del libro. |
| Images | Genera immagini di scena; visualizza le immagini in una lightbox; rigenera immagini; carica immagini manualmente; rigenera in blocco le immagini selezionate. |
| Music | Accedi alla scheda Music del libro. |

### Scheda Profile

La scheda **Profile** controlla le impostazioni a livello di libro che si applicano ai contenuti generati.

| Campo o area | Cosa significa | Modificabile |
| --- | --- | --- |
| Titolo | Titolo del libro. | Sì |
| Autore | Autore del libro. | Sì |
| Profilo generato dall'AI | Sinossi, generi e tono. | No |
| Badge anti-spoiler | Indica che il comportamento anti-spoiler è attivo. | No |
| Hashtag di base | Hashtag applicati a ogni post per il libro. | Sì |
| Domini visivi | Interruttori predefiniti di direttive visive per libro. | Sì |
| Direttive artistiche a testo libero | Istruzioni visive aggiuntive, tradotte automaticamente in inglese per i prompt delle immagini. | Sì |
| Oggetti di scena e mondo | Paese, lato di guida ed elenco di oggetti ricorrenti. | Sì |
| Personaggi secondari | Elenco di figure incidentali dalla bibbia visiva. | Sì |
| Pagine associate | Pagine connesse collegate a questo libro. | Sì |

La generazione si rivolge sempre a una Pagina associata, quindi collega il libro alle Pagine che vuoi utilizzare per la generazione dei contenuti.

### Scheda Chapters

La scheda **Chapters** controlla la disponibilità a livello di capitolo e i dati dei prompt delle immagini.

| Azione | Risultato |
| --- | --- |
| Includere un capitolo | Permette di utilizzare il capitolo nei lotti di immagini. |
| Escludere un capitolo | Salta il capitolo nei lotti di immagini. |
| Modificare una scheda scena | Cambia luogo, ambiente, oggetti, personaggi o regole di fisica. |
| Rigenerare una scheda scena | Ricrea la scheda scena del capitolo. |
| Salvare una scheda scena | Salva le tue modifiche. |

### Scheda Characters

La scheda **Characters** controlla le informazioni sul cast e la coerenza visiva.

| Campo o azione | Scopo |
| --- | --- |
| Nome | Nome del personaggio. |
| Ruolo | Ruolo nel libro. |
| Lavoro | Lavoro del personaggio. |
| Personaggio | Descrizione del personaggio. |
| Aspetto fisico | Aspetto stabile utilizzato per la coerenza delle immagini. |
| Note | Note aggiuntive sul personaggio. |
| Abiti per contesto | Definizioni di abbigliamento per le ambientazioni ricorrenti. |
| Generare aspetti | Crea o aggiorna le descrizioni dell'aspetto dei personaggi. |
| Generare abiti | Crea o aggiorna le definizioni degli abiti. |
| Presenza | Elenco in sola lettura dei capitoli in cui appare il personaggio. |

### Scheda Links

La scheda **Links** archivia i link del libro che possono essere utilizzati per canale e politica.

| Campo | Significato |
| --- | --- |
| Tipo di canale | Il canale a cui è destinato il link. |
| Politica di utilizzo | Come dovrebbe essere utilizzato il link. |
| URL | La destinazione del link. |
| Etichetta | Etichetta del link leggibile dall'uomo. |
| Flag predefinito | Contrassegna un link come predefinito. |

### Scheda Images

La scheda **Images** gestisce le immagini di scena generate e caricate.

| Azione | Dettagli |
| --- | --- |
| Generare immagini di scena | Scegli quantità per capitolo, formato, capitoli, personaggi opzionali e impostazioni di flashback opzionali. |
| Lasciare vuoti i capitoli | Utilizza una distribuzione automatica anti-spoiler. |
| Includere personaggi | Scegli opzionalmente i personaggi da includere. |
| Utilizzare flashback | Richiedi opzionalmente un'età più giovane e abiti d'epoca per quel lotto. |
| Monitorare la generazione | Osserva il contatore in tempo reale e il timer per ogni immagine. |
| Accodare altri lotti | Aggiungi ulteriori lotti di generazione. |
| Annullare la generazione | Ferma un lotto in esecuzione o in coda. |
| Aprire la lightbox | Visualizza l'immagine a grandezza naturale e i metadati. |
| Rigenerare | Rigenera l'immagine selezionata. |
| Rigenerare con modifiche | Aggiungi istruzioni extra o impostazioni di flashback. |
| Rigenerare dal capitolo | Seleziona i personaggi dal cast del capitolo. |
| Rigenerare in blocco | Rigenera le immagini selezionate. |
| Caricare manualmente | Aggiungi la tua immagine alla libreria. |

La lightbox delle immagini mostra i metadati: capitolo o capitoli di origine, personaggi, prompt, timestamp e nota di catalogo.

### Note

- La generazione delle immagini di scena viene eseguita in serie: una immagine alla volta su una singola GPU.
- La pubblicazione delle bozze può dipendere da un contenuto visivo pronto. Le bozze con contenuti visivi ancora in fase di rendering non possono essere pubblicate finché non sono pronte.
- Gli hashtag di base si applicano a ogni post per il libro.
- Le direttive visive vengono tradotte automaticamente in inglese per i prompt delle immagini.

## Connessione

La schermata **Connection** collega BookSocial Studio alle Pagine Facebook utilizzando un token di Pagina utente di sistema Meta.

### Cosa fa

Archivia i token di Pagina crittografati in `secrets.enc` e ti permette di scegliere quali Pagine l'app debba gestire. I token non vengono mai archiviati nel database.

### Cosa puoi fare

| Azione | Risultato |
| --- | --- |
| Incollare un token di accesso di Pagina | Avvia il flusso di connessione. |
| Connettere | L'app elenca le Pagine gestite da quel token. |
| Selezionare Pagine | Sceglie quali Pagine BookSocial Studio debba gestire. |
| Salvare | Memorizza le connessioni alle Pagine selezionate. |
| Rivedere le Pagine connesse | Ogni Pagina salvata mostra un badge **Connected**. |
| Rimuovere una Pagina | Rimuove una Pagina salvata dall'app. |
| Disconnettere tutte | Cancella i token dall'archivio crittografato. |

### Note

- Al salvataggio, l'app rileva automaticamente l'account Instagram Business collegato a ogni Pagina tramite `instagram_business_account`.
- Se l'account Instagram non viene trovato immediatamente, verrà risolto pigramente in seguito.
- La scheda Instagram nella gestione della pagina appare solo quando una Pagina ha un account Instagram Business collegato.
- Per i dettagli sulla configurazione di Instagram, vedi [INSTAGRAM.md](./INSTAGRAM.md).

## Gestione pagina

La schermata **Page management** è dove gestisci le Pagine connesse dopo la configurazione. Presenta schede delle piattaforme in alto.

### Cosa fa

La schermata ti permette di gestire i contenuti Facebook pubblicati, i commenti, i contenuti programmati nativamente su Facebook, le impostazioni della Pagina, i commenti ai media di Instagram, i job interni programmati di Instagram e le informazioni sull'account Instagram.

La scheda della piattaforma **Facebook** è sempre disponibile. La scheda della piattaforma **Instagram** appare solo se la Pagina selezionata ha un account Instagram Business collegato.

### Cosa puoi fare

| Piattaforma | Area | Azioni |
| --- | --- | --- |
| Facebook | Posts & comments | Rivedere i post pubblicati, modificare il testo, fissare o rimuovere in alto, visualizzare e gestire i commenti, eliminare i post. |
| Facebook | Cassetto di creazione post | Pubblicare ora o programmare un post Facebook nativo con testo, link opzionale e data opzionale. |
| Facebook | Scheduled on Facebook | Visualizzare i contenuti programmati nativamente su Facebook. |
| Facebook | Page settings | Modificare informazioni o descrizione, sito web, contatti e immagine di copertina, quindi salvare su Facebook. |
| Instagram | Posts & comments | Rivedere Reels, Posts e Stories pubblicati con i conteggi di mi piace e commenti; gestire i commenti. |
| Instagram | Scheduled | Rivedere i job Instagram interni in sospeso collegati a Facebook Reels o Stories programmati. |
| Instagram | Account | Visualizzare le informazioni del profilo. |

### Facebook: Posts & Comments

La sottoscheda **Posts & comments** elenca i post Facebook pubblicati con miniatura, data, estratto e badge come **pinned** o **not published**.

| Azione | Risultato |
| --- | --- |
| Modificare il testo | Aggiorna il testo del post. |
| Fissare o rimuovere in alto | Cambia se il post è fissato. |
| Visualizzare commenti | Apre la gestione dei commenti per il post. |
| Rispondere | Aggiunge una risposta nidificata a un commento. |
| Nascondere o mostrare | Cambia la visibilità del commento. |
| Mi piace | Mette "mi piace" a un commento. |
| Eliminare commento | Elimina un commento. |
| Eliminare post | Elimina il post. |

Il cassetto **Create post** include un'anteprima dal vivo in stile Facebook e richiede una conferma esplicita. Se la data è vuota, il post viene pubblicato immediatamente. Se viene fornita una data, viene programmato nativamente su Facebook.

### Facebook: Scheduled on Facebook

Questa sottoscheda mostra i contenuti programmati nativamente su Facebook.

### Facebook: Page Settings

Questa sottoscheda ti permette di modificare i campi della Pagina e salvarli su Facebook.

| Campo | Risultato |
| --- | --- |
| Informazioni o descrizione | Aggiorna il campo di testo della Pagina. |
| Sito web | Aggiorna il sito web della Pagina. |
| Contatto | Aggiorna le informazioni di contatto della Pagina. |
| Immagine di copertina | Aggiorna l'immagine di copertina della Pagina. |

### Instagram: Posts & Comments

La sottoscheda dei media di Instagram mostra Reels, Posts e Stories pubblicati con il conteggio dei mi piace e dei commenti.

| Azione | Risultato |
| --- | --- |
| Espandere un elemento multimediale | Apre i suoi commenti. |
| Rispondere | Aggiunge una risposta nidificata a un commento. |
| Nascondere commento | Nasconde un commento. |
| Eliminare commento | Elimina un commento. |

### Instagram: Scheduled

Questa sottoscheda mostra i job Instagram interni in attesa. Questi sono i job gemelli dei Facebook Reels o Stories programmati.

### Instagram: Account

Questa sottoscheda mostra le informazioni del profilo Instagram.

| Campo | Modificabile in BookSocial Studio |
| --- | --- |
| Username | No |
| Bio | No |
| Conteggio follower | No |
| Conteggio seguiti | No |
| Conteggio media | No |
| Immagine | No |

### Note

- I contenuti programmati su Facebook mostrati in **Scheduled on Facebook** sono di sola lettura qui e dovrebbero essere gestiti su Facebook.
- I campi del profilo Instagram sono di sola lettura tramite l'API. Modificali nell'app di Instagram.
- Il pannello Instagram appare solo quando la Pagina selezionata ha un account Instagram Business collegato.

## Planner

La schermata **Planner** crea una settimana tipo, un mese o un periodo personalizzato di contenuti social per una Pagina e un Libro selezionati.

### Cosa fa

Utilizza quote, finestre di tempo, il libro selezionato e la Pagina selezionata per generare bozze in modo asincrono. L'app sceglie giorni, orari, formati, evita duplicati e renderizza i contenuti visivi in background.

### Cosa puoi fare

| Azione | Dettagli |
| --- | --- |
| Scegliere una Pagina | Seleziona la Pagina connessa per cui generare. |
| Scegliere un Libro | Seleziona il libro associato da cui generare. |
| Impostare le quote | Scegli quanti post, reel e storie generare nel periodo scelto (totale, non a settimana). |
| Impostare finestre di tempo | Aggiungi un orario o un intervallo di tempo per giorno feriale. |
| Rimuovere finestre di tempo | Rimuovi le finestre singolarmente. |
| Scegliere un periodo | Seleziona settimana, mese o intervallo di date personalizzato. |
| Generare | Avvia un job server asincrono che crea bozze e renderizza contenuti visivi. |
| Osservare il progresso | Segui il progresso dal vivo come `N/M`. |
| Annullare | Ferma il job di generazione. Le bozze create rimangono. |

### Periodi

| Periodo | Durata |
| --- | --- |
| Settimana | 7 giorni; predefinito. |
| Mese | 28 giorni. |
| Intervallo personalizzato | Intervallo di date selezionato dall'utente. |

### Finestre di tempo

| Tipo di finestra | Comportamento |
| --- | --- |
| Orario singolo | Pubblica entro circa 30 minuti. |
| Intervallo di tempo | Il motore sceglie un orario all'interno dell'intervallo. |
| Nessuna finestra | Si applicano le impostazioni predefinite. |

### Elenco delle bozze generate

Ogni scheda bozza generata mostra tipo, angolazione, formato, stato, orario programmato e un'anteprima in stile Facebook. L'anteprima include una ripartizione degli hashtag: di base, specifici e finali.

| Azione bozza | Risultato |
| --- | --- |
| Modificare | Cambia testo, hashtag e data/ora. |
| Rigenerare | Crea nuovo testo e nuovi hashtag e renderizza nuovamente il contenuto visivo. L'app controlla fino a quando non è pronto. |
| Eliminare | Rimuove la bozza. |
| Pubblicare ora | Pubblica immediatamente dopo conferma esplicita. |
| Programmare la pubblicazione | Converte tutte le bozze con date future in elementi programmati dopo la conferma. |

### Note

- I Reels e le Stories sono video verticali 9:16.
- I post sono contenuti di testo/foto.
- Le bozze il cui contenuto visivo è ancora in fase di rendering mostrano un segnaposto.
- L'opzione **Publish now** è disabilitata finché il contenuto visivo di una bozza non è pronto.
- Quando si programma in blocco, i post di Facebook vengono programmati nativamente su Facebook e possono essere pubblicati anche se l'app è spenta.
- Reels e Stories sono programmati tramite lo scheduler interno, quindi il server deve essere acceso all'orario previsto.

## Programmati

La schermata **Scheduled** mostra la coda di pubblicazione interna.

### Cosa fa

Elenca i Reels e le Stories che il server di BookSocial Studio pubblicherà automaticamente agli orari programmati.

### Cosa puoi fare

| Azione | Disponibilità | Risultato |
| --- | --- | --- |
| Pubblicare ora | Per elemento, con conferma | Pubblica immediatamente l'elemento in coda. |
| Rimuovere | Per elemento, se non ancora pubblicato | Rimuove l'elemento dalla coda interna. |
| Pubblicare anche su Instagram | Solo Facebook Reels e Stories, formato video 9:16 | Crea un job gemello su Instagram con lo stesso orario e collegato all'elemento Facebook. |
| Rimuovere il gemello Instagram | Elementi con un job Instagram gemello | Rimuove il job Instagram collegato. |

### Note

- Un banner ben visibile avverte che il server deve essere in esecuzione all'orario programmato.
- Se il server non è in esecuzione, i Reels, le Stories e i job di Instagram non verranno pubblicati.
- I post nativi di Facebook non sono gestiti da questa coda e vengono pubblicati indipendentemente su Facebook.
- Quando viene pubblicato un elemento Facebook con un gemello Instagram, il server lo pubblica anche su Instagram con la stessa didascalia.

## Insight

La schermata **Insights** ti aiuta a rivedere le prestazioni della Pagina e dell'account.

### Cosa fa

Scegli una Pagina e un periodo, poi controlli gli insight di Facebook e, se collegato, gli insight di Instagram.

### Cosa puoi fare

| Azione | Dettagli |
| --- | --- |
| Scegliere una Pagina | Usa le schede della Pagina. |
| Scegliere un periodo | Scegli giorno, settimana o mese. |
| Visualizzare insight di Facebook | Disponibili per le Pagine Facebook connesse. |
| Visualizzare insight di Instagram | Disponibili quando la Pagina ha un account Instagram Business collegato. |
| Confrontare Pagine | Disponibile quando sono connesse due o più Pagine. |

### Insight di Facebook

| Area | Cosa mostra |
| --- | --- |
| Riquadri KPI | Follower, mi piace/fan, copertura, interazioni. |
| Grafico tendenza follower | Incrementi in verde, perdite in rosso e totale netto. |
| Post principali | I migliori 10 per interazioni, con visualizzazioni, copertura, reazioni, commenti, condivisioni e un link a Facebook. |
| Grafico storico a linee | Copertura e follower nel tempo. |
| Sparkline copertura | Tendenza della copertura. |
| Demografia | Principali paesi, città e sesso-età. |
| Tabella di confronto Pagine | Confronto tra le Pagine quando sono connesse due o più Pagine. |

### Insight di Instagram

| Area | Cosa mostra |
| --- | --- |
| KPI dell'account | Follower, account seguiti e numero di media. |
| Insight dell'account per il periodo | Copertura, visualizzazioni del profilo e conteggio follower. |

### Note

- Nella tabella di confronto Pagine, ogni cella si carica in modo indipendente.
- Se una Pagina non riesce a caricare nella tabella di confronto, la cella di quella Pagina mostra `—`.
- Alcune metriche di Instagram potrebbero non essere disponibili a seconda dell'account o della versione dell'API. L'app gestisce l'assenza di dati in modo elegante.

## Impostazioni: AI

La schermata **Settings** configura il provider di testo AI, il provider di immagini, la modalità immagine e il QA opzionale delle immagini.

### Cosa fa

BookSocial Studio utilizza un provider di testo integrabile per l'analisi e la scrittura, e un provider di immagini integrabile per i contenuti visivi delle scene. Puoi configurarli entrambi qui.

### Cosa puoi fare

| Azione | Risultato |
| --- | --- |
| Configurare il provider di testo | Abilita l'analisi del libro, la scrittura dei post, la generazione degli hashtag e le attività testuali correlate. |
| Configurare il provider di immagini | Abilita le immagini di scena generate e i contenuti visivi generati per le bozze. |
| Testare la connessione del testo | Restituisce successo con un esempio o un errore chiaro. |
| Testare la connessione delle immagini | Restituisce successo con un esempio o un errore chiaro. |
| Scegliere la modalità immagine | Seleziona Library o Direct. |
| Abilitare il QA delle immagini | Convalida le immagini generate e rigenera quelle fallite con backoff. |

### Provider di testo

Ci sono due famiglie di provider di testo.

| Famiglia | Provider | Autenticazione e configurazione |
| --- | --- | --- |
| Abbonamento via CLI | opencode, codex (ChatGPT), gemini (Google) | Nessuna chiave API viene memorizzata nell'app. Il pannello mostra lo stato di installazione della CLI, un pulsante **Authenticate** che lancia il login CLI, e un pulsante **Verify** che ricontrolla lo stato. C'è un campo opzionale per il nome del modello per la CLI. |
| Chiave API | Endpoint OpenAI e compatibili con OpenAI, Anthropic, Google, Ollama | Inserisci la chiave API, opzionalmente imposta un URL di base, e scegli il modello da una lista caricata tramite **Load models**, con fallback manuale. Ollama è locale e non usa alcuna chiave. |

Per i provider con chiave API, le chiavi vengono memorizzate crittografate in `secrets.enc`. Una chiave inserita una volta per un provider viene riutilizzata, ad esempio per le immagini dello stesso provider, ed è mostrata come già impostata.

Quando è necessario il nome di un modello specifico, inserisci il modello che hai scelto / il nome del modello del tuo provider.

### Provider di immagini

| Opzione provider | Significato |
| --- | --- |
| local | Usa un motore sul dispositivo. Vedi [TESTED-ON.md](./TESTED-ON.md). |
| auto | Usa il locale se disponibile, altrimenti nessuno. |
| none | Disabilita le immagini generate; usa la modalità solo caricamento. |
| OpenAI | Provider di immagini in cloud; riutilizza la chiave di testo condivisa. |
| Google | Provider di immagini in cloud; riutilizza la chiave di testo condivisa. |
| Stability | Provider di immagini in cloud con una chiave propria. |
| Black Forest Labs (FLUX) | Provider di immagini in cloud con una chiave propria. |
| Replicate | Provider di immagini in cloud con una chiave propria. |
| fal.ai | Provider di immagini in cloud con una chiave propria. |

Il campo del modello immagine è a testo libero. Inserisci il modello che hai scelto / il nome del modello del tuo provider. Nessun modello di immagine è preimpostato.

### Modalità immagine

| Modalità | Comportamento |
| --- | --- |
| Library | Le immagini generate vanno in una libreria riutilizzabile, e puoi scegliere le immagini per bozza. |
| Direct | Il contenuto visivo viene renderizzato direttamente sulle bozze durante la generazione della settimana. Ciò richiede un motore di immagini funzionante. |

### QA delle immagini

Quando il QA delle immagini è abilitato, ogni immagine generata viene convalidata e rigenerata se fallisce il controllo. I tentativi utilizzano il backoff.

### Note

- Anthropic è disponibile come provider con chiave API (nessun login in abbonamento).
- L'autenticazione tramite abbonamento CLI risiede nella CLI stessa; nessun token di abbonamento viene memorizzato in BookSocial Studio.
- Per la configurazione specifica dei provider, vedi [PROVIDERS.md](./PROVIDERS.md).

## Configurazione Graph API: Meta

La configurazione Meta è necessaria prima che BookSocial Studio possa gestire le Pagine Facebook o gli account Instagram Business collegati.

### Cosa fa

La configurazione Meta fornisce all'app l'accesso a Pagine, post, commenti, insight e alla pubblicazione su Instagram dove disponibile.

### Cosa puoi fare

| Area | Requisito |
| --- | --- |
| Facebook | Crea un'app Meta con Facebook Login. |
| Facebook | Crea un token di Pagina utente di sistema con i permessi per leggere e gestire la Pagina, i post, i commenti e gli insight. |
| Facebook | Incolla il token della Pagina nella schermata **Connection**. |
| Instagram | Aggiungi il prodotto **Instagram API with Facebook Login**. |
| Instagram | Includi `instagram_basic` e `instagram_content_publish`. |
| Instagram | Collega l'account Instagram Business alla Pagina Facebook. |
| Instagram | Assegna l'account Instagram Business all'Utente di Sistema. |
| Instagram | Assicurati che il token della Pagina contenga gli scope di Instagram. |

I permessi di Facebook includono esempi come `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `pages_manage_engagement/comments` e `pages_read_user_content`.

### Note

- La mappatura di Instagram è: una Pagina Facebook verso un account Instagram Business.
- Le note dettagliate su Instagram si trovano in [INSTAGRAM.md](./INSTAGRAM.md).

## Flussi di lavoro comuni

### 1. Importare e analizzare un libro

1. Apri **Books**.
2. Scegli **Import a book**.
3. Seleziona un file Markdown `.md`.
4. Opzionalmente imposta autore e lingua.
5. Conferma l'importazione.
6. Attendi mentre l'app legge, analizza e salva il libro.
7. Apri il libro quando appare l'avviso di completamento.
8. Rivedi il profilo, i capitoli, i personaggi e lo stato della bibbia visiva.

### 2. Configurare l'AI prima di importare

1. Apri **Settings**.
2. Scegli un provider di testo.
3. Autenticati tramite un provider CLI o inserisci una chiave API, a seconda della famiglia del provider.
4. Se utilizzi un provider con chiave API, usa **Load models** o inserisci manualmente il modello che hai scelto / il nome del modello del tuo provider.
5. Esegui l'azione **Test** del testo.
6. Scegli un provider di immagini se desideri immagini generate.
7. Inserisci il modello immagine che hai scelto / il nome del modello del tuo provider se richiesto.
8. Esegui l'azione **Test** delle immagini.
9. Scegli la modalità immagine **Library** o **Direct**.

### 3. Connettere una Pagina Facebook

1. Apri **Connection**.
2. Incolla un token di accesso di Pagina Utente di Sistema Meta.
3. Seleziona **Connect**.
4. Rivedi le Pagine gestite dal token.
5. Seleziona le Pagine che desideri siano gestite da BookSocial Studio.
6. Seleziona **Save**.
7. Conferma che le Pagine salvate mostrino il badge **Connected**.
8. Se la Pagina ha un account Instagram Business collegato, attendi il rilevamento automatico o la risoluzione pigra.

### 4. Associare un libro a una Pagina

1. Apri **Books**.
2. Apri il libro.
3. Vai alla scheda **Profile**.
4. Trova **Associated pages**.
5. Seleziona le Pagine connesse a cui dovrebbe essere consentita la generazione.
6. Salva le impostazioni del libro pertinenti.

### 5. Costruire o riparare la bibbia visiva

1. Apri **Books**.
2. Apri il libro.
3. Espandi il pannello **Visual bible**.
4. Rivedi lo stato di ogni passaggio e il contatore completati/totali.
5. Seleziona **Build visual bible** per eseguire tutti i passaggi.
6. Oppure esegui un singolo passaggio se solo un'area richiede lavoro.
7. Rivedi i passaggi falliti senza dare per scontato che l'intera pipeline sia fallita, poiché i passaggi sono best-effort e indipendenti.

### 6. Generare immagini di scena

1. Apri il libro.
2. Vai alla scheda **Images**.
3. Scegli la quantità per capitolo.
4. Scegli il formato.
5. Seleziona i capitoli, oppure lascia i capitoli vuoti per una distribuzione automatica anti-spoiler.
6. Opzionalmente scegli i personaggi da includere.
7. Opzionalmente abilita un flashback con età più giovane e abiti d'epoca per il lotto.
8. Avvia la generazione.
9. Osserva il contatore in tempo reale e il timer per ogni immagine.
10. Apri le immagini generate nella lightbox per rivedere l'output a grandezza naturale e i metadati.

### 7. Pianificare una settimana di contenuti

1. Apri **Planner**.
2. Scegli una Pagina.
3. Scegli un Libro associato a quella Pagina.
4. Imposta le quote (totale per il periodo scelto) per post, reel e storie.
5. Aggiungi finestre di tempo per i giorni feriali o lasciale vuote per usare i valori predefiniti.
6. Scegli **week** come periodo.
7. Seleziona **Generate**.
8. Osserva il progresso in tempo reale `N/M`.
9. Rivedi ogni scheda bozza generata.
10. Modifica, rigenera, elimina o pubblica le bozze secondo necessità.

### 8. Programmare le bozze future

1. Genera bozze in **Planner**.
2. Rivedi le bozze e apporta modifiche.
3. Assicurati che i contenuti visivi siano pronti per le bozze che ne richiedono uno.
4. Seleziona **Schedule publishing**.
5. Leggi la conferma che spiega la differenza tra la programmazione nativa di Facebook e lo scheduler interno.
6. Conferma.
7. Ricorda che i post di Facebook sono programmati nativamente su Facebook, mentre Reels e Stories richiedono che il server di BookSocial Studio sia attivo al momento della pubblicazione.

### 9. Pubblicare una bozza immediatamente

1. Apri **Planner**.
2. Trova la scheda della bozza.
3. Conferma che qualsiasi contenuto visivo richiesto sia pronto.
4. Seleziona **Publish now**.
5. Conferma esplicitamente.

### 10. Aggiungere la pubblicazione su Instagram a un Reel o una Story programmati

1. Apri **Scheduled**.
2. Trova un Facebook Reel o Story in formato video 9:16.
3. Abilita **Publish also on Instagram**.
4. Conferma che venga creato un job gemello su Instagram con lo stesso orario.
5. Mantieni il server in esecuzione all'orario programmato.
6. Rimuovi il gemello se non vuoi più che l'elemento venga pubblicato su Instagram.

### 11. Gestire i commenti di Facebook

1. Apri **Page management**.
2. Seleziona la Pagina.
3. Apri la scheda **Facebook**.
4. Apri **Posts & comments**.
5. Scegli un post.
6. Visualizza i commenti.
7. Rispondi, nascondi o mostra, metti mi piace o elimina i commenti secondo necessità.

### 12. Analizzare le prestazioni

1. Apri **Insights**.
2. Scegli una Pagina.
3. Scegli giorno, settimana o mese.
4. Rivedi i riquadri KPI di Facebook, i grafici, i post principali, la demografia e lo storico.
5. Se Instagram è collegato, apri la scheda Instagram.
6. Rivedi i KPI dell'account e gli insight dell'account disponibili.
7. Se sono connesse due o più Pagine, rivedi la tabella di confronto delle Pagine.

## Note importanti

### Sicurezza

- I token di Facebook e le chiavi API AI sono archiviati in modo crittografato (AES-256-GCM) in `secrets.enc`, mai nel database.
- L'autenticazione tramite abbonamento CLI risiede nella CLI stessa. Nessun token di abbonamento viene memorizzato in BookSocial Studio.
- Usa la schermata **Connection** per disconnettere le Pagine o cancellare i token di Pagina memorizzati.

### Limiti Meta

- I campi del profilo Instagram sono di sola lettura tramite l'API. Modificali nell'app di Instagram.
- Instagram non ha una programmazione nativa in questa app, quindi la pubblicazione su Instagram utilizza job interni.
- Alcune metriche di Instagram sono incoerenti tra le diverse versioni dell'API e potrebbero non essere disponibili.
- La mappatura di Instagram è: una Pagina Facebook verso un account Instagram Business.

### Prestazioni

- L'analisi del libro e la generazione settimanale sono asincrone e mostrano il progresso dal vivo.
- La generazione locale delle immagini è la parte più pesante.
- La generazione locale delle immagini viene eseguita in serie, un'immagine alla volta sul dispositivo.
- Vedi [TESTED-ON.md](./TESTED-ON.md) per la macchina testata e le note sulla generazione locale delle immagini.

### Il server deve rimanere acceso

- Lo scheduler interno deve essere in esecuzione all'orario programmato per Reels, Stories e gli elementi di Instagram.
- Se il server è spento all'orario programmato, quegli elementi programmati internamente non verranno pubblicati.
- I post nativi di Facebook vengono pubblicati indipendentemente perché sono programmati su Facebook.