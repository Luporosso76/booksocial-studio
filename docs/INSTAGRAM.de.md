# Instagram-Integration

Dieses Dokument beschreibt die auf der Facebook-Integration aufbauende Instagram-Unterstützung: Veröffentlichung von Reels/Stories und die Facebook/Instagram-Tabs mit kontoübergreifender Verwaltung und Insights. Die unten stehenden Dateipfade beziehen sich auf die Anwendungsstruktur (`server/src/...`, `web/src/...`).

## Überblick

Instagram wird als **sekundäres Veröffentlichungsziel modelliert, das mit einer Facebook Page verknüpft ist**. Jede verbundene Facebook Page kann ein verknüpftes Instagram Business-Konto haben (`instagram_business_account`); wenn vorhanden, wird dessen ID auf der Seite gecacht und schaltet die Instagram-Funktionen frei.

Zwei Funktionen wurden hinzugefügt:

1. **Veröffentlichen** von Reels und Stories (9:16-Video) auf Instagram.
2. **Verwaltung & Insights**: ein Facebook/Instagram-Tab sowohl auf den Bildschirmen *Page management* als auch *Insights*, der IG-Medien, Kommentare und Kontometriken anzeigt.

## Veröffentlichungsmodell

Instagram hat **keine native Scheduling-API**. Um die Parität mit der nativen Planung von Facebook zu wahren, ist jedes Instagram-Element ein **separater lokaler Job**: eine `scheduled_post`-Zeile mit `platform = 'instagram'`, die mit ihrem Facebook-Zwilling (`linked_post_id`) verknüpft ist und dieselbe geplante Zeit teilt. Der interne `publishScheduler` veröffentlicht es zur fälligen Zeit (der Server muss laufen).

- Nur **Reels und Stories mit einem gerenderten 9:16-Video** sind berechtigt.
- Die Bildunterschrift spiegelt die visuelle Bildunterschrift des Facebook-Elements wider (Stories ignorieren sie).
- Die Job-Erstellung ist **idempotent** (`idempotency_key = ig:<fbPostId>`), sodass das zweimalige Umschalten von "Publish also on Instagram" keine Duplikate erzeugt.

### Fortsetzbarer Upload-Ablauf (Instagram Graph API)

Das Veröffentlichen eines Videos nutzt das fortsetzbare Upload-Protokoll von Instagram, das live validiert wird:

1. `POST /<igUserId>/media?upload_type=resumable&media_type=REELS|STORIES&caption=<enc>`
   → `{ id: containerId }`
2. `POST https://rupload.facebook.com/ig-api-upload/<ver>/<containerId>` mit
   Headern `Authorization: OAuth <pageToken>`, `offset: "0"`,
   `file_size: "<bytes>"`, `Content-Type: application/octet-stream`, Body = Video-
   Bytes → `{ success: true }`
3. Polling von `GET /<containerId>?fields=status_code` bis `FINISHED`
   (`ERROR`/`EXPIRED` → Fehler)
4. `POST /<igUserId>/media_publish?creation_id=<containerId>` → `{ id: igMediaId }`

Das Token ist immer das **Page-Token** (verschlüsselt in `secrets.enc` unter dem Schlüssel `fb.page.<pageId>` gespeichert), das die Instagram-Scopes enthalten muss. Es wird niemals protokolliert.

## Tabs für Verwaltung & Insights

Sowohl `web/src/screens/GestionePaginaScreen.tsx` (Seitenverwaltung) als auch `web/src/screens/InsightsScreen.tsx` (Insights) erhielten einen übergeordneten **Facebook / Instagram**-Plattform-Tab. Der Instagram-Tab wird **nur angezeigt, wenn die ausgewählte Seite ein verknüpftes Instagram-Konto hat** (`igUserId != null`).

Das Instagram-Panel (`web/src/components/InstagramPanel.tsx`) hat drei Unter-Tabs:

- **Posts & comments** — veröffentlichte IG-Medien (Reels/Posts/Stories) mit Like- und Kommentaranzahl; erweitern Sie ein Medium, um dessen Kommentare zu lesen und **darauf zu antworten / sie auszublenden / zu löschen** (Antworten sind verschachtelt).
- **Scheduled** — ausstehende Instagram-Jobs (die `scheduled_post`-Zeilen mit `platform = 'instagram'`, die mit geplanten Facebook-Elementen verknüpft sind).
- **Account** — Profilinformationen (Benutzername, Bio, Follower/Abonnements/Medienanzahl, Profilbild) und Konto-Insights.

