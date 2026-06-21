# Integrazione Instagram

Questo documento descrive il supporto a Instagram costruito sopra l'integrazione Facebook: pubblicazione di Reel/Storie, e le tab Facebook/Instagram con gestione e insight per account. I path dei file di seguito si riferiscono al layout dell'applicazione (`server/src/...`, `web/src/...`).

## Panoramica

Instagram è modellato come un **target di pubblicazione secondario collegato a una Pagina Facebook**. Ogni Pagina Facebook connessa può avere un account Instagram Business collegato (`instagram_business_account`); quando presente, il suo id viene messo in cache sulla pagina e sblocca le funzionalità di Instagram.

Sono state aggiunte due funzionalità:

1. **Pubblicazione** di Reel e Storie (video 9:16) su Instagram.
2. **Gestione e insight**: una tab Facebook/Instagram sia nella schermata *Gestione pagina* sia in *Insight*, che mostra media IG, commenti e metriche dell'account.

## Modello di pubblicazione

Instagram **non ha una API di scheduling nativa**. Per mantenere la parità con lo scheduling nativo di Facebook, ogni elemento Instagram è un **job locale separato**: una riga `scheduled_post` con `platform = 'instagram'`, collegata al suo gemello Facebook (`linked_post_id`) e che condivide lo stesso orario programmato. Il `publishScheduler` interno lo pubblica alla scadenza (il server deve essere in esecuzione).

- Solo i **Reel e le Storie con un video 9:16 renderizzato** sono idonei.
- La caption rispecchia la caption visiva dell'elemento Facebook (le Storie la ignorano).
- La creazione del job è **idempotente** (`idempotency_key = ig:<fbPostId>`), quindi attivare "Pubblica anche su Instagram" due volte non crea duplicati.

### Flusso di upload riprendibile (Instagram Graph API)

La pubblicazione di un video utilizza il protocollo di upload resumable di Instagram, validato live:

1. `POST /<igUserId>/media?upload_type=resumable&media_type=REELS|STORIES&caption=<enc>`
   → `{ id: containerId }`
2. `POST https://rupload.facebook.com/ig-api-upload/<ver>/<containerId>` con
   gli header `Authorization: OAuth <pageToken>`, `offset: "0"`,
   `file_size: "<bytes>"`, `Content-Type: application/octet-stream`, body = byte del video
   → `{ success: true }`
3. Polling di `GET /<containerId>?fields=status_code` fino a `FINISHED`
   (`ERROR`/`EXPIRED` → fallimento)
4. `POST /<igUserId>/media_publish?creation_id=<containerId>` → `{ id: igMediaId }`

Il token è sempre il **Page token** (salvato criptato in `secrets.enc` sotto la chiave `fb.page.<pageId>`), che deve includere gli scope di Instagram. Non viene mai loggato.

## Tab di gestione e insight

Sia `web/src/screens/GestionePaginaScreen.tsx` (gestione pagina) che `web/src/screens/InsightsScreen.tsx` (insight) hanno ottenuto una tab di piattaforma **Facebook / Instagram** di primo livello. La tab Instagram viene mostrata **solo quando la pagina selezionata ha un account Instagram collegato** (`igUserId != null`).

Il pannello Instagram (`web/src/components/InstagramPanel.tsx`) ha tre sotto-tab:

- **Post & commenti** — media IG pubblicati (Reel/Post/Storie) con il conteggio dei like e dei commenti; espandendo un media si possono leggere i commenti e **rispondere / nascondere / eliminare** (le risposte sono nidificate).
- **Programmati** — job Instagram in attesa (le righe `scheduled_post` con `platform = 'instagram'` collegate agli elementi Facebook programmati).
- **Account** — informazioni del profilo (username, bio, conteggio follower/seguiti/media, immagine di profilo) e insight dell'account.

Nella schermata degli Insight, la tab Instagram espone i totali dell'account IG più gli insight dell'account per singola metrica.

## Il profilo account è in sola lettura

La Instagram Graph API espone il nodo IG User come **sola lettura**: `biography`, `name`, `username`, `website` e `profile_picture_url` possono essere **letti** ma **non c'è un endpoint di aggiornamento**. A differenza delle Pagine Facebook (modificabili via `pages_manage_metadata`), i campi del profilo Instagram possono essere modificati solo dall'app Instagram. La tab Account è quindi puramente informativa by design.

## Insight dell'account (degradazione controllata)

Gli insight dell'account vengono recuperati **per singola metrica**, poiché le metriche di Instagram sono incoerenti tra le diverse versioni:

- Ogni metrica viene provata prima con `metric_type=total_value`, per poi effettuare il fallback alla forma legacy a serie storica (time-series); se entrambe falliscono la metrica viene riportata come `null` con un errore, **senza** far fallire le altre metriche.
- Metriche di default: `reach`, `profile_views`, `follower_count`.
- Note (API v21): `reach` supporta sia `total_value` che time-series; per `profile_views` la time-series è deprecata (solo `total_value` è significativo); `follower_count` **non** è una metrica `total_value` (il fallback time-series è il percorso corretto) e viene omessa da Instagram per account con < 100 follower. `impressions` è deprecata.

Il periodo della UI viene mappato ai periodi degli insight dell'account Instagram: `month → days_28`, `week → week`, altrimenti `day`.

## Risoluzione e caching dell'id account Instagram

`igUserId` viene risolto tramite `GET /<pageId>?fields=instagram_business_account{id}` e salvato in cache sulla riga della pagina (`facebook_page.ig_user_id`). Viene popolato:

- **al momento della connessione** (best-effort) quando si salva una pagina, e
- **in modo lazy** su `GET /pages` per qualsiasi pagina in cui è ancora null (i fallimenti vengono ignorati così la lista delle pagine non si rompe mai).

L'helper condiviso `resolveIgContext(pageId)` restituisce il Page token + `igUserId` per le rotte IG, risolvendo e mettendo in cache l'id su richiesta, e restituisce un chiaro 503 quando la pagina non ha un account Instagram collegato.

## Endpoint REST aggiunti

Tutti gli endpoint rispecchiano le controparti Facebook e si trovano sotto la pagina:

| Method & path | Scopo |
| --- | --- |
| `GET /posts/:id/instagram` *(POST)* | Crea il job IG gemello di un Reel/Storia Facebook |
| `DELETE /posts/:id/instagram` | Rimuove il job IG gemello (se non ancora pubblicato) |
| `GET /pages/:id/ig/account` | Informazioni del profilo account Business IG |
| `GET /pages/:id/ig/insights?period=day` | Insight dell'account IG (degradazione per singola metrica) |
| `GET /pages/:id/ig/media?limit=25` | Media IG pubblicati |
| `GET /pages/:id/ig/media/:mediaId/comments` | Commenti (con risposte nidificate) di un media |
| `POST /pages/:id/ig/comments/:commentId/reply` | Rispondi a un commento |
| `POST /pages/:id/ig/comments/:commentId/hide` | Nascondi/mostra un commento (`hide=true|false`) |
| `DELETE /pages/:id/ig/comments/:commentId` | Elimina un commento |

`GET /pages` espone `igUserId` per pagina (utilizzato dalla UI per decidere se mostrare la tab Instagram).

## Setup dell'app Meta

Per utilizzare queste funzionalità l'app Meta richiede il prodotto **"Instagram API with Facebook Login"** e i permessi `instagram_basic` + `instagram_content_publish`. Ogni account Instagram Business deve essere assegnato all'utente di sistema, e il Page token deve essere rigenerato con gli scope di Instagram. La mappatura 1-a-1 è **una Pagina Facebook ↔ un account Instagram Business**.