Auf dem Insights-Bildschirm zeigt der Instagram-Tab die IG-Konto-Gesamtwerte sowie die Konto-Insights pro Metrik an.

## Kontoprofil ist schreibgeschützt

Die Instagram Graph API stellt den IG-Benutzer-Knoten als **schreibgeschützt** zur Verfügung: `biography`, `name`, `username`, `website` und `profile_picture_url` können **gelesen** werden, aber es gibt **keinen Update-Endpunkt**. Im Gegensatz zu Facebook Pages (bearbeitbar über `pages_manage_metadata`) können Instagram-Profilfelder nur über die Instagram-App geändert werden. Der Account-Tab dient daher designbedingt nur zur Information.

## Konto-Insights (sanfte Degradation)

Konto-Insights werden **pro Metrik** abgerufen, da die Metriken von Instagram über verschiedene Versionen hinweg inkonsistent sind:

- Jede Metrik wird zunächst mit `metric_type=total_value` versucht und fällt dann auf das alte Zeitreihenformat zurück; wenn beides fehlschlägt, wird die Metrik als `null` mit einem Fehler gemeldet, **ohne** dass die anderen Metriken fehlschlagen.
- Standardmetriken: `reach`, `profile_views`, `follower_count`.
- Hinweise (API v21): `reach` unterstützt sowohl `total_value` als auch Zeitreihen; Zeitreihen für `profile_views` sind veraltet (nur `total_value` ist sinnvoll); `follower_count` ist **keine** `total_value`-Metrik (der Zeitreihen-Fallback ist der richtige Weg) und wird von Instagram für Konten mit < 100 Followern weggelassen. `impressions` ist veraltet.

Der Zeitraum der Benutzeroberfläche entspricht den Konto-Insight-Zeiträumen von Instagram: `month → days_28`, `week → week`, andernfalls `day`.

## Auflösen und Cachen der Instagram-Konto-ID

`igUserId` wird über `GET /<pageId>?fields=instagram_business_account{id}` aufgelöst und in der Seitenzeile gecacht (`facebook_page.ig_user_id`). Sie wird befüllt:

- **beim Verbinden** (best-effort), wenn eine Seite gespeichert wird, und
- **verzögert** bei `GET /pages` für jede Seite, bei der sie noch null ist (Fehler werden ignoriert, sodass die Seitenliste nie unterbrochen wird).

Der gemeinsam genutzte Helfer `resolveIgContext(pageId)` gibt das Seiten-Token + `igUserId` für die IG-Routen zurück, löst die ID bei Bedarf auf und speichert sie zwischen und gibt einen eindeutigen 503-Status zurück, wenn die Seite kein verknüpftes Instagram-Konto hat.

## Hinzugefügte REST-Endpunkte

Alle Endpunkte spiegeln ihre Facebook-Pendants wider und befinden sich unterhalb der Seite:

| Methode & Pfad | Zweck |
| --- | --- |
| `GET /posts/:id/instagram` *(POST)* | Erstelle den IG-Zwillingsjob eines Facebook Reel/Story |
| `DELETE /posts/:id/instagram` | Entferne den IG-Zwillingsjob (falls noch nicht veröffentlicht) |
| `GET /pages/:id/ig/account` | Profilinformationen des IG Business-Kontos |
| `GET /pages/:id/ig/insights?period=day` | IG-Konto-Insights (degradation pro Metrik) |
| `GET /pages/:id/ig/media?limit=25` | Veröffentlichte IG-Medien |
| `GET /pages/:id/ig/media/:mediaId/comments` | Kommentare (mit verschachtelten Antworten) eines Mediums |
| `POST /pages/:id/ig/comments/:commentId/reply` | Auf einen Kommentar antworten |
| `POST /pages/:id/ig/comments/:commentId/hide` | Einen Kommentar ausblenden/einblenden (`hide=true|false`) |
| `DELETE /pages/:id/ig/comments/:commentId` | Einen Kommentar löschen |

`GET /pages` stellt `igUserId` pro Seite bereit (wird von der Benutzeroberfläche verwendet, um zu entscheiden, ob der Instagram-Tab angezeigt werden soll).

## Meta-App-Setup

Um diese Funktionen zu nutzen, benötigt die Meta-App das Produkt **"Instagram API with Facebook Login"** und die Berechtigungen `instagram_basic` + `instagram_content_publish`. Jedes Instagram Business-Konto muss dem Systembenutzer zugewiesen sein, und das Page-Token muss mit den Instagram-Scopes neu generiert werden. Die 1-zu-1-Zuordnung ist **eine Facebook Page ↔ ein Instagram Business-Konto**.
