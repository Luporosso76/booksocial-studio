# BookSocial Studio User Manual

## Overview

BookSocial Studio verwandelt ein Buch in Spoiler-sichere Social-Media-Inhalte für Facebook-Seiten und verknüpfte Instagram-Business-Konten. Es hilft Ihnen, Manuskripte zu importieren und zu analysieren, Entwürfe und visuelle Inhalte zu generieren, Beiträge zu planen, Inhalte zu veröffentlichen, Kommentare zu verwalten und Einblicke zu überprüfen.

Die App ist Local-First. Ihre Daten verbleiben in einer lokalen SQLite-Datenbank und in lokalen Dateien. Geheimnisse wie Facebook-Token und KI-API-Schlüssel werden verschlüsselt in der `secrets.enc` im Datenordner gespeichert, nicht in der Datenbank.

Die Benutzeroberfläche ist zweisprachig, Italienisch und Englisch. Die Hauptnavigationspunkte sind: **Books**, **Planner**, **Scheduled**, **Insights**, **Connection**, **Page management** und **Settings**.

Für die Installation und Ersteinrichtung siehe [SETUP.md](./SETUP.md). Für Details zu KI-Anbietern siehe [PROVIDERS.md](./PROVIDERS.md). Für Instagram-spezifische Einrichtung und Verhalten siehe [INSTAGRAM.md](./INSTAGRAM.md). Für den getesteten lokalen Computer und Hinweise zur Bildgenerierung siehe [TESTED-ON.md](./TESTED-ON.md).

## Core Concepts

| Concept | Meaning |
| --- | --- |
| Books | Importierte Markdown-Manuskripte. Die App analysiert jedes Buch und erstellt ein Profil, Charaktere, Kapitel und eine visuelle Bibel. |
| Pages | Verbundene Facebook-Seiten. Eine Seite kann auch ein verknüpftes Instagram-Business-Konto haben. |
| Drafts | Generierte soziale Inhalte, die noch nicht geplant oder veröffentlicht wurden. |
| Scheduled posts | Inhalte, die für die zukünftige Veröffentlichung in die Warteschlange gestellt wurden. Einige Elemente werden nativ auf Facebook geplant, während andere vom internen Scheduler der App verarbeitet werden. |
| Text provider | Der KI-Anbieter, der zum Schreiben von Beiträgen, zur Buchanalyse, für Profile, Charaktere, Hashtags und andere Textaufgaben verwendet wird. |
| Image provider | Der Anbieter oder die lokale Engine, die verwendet wird, um Szenenbilder und visuelle Inhalte zu generieren. |
| Visual bible | Eine Reihe strukturierter visueller Referenzen für das Buch, einschließlich des Erscheinungsbilds der Charaktere, Szenenkarten, Outfits, Requisiten, Weltdetails, Nebenfiguren und der Anwesenheit von Charakteren nach Kapiteln. |

### Publishing Model

| Content type | How it is scheduled | What must be running at publish time |
| --- | --- | --- |
| Facebook native posts | Nativ auf Facebook geplant | Facebook veröffentlicht sie, auch wenn BookSocial Studio ausgeschaltet ist. |
| Facebook Reels and Stories | Interner Scheduler | Der BookSocial Studio-Server muss laufen. |
| Instagram items | Interner Scheduler | Der BookSocial Studio-Server muss laufen. |

Instagram hat in dieser App keine native Planung. Jedes auf Instagram geplante Element ist ein separater lokaler Job, der mit seinem Facebook-Zwilling verknüpft ist.

## Table of Contents

- [Books](#books)
- [Book Analysis and the Visual Bible](#book-analysis-and-the-visual-bible)
- [Book Detail](#book-detail)
- [Connection](#connection)
- [Page Management](#page-management)
- [Planner](#planner)
- [Scheduled](#scheduled)
- [Insights](#insights)
- [Settings: AI](#settings-ai)
- [Graph API Setup: Meta](#graph-api-setup-meta)
- [Common Workflows](#common-workflows)
- [Important Notes](#important-notes)

## Books

Der **Books**-Bildschirm ist Ihre Bibliothek. Er listet importierte Bücher als Karten auf und bietet Ihnen den Einstiegspunkt zum Importieren, Öffnen, Ausprobieren von Mustern oder Löschen von Büchern.

### What it does

Jede Buchkarte zeigt den Buchtitel, den Autor, ein Sprach-Badge und die Anzahl der Basis-Hashtags. Wenn die Bibliothek leer ist, bietet der Bildschirm zwei Startpunkte: ein Buch importieren oder das mitgelieferte Beispielbuch **The Keeper of the Tides** ausprobieren.

### What you can do

| Action | How it works |
| --- | --- |
| Import a book | Importieren Sie eine Markdown-Datei mit der Erweiterung `.md`. |
| Set optional metadata | Beim Import können Sie Autor und Sprache festlegen. |
| Open a book | Öffnen Sie die Buchkarte, um Profil, Kapitel, Charaktere, Links, Bilder und Musik zu verwalten. |
| Try the sample book | Importieren Sie das mitgelieferte Beispielbuch **The Keeper of the Tides**. |
| Delete a book | Entfernen Sie ein Buch aus der Bibliothek. |

### Notes

- Nur Markdown-Dateien mit der Erweiterung `.md` können importiert werden.
- Das Buch erscheint sofort nach dem Import.
- Die KI-Analyse läuft nach dem Import im Hintergrund.
- Die Analyse erfordert einen konfigurierten Textanbieter. Wenn kein Textanbieter konfiguriert ist, schlägt die Analyse mit einem eindeutigen Fehler fehl.
- Der Fortschritt wird von der App abgefragt und eine Toast-Benachrichtigung bestätigt den Abschluss.

## Book Analysis and the Visual Bible

Nachdem ein Buch importiert wurde, analysiert BookSocial Studio es und erstellt eine Spoiler-sichere Struktur, die für die Generierung von Beiträgen und die Bildkonsistenz verwendet wird.

### What it does

Die Analyse extrahiert Kapitel, erstellt ein KI-generiertes Profil mit Synopsis, Genres und Tonalität und identifiziert Charaktere. Die visuelle Bibel ist eine fortsetzbare Best-Effort-Pipeline im Hintergrund. Wenn ein Schritt fehlschlägt, können die anderen Schritte weiterhin ausgeführt werden.

Die kanonischen Schritte der visuellen Bibel sind:

| Order | Step | Purpose |
| --- | --- | --- |
| 1 | Character appearance | Erstellt eine stabile physische Beschreibung pro Charakter für konsistente Bilder. |
| 2 | Chapter scene cards | Erstellt pro Kapitel Ort, Umgebung, Haupt- und Nebenobjekte, anwesende Charaktere und Physik- oder Realismusregeln. Diese steuern die Bild-Prompts. |
| 3 | Outfits | Erstellt kanonische Kleidung pro Charakter mit Varianten für wiederkehrende Umgebungen. |
| 4 | Props & world | Extrahiert wiederkehrende Fahrzeuge und Objekte sowie die aus dem Buch abgeleitete Fahrseite (links oder rechts). |
| 5 | Minor characters | Scannt pro Kapitel nach beiläufigen Figuren und weist ihnen ein festes Erscheinungsbild zu. Dieser Schritt ist langsam. |
| 6 | Character presence | Erfasst, in welchen Kapiteln jeder Charakter vorkommt. Dies wird verwendet, um die Bildgenerierung nach Charakteren zu filtern. |

### What you can do

| Action | Where | Result |
| --- | --- | --- |
| Follow import progress | Import-Modal | Zeigt die drei Import-Schritte: Lesen, Analysieren, Speichern. |
| Review visual bible status | Visuelles Bibel-Panel auf dem Buch-Bildschirm | Zeigt jeden Schritt als ausstehend, laufend, abgeschlossen oder fehlgeschlagen an, mit einem Erledigt/Gesamt-Zähler. |
| Build the whole visual bible | Visuelles Bibel-Panel | Führt alle Schritte der visuellen Bibel aus. |
| Run one step | Visuelles Bibel-Panel | Führt nur den ausgewählten Schritt der visuellen Bibel aus. |

### Notes

- Die visuelle Bibel wird im Hintergrund erstellt.
- Der Prozess ist fortsetzbar und als Best-Effort konzipiert.
- Ein Fehler in einem Schritt der visuellen Bibel blockiert nicht die anderen.
- Der Schritt zur Charakteranwesenheit wird später verwendet, wenn Charaktere für die Bildgenerierung ausgewählt werden.

## Book Detail

Auf dem Buchdetail-Bildschirm verwalten Sie die operativen Daten für ein Buch. Er hat sechs Reiter: **Profile**, **Chapters**, **Characters**, **Links**, **Images** und **Music**.

### What it does

In diesem Bildschirm können Sie die Buchdaten bearbeiten, die die Inhaltserstellung steuern: Titel, Autor, Hashtags, visuelle Anweisungen, verknüpfte Seiten, Kapitel, Charaktere, Buch-Links, generierte Bilder und musikbezogene Buchdaten.

### What you can do

| Tab | Actions |
| --- | --- |
| Profile | Titel und Autor umbenennen; Basis-Hashtags bearbeiten; visuelle Richtlinien konfigurieren; Requisiten und Welt bearbeiten; Nebenfiguren überprüfen; das Buch mit verbundenen Seiten verknüpfen. |
| Chapters | Kapitel ein- oder ausschließen; Szenenkarten bearbeiten; Szenenkarten neu generieren; Änderungen an Szenenkarten speichern. |
| Characters | Charaktere hinzufügen, bearbeiten und löschen; Erscheinungsbilder generieren; Outfits generieren; die Kapitelpräsenz bearbeiten. |
| Links | Buch-Links hinzufügen, bearbeiten und löschen. |
| Images | Szenenbilder generieren; Bilder in einer Lightbox betrachten; Bilder neu generieren; Bilder manuell hochladen; ausgewählte Bilder im Stapel neu generieren. |
| Music | Greifen Sie auf den Musik-Reiter des Buches zu. |

### Profile Tab

Der **Profile**-Reiter steuert die buchweiten Einstellungen, die für generierte Inhalte gelten.

| Field or area | What it means | Editable |
| --- | --- | --- |
| Title | Buchtitel. | Ja |
| Author | Buchautor. | Ja |
| AI-generated profile | Synopsis, Genres und Tonalität. | Nein |
| Anti-spoiler badge | Zeigt an, dass das Anti-Spoiler-Verhalten aktiv ist. | Nein |
| Base hashtags | Hashtags, die auf jeden Beitrag für das Buch angewendet werden. | Ja |
| Visual domains | Vordefinierte Umschalter für visuelle Richtlinien pro Buch. | Ja |
| Free-text art directions | Zusätzliche visuelle Anweisungen, die für Bild-Prompts automatisch ins Englische übersetzt werden. | Ja |
| Props & world | Land, Fahrseite und Liste wiederkehrender Objekte. | Ja |
| Minor characters | Liste beiläufiger Figuren aus der visuellen Bibel. | Ja |
| Associated pages | Verbundene Seiten, die mit diesem Buch verknüpft sind. | Ja |

Die Generierung zielt immer auf eine verknüpfte Seite ab. Verknüpfen Sie das Buch daher mit den Seiten, die Sie für die Content-Erstellung verwenden möchten.

### Chapters Tab

Der **Chapters**-Reiter steuert die Verfügbarkeit auf Kapitelebene und die Bild-Prompt-Daten.

| Action | Result |
| --- | --- |
| Include a chapter | Erlaubt die Verwendung des Kapitels in Bildstapeln. |
| Exclude a chapter | Überspringt das Kapitel in Bildstapeln. |
| Edit a scene card | Ändert Ort, Umgebung, Objekte, Charaktere oder Physikregeln. |
| Regenerate a scene card | Erstellt die Kapitel-Szenenkarte neu. |
| Save a scene card | Speichert Ihre Bearbeitungen. |

### Characters Tab

Der **Characters**-Reiter steuert Besetzungsinformationen und die visuelle Konsistenz.

| Field or action | Purpose |
| --- | --- |
| Name | Charaktername. |
| Role | Rolle im Buch. |
| Job | Beruf des Charakters. |
| Character | Charakterbeschreibung. |
| Physical appearance | Stabiles Erscheinungsbild für Bildkonsistenz. |
| Notes | Zusätzliche Charakternotizen. |
| Outfits per context | Kleidungsdefinitionen für wiederkehrende Umgebungen. |
| Generate appearances | Erstellt oder aktualisiert Beschreibungen des Erscheinungsbilds von Charakteren. |
| Generate outfits | Erstellt oder aktualisiert Outfit-Definitionen. |
| Presence | Bearbeitbare Liste der Kapitel, in denen der Charakter vorkommt; pro Kapitel umschaltbar. Bestimmt, welche Charaktere bei der Bildgenerierung auswählbar sind. |

### Links Tab

Der **Links**-Reiter speichert Buch-Links, die nach Kanal und Richtlinie verwendet werden können.

| Field | Meaning |
| --- | --- |
| Channel type | Der Kanal, für den der Link vorgesehen ist. |
| Usage policy | Wie der Link verwendet werden soll. |
| URL | Das Link-Ziel. |
| Label | Für Menschen lesbare Link-Beschriftung. |
| Default flag | Markiert einen Link als Standard. |

### Images Tab

Der **Images**-Reiter verwaltet generierte und hochgeladene Szenenbilder.

| Action | Details |
| --- | --- |
| Generate scene images | Wählen Sie Anzahl pro Kapitel, Seitenverhältnis, Kapitel, optionale Charaktere und optionale Flashback-Einstellungen. |
| Leave chapters empty | Verwendet eine automatische, Spoiler-sichere Verteilung. |
| Feature characters | Wählen Sie optional Charaktere aus, die einbezogen werden sollen. |
| Use flashback | Fordern Sie optional ein jüngeres Alter und historische Outfits für diesen Stapel an. |
| Track generation | Beobachten Sie den Live-Zähler und den Timer pro Bild. |
| Queue more batches | Fügen Sie zusätzliche Generierungsstapel hinzu. |
| Cancel generation | Stoppen Sie einen laufenden oder in der Warteschlange befindlichen Stapel. |
| Open lightbox | Betrachten Sie das Bild in Originalgröße und die Metadaten. |
| Regenerate | Generieren Sie das ausgewählte Bild neu. |
| Regenerate with changes | Fügen Sie zusätzliche Anweisungen oder Flashback-Einstellungen hinzu. |
| Regenerate from chapter | Wählen Sie Charaktere aus der Besetzung des Kapitels aus. |
| Batch regenerate | Generieren Sie ausgewählte Bilder im Stapel neu. |
| Upload manually | Fügen Sie Ihr eigenes Bild zur Bibliothek hinzu. |

Die Bild-Lightbox zeigt Metadaten an: Quellkapitel, Charaktere, Prompt, Zeitstempel und Katalognotiz.

### Notes

- Die Generierung von Szenenbildern erfolgt seriell: ein Bild nach dem anderen auf einer einzigen GPU.
- Die Veröffentlichung von Entwürfen kann von einem fertigen visuellen Inhalt abhängen. Entwürfe mit Visuals, die noch gerendert werden, können erst veröffentlicht werden, wenn sie bereit sind.
- Basis-Hashtags gelten für jeden Beitrag für das Buch.
- Visuelle Anweisungen werden für Bild-Prompts automatisch ins Englische übersetzt.

## Connection

Der **Connection**-Bildschirm verbindet BookSocial Studio mithilfe eines Meta System User Page Tokens mit Facebook-Seiten.

### What it does

Es speichert Seiten-Token verschlüsselt in `secrets.enc` und lässt Sie auswählen, welche Seiten die App verwalten soll. Token werden niemals in der Datenbank gespeichert.

### What you can do

| Action | Result |
| --- | --- |
| Paste a Page access token | Startet den Verbindungsablauf. |
| Connect | Die App listet die Seiten auf, die von diesem Token verwaltet werden. |
| Select Pages | Wählt aus, welche Seiten BookSocial Studio verwalten soll. |
| Save | Speichert die ausgewählten Seitenverbindungen. |
| Review connected Pages | Jede gespeicherte Seite zeigt ein **Connected**-Badge an. |
| Remove a Page | Entfernt eine gespeicherte Seite aus der App. |
| Disconnect all | Löscht Token aus dem verschlüsselten Speicher. |

### Notes

- Beim Speichern erkennt die App das mit jeder Seite verknüpfte Instagram-Business-Konto automatisch über `instagram_business_account`.
- Wenn das Instagram-Konto nicht sofort gefunden wird, wird es später verzögert aufgelöst.
- Der Instagram-Reiter in der Seitenverwaltung wird nur angezeigt, wenn eine Seite ein verknüpftes Instagram-Business-Konto hat.
- Für Details zur Instagram-Einrichtung siehe [INSTAGRAM.md](./INSTAGRAM.md).

## Page Management

Im Bildschirm **Page management** bedienen Sie verbundene Seiten nach der Einrichtung. Er hat Plattform-Reiter oben.

### What it does

Auf diesem Bildschirm können Sie veröffentlichte Facebook-Inhalte, Kommentare, nativ geplante Facebook-Inhalte, Seiteneinstellungen, Instagram-Medienkommentare, interne geplante Instagram-Jobs und Instagram-Kontoinformationen verwalten.

Der **Facebook**-Plattform-Reiter ist immer verfügbar. Der **Instagram**-Plattform-Reiter erscheint nur, wenn die ausgewählte Seite ein verknüpftes Instagram-Business-Konto hat.

### What you can do

| Platform | Area | Actions |
| --- | --- | --- |
| Facebook | Posts & comments | Überprüfen Sie veröffentlichte Beiträge, bearbeiten Sie Text, heften Sie an oder lösen Sie, zeigen Sie Kommentare an und verwalten Sie diese, löschen Sie Beiträge. |
| Facebook | Create post drawer | Veröffentlichen Sie jetzt oder planen Sie einen nativen Facebook-Beitrag mit Text, optionalem Link und optionalem Datum. |
| Facebook | Scheduled on Facebook | Zeigen Sie Inhalte an, die nativ auf Facebook geplant sind. |
| Facebook | Page settings | Bearbeiten Sie Info oder Beschreibung, Website, Kontakt und Titelbild und speichern Sie diese dann auf Facebook. |
| Instagram | Posts & comments | Überprüfen Sie veröffentlichte Reels, Beiträge und Stories mit Like- und Kommentar-Zahlen; verwalten Sie Kommentare. |
| Instagram | Scheduled | Überprüfen Sie ausstehende interne Instagram-Jobs, die mit geplanten Facebook-Reels oder -Stories verknüpft sind. |
| Instagram | Account | Profilinformationen anzeigen. |

### Facebook: Posts & Comments

Der **Posts & comments**-Unter-Reiter listet veröffentlichte Facebook-Beiträge mit Miniaturansicht, Datum, Auszug und Badges wie **pinned** oder **not published** auf.

| Action | Result |
| --- | --- |
| Edit text | Aktualisiert den Beitragstext. |
| Pin or unpin | Ändert, ob der Beitrag angeheftet ist. |
| View comments | Öffnet die Kommentarverwaltung für den Beitrag. |
| Reply | Fügt eine verschachtelte Kommentar-Antwort hinzu. |
| Hide or unhide | Ändert die Sichtbarkeit des Kommentars. |
| Like | Liket einen Kommentar. |
| Delete comment | Löscht einen Kommentar. |
| Delete post | Löscht den Beitrag. |

Die **Create post**-Schublade enthält eine Live-Vorschau im Facebook-Stil und erfordert eine ausdrückliche Bestätigung. Wenn das Datum leer ist, wird der Beitrag sofort veröffentlicht. Wenn ein Datum angegeben ist, wird er nativ auf Facebook geplant.

### Facebook: Scheduled on Facebook

Dieser Unter-Reiter zeigt Inhalte an, die nativ auf Facebook geplant wurden.

### Facebook: Page Settings

In diesem Unter-Reiter können Sie Seitenfelder bearbeiten und sie auf Facebook speichern.

| Field | Result |
| --- | --- |
| About or description | Aktualisiert das Textfeld der Seite. |
| Website | Aktualisiert die Website der Seite. |
| Contact | Aktualisiert die Kontaktinformationen der Seite. |
| Cover image | Aktualisiert das Titelbild der Seite. |

### Instagram: Posts & Comments

Der Instagram-Medien-Unter-Reiter zeigt veröffentlichte Reels, Beiträge und Stories mit Like- und Kommentar-Zahlen an.

| Action | Result |
| --- | --- |
| Expand a media item | Öffnet dessen Kommentare. |
| Reply | Fügt eine verschachtelte Kommentar-Antwort hinzu. |
| Hide comment | Verbirgt einen Kommentar. |
| Delete comment | Löscht einen Kommentar. |

### Instagram: Scheduled

Dieser Unter-Reiter zeigt ausstehende interne Instagram-Jobs an. Dies sind die Zwillings-Jobs von geplanten Facebook-Reels oder -Stories.

### Instagram: Account

Dieser Unter-Reiter zeigt Instagram-Profilinformationen an.

| Field | Editable in BookSocial Studio |
| --- | --- |
| Username | Nein |
| Bio | Nein |
| Followers count | Nein |
| Following count | Nein |
| Media count | Nein |
| Picture | Nein |

### Notes

- Facebook-geplante Inhalte, die unter **Scheduled on Facebook** angezeigt werden, sind hier schreibgeschützt und sollten auf Facebook verwaltet werden.
- Instagram-Profilfelder sind über die API schreibgeschützt. Ändern Sie sie in der Instagram-App.
- Das Instagram-Panel wird nur angezeigt, wenn die ausgewählte Seite ein verknüpftes Instagram-Business-Konto hat.

## Planner

Der **Planner**-Bildschirm erstellt eine typische Woche, einen Monat oder einen benutzerdefinierten Zeitraum mit sozialen Inhalten für eine ausgewählte Seite und ein Buch.

### What it does

Es verwendet Quoten, Zeitfenster, das ausgewählte Buch und die ausgewählte Seite, um asynchron Entwürfe zu generieren. Die App wählt Tage, Zeiten, Formate, vermeidet Duplikate und rendert Bilder im Hintergrund.

### What you can do

| Action | Details |
| --- | --- |
| Pick a Page | Wählen Sie die verbundene Seite aus, für die generiert werden soll. |
| Pick a Book | Wählen Sie das verknüpfte Buch aus, aus dem generiert werden soll. |
| Set quotas | Wählen Sie, wie viele Beiträge, Reels und Stories im gewählten Zeitraum erstellt werden sollen (Gesamtmenge, nicht pro Woche). |
| Set time windows | Fügen Sie eine Uhrzeit oder einen Zeitbereich pro Wochentag hinzu. |
| Remove time windows | Entfernen Sie Zeitfenster einzeln. |
| Choose a period | Wählen Sie Woche, Monat oder benutzerdefinierten Datumsbereich. |
| Generate | Starten Sie einen asynchronen Server-Job, der Entwürfe erstellt und Bilder rendert. |
| Watch progress | Verfolgen Sie den Live-Fortschritt als `N/M`. |
| Cancel | Stoppen Sie den Generierungs-Job. Erstellte Entwürfe bleiben erhalten. |

### Periods

| Period | Length |
| --- | --- |
| Week | 7 Tage; Standard. |
| Month | 28 Tage. |
| Custom range | Vom Benutzer ausgewählter Datumsbereich. |

### Time Windows

| Window type | Behavior |
| --- | --- |
| Single time | Veröffentlichung innerhalb von etwa 30 Minuten. |
| Time range | Die Engine wählt eine Zeit innerhalb des Bereichs aus. |
| No windows | Es gelten die Standardwerte. |

### Generated Drafts List

Jede generierte Entwurfskarte zeigt Typ, Winkel, Format, Status, geplante Zeit und eine Vorschau im Facebook-Stil an. Die Vorschau enthält eine Hashtag-Aufschlüsselung: Basis, spezifisch und final.

| Draft action | Result |
| --- | --- |
| Edit | Ändern Sie Text, Hashtags und Datum/Uhrzeit. |
| Regenerate | Erstellt neuen Text und neue Hashtags und rendert das Bild neu. Die App fragt ab, bis alles bereit ist. |
| Delete | Entfernt den Entwurf. |
| Publish now | Veröffentlicht sofort nach ausdrücklicher Bestätigung. |
| Schedule publishing | Wandelt alle für die Zukunft datierten Entwürfe nach Bestätigung in geplante Elemente um. |

### Notes

- Reels und Stories sind vertikale 9:16-Videos.
- Beiträge sind Text/Foto-Inhalte.
- Bei Entwürfen, deren visuelle Inhalte noch gerendert werden, wird ein Platzhalter angezeigt.
- **Publish now** ist deaktiviert, bis das visuelle Element eines Entwurfs bereit ist.
- Bei der Massenplanung werden Facebook-Beiträge nativ auf Facebook geplant und können veröffentlicht werden, auch wenn die App ausgeschaltet ist.
- Reels und Stories werden über den internen Scheduler geplant, daher muss der Server zur geplanten Zeit eingeschaltet sein.

## Scheduled

Der **Scheduled**-Bildschirm zeigt die interne Veröffentlichungswarteschlange.

### What it does

Er listet Reels und Stories auf, die der BookSocial Studio-Server zu den geplanten Zeiten automatisch veröffentlicht.

### What you can do

| Action | Availability | Result |
| --- | --- | --- |
| Publish now | Pro Element, mit Bestätigung | Veröffentlicht das Element in der Warteschlange sofort. |
| Remove | Pro Element, falls noch nicht veröffentlicht | Entfernt das Element aus der internen Warteschlange. |
| Publish also on Instagram | Nur Facebook-Reels und -Stories, 9:16-Video | Erstellt einen Instagram-Zwillings-Job mit derselben Zeit und dem verknüpften Facebook-Element. |
| Remove Instagram twin | Elemente mit einem Instagram-Zwillings-Job | Entfernt den verknüpften Instagram-Job. |

### Notes

- Ein auffälliges Banner warnt, dass der Server zur geplanten Zeit laufen muss.
- Wenn der Server nicht läuft, werden Reels, Stories und Instagram-Jobs nicht veröffentlicht.
- Native Facebook-Beiträge werden nicht von dieser Warteschlange verarbeitet und auf Facebook unabhängig veröffentlicht.
- Wenn ein Facebook-Element mit einem Instagram-Zwilling veröffentlicht wird, veröffentlicht der Server es auch auf Instagram mit derselben Bildunterschrift.

## Insights

Der **Insights**-Bildschirm hilft Ihnen, die Leistung von Seiten und Konten zu überprüfen.

### What it does

Sie wählen eine Seite und einen Zeitraum aus und überprüfen dann die Facebook-Insights und, falls verknüpft, die Instagram-Insights.

### What you can do

| Action | Details |
| --- | --- |
| Pick a Page | Verwenden Sie Seiten-Reiter. |
| Pick a period | Wählen Sie Tag, Woche oder Monat aus. |
| View Facebook insights | Verfügbar für verbundene Facebook-Seiten. |
| View Instagram insights | Verfügbar, wenn die Seite ein verknüpftes Instagram-Business-Konto hat. |
| Compare Pages | Verfügbar, wenn zwei oder mehr Seiten verbunden sind. |

### Facebook Insights

| Area | What it shows |
| --- | --- |
| KPI tiles | Follower, Likes/Fans, Reichweite, Engagement. |
| Follower trend chart | Gewinne in Grün, Verluste in Rot und Netto-Gesamtsumme. |
| Top posts | Top 10 nach Engagement, mit Aufrufen, Reichweite, Reaktionen, Kommentaren, Shares und einem Link zu Facebook. |
| History line chart | Reichweite und Follower im Zeitverlauf. |
| Coverage sparkline | Abdeckungstrend. |
| Demographics | Top-Länder, -Städte und Geschlecht/Alter. |
| Page comparison table | Vergleich zwischen Seiten, wenn zwei oder mehr Seiten verbunden sind. |

### Instagram Insights

| Area | What it shows |
| --- | --- |
| Account KPIs | Follower, Gefolgt und Medienanzahl. |
| Account insights for the period | Reichweite, Profilaufrufe und Follower-Anzahl. |

### Notes

- In der Seitenvergleichstabelle lädt jede Zelle unabhängig.
- Wenn das Laden einer Seite in der Vergleichstabelle fehlschlägt, zeigt die Zelle dieser Seite `—` an.
- Einige Instagram-Metriken sind je nach Konto oder API-Version möglicherweise nicht verfügbar. Die App schränkt die Funktionalität elegant ein.

## Settings: AI

Der **Settings**-Bildschirm konfiguriert den KI-Textanbieter, den Bildanbieter, den Bildmodus und die optionale Bild-QA.

### What it does

BookSocial Studio verwendet einen einsteckbaren Textanbieter für Analysen und zum Schreiben sowie einen einsteckbaren Bildanbieter für Szenenvisualisierungen. Hier konfigurieren Sie beides.

### What you can do

| Action | Result |
| --- | --- |
| Configure text provider | Aktiviert die Buchanalyse, das Schreiben von Beiträgen, die Hashtag-Generierung und zugehörige Textaufgaben. |
| Configure image provider | Aktiviert generierte Szenenbilder und generierte Entwurfsvisualisierungen. |
| Test text connection | Gibt Erfolg mit einem Beispiel oder einen eindeutigen Fehler zurück. |
| Test image connection | Gibt Erfolg mit einem Beispiel oder einen eindeutigen Fehler zurück. |
| Choose image mode | Wählen Sie Library oder Direct. |
| Enable image QA | Validiert generierte Bilder und generiert fehlgeschlagene Bilder mit Backoff neu. |

### Text Providers

Es gibt zwei Textanbieter-Familien.

| Family | Providers | Authentication and configuration |
| --- | --- | --- |
| Subscription via CLI | opencode, codex (ChatGPT), gemini (Google) | Es wird kein API-Schlüssel in der App gespeichert. Das Panel zeigt den CLI-Installationsstatus, einen **Authenticate**-Button, der das CLI-Login startet, und einen **Verify**-Button, der den Status erneut überprüft. Es gibt ein optionales Feld für den Modellnamen für die CLI. |
| API key | OpenAI und OpenAI-kompatible Endpunkte, Anthropic, Google, Ollama | Geben Sie den API-Schlüssel ein, legen Sie optional eine Basis-URL fest und wählen Sie das Modell aus einer Liste, die über **Load models** geladen wird, mit manuellem Fallback. Ollama ist lokal und verwendet keinen Schlüssel. |

Bei API-Schlüssel-Anbietern werden Schlüssel verschlüsselt in `secrets.enc` gespeichert. Ein einmal für einen Anbieter eingegebener Schlüssel wird wiederverwendet, beispielsweise für Bilder desselben Anbieters, und als bereits festgelegt angezeigt.

Wenn ein spezifischer Modellname erforderlich ist, geben Sie das gewählte Modell / den Modellnamen Ihres Anbieters ein.

### Image Providers

| Provider option | Meaning |
| --- | --- |
| local | Verwendet eine On-Device-Engine. Siehe [TESTED-ON.md](./TESTED-ON.md). |
| auto | Verwendet lokal, falls verfügbar, sonst nichts. |
| none | Deaktiviert generierte Bilder; verwenden Sie Nur-Upload. |
| OpenAI | Cloud-Bildanbieter; verwendet den gemeinsamen Textschlüssel wieder. |
| Google | Cloud-Bildanbieter; verwendet den gemeinsamen Textschlüssel wieder. |
| Stability | Cloud-Bildanbieter mit eigenem Schlüssel. |
| Black Forest Labs (FLUX) | Cloud-Bildanbieter mit eigenem Schlüssel. |
| Replicate | Cloud-Bildanbieter mit eigenem Schlüssel. |
| fal.ai | Cloud-Bildanbieter mit eigenem Schlüssel. |

Das Feld für das Bildmodell ist Freitext. Geben Sie das gewählte Modell / den Modellnamen Ihres Anbieters ein. Es ist kein Bildmodell voreingestellt.

### Image Mode

| Mode | Behavior |
| --- | --- |
| Library | Generierte Bilder wandern in eine wiederverwendbare Bibliothek, und Sie wählen Bilder pro Entwurf aus. |
| Direct | Das visuelle Element wird während der Wochengenerierung direkt auf Entwürfe gerendert. Dies erfordert eine funktionierende Bild-Engine. |

### Image QA

Wenn Bild-QA aktiviert ist, wird jedes generierte Bild validiert und bei Nichtbestehen der Prüfung neu generiert. Wiederholungsversuche verwenden Backoff.

### Notes

- Anthropic ist als API-Schlüssel-Anbieter verfügbar (kein Abonnement-Login).
- Die Abonnement-CLI-Authentifizierung lebt in der CLI selbst; in BookSocial Studio wird kein Abonnement-Token gespeichert.
- Für die anbieterspezifische Einrichtung siehe [PROVIDERS.md](./PROVIDERS.md).

## Graph API Setup: Meta

Das Meta-Setup ist erforderlich, bevor BookSocial Studio Facebook-Seiten oder verknüpfte Instagram-Business-Konten verwalten kann.

### What it does

Das Meta-Setup gibt der App Zugriff auf Seiten, Beiträge, Kommentare, Insights und Instagram-Veröffentlichung, sofern verfügbar.

### What you can do

| Area | Requirement |
| --- | --- |
| Facebook | Erstellen Sie eine Meta-App mit Facebook Login. |
| Facebook | Erstellen Sie ein System User Page-Token mit Berechtigungen zum Lesen und Verwalten der Seite, von Beiträgen, Kommentaren und Insights. |
| Facebook | Fügen Sie das Seiten-Token im **Connection**-Bildschirm ein. |
| Instagram | Fügen Sie das Produkt **Instagram API with Facebook Login** hinzu. |
| Instagram | Schließen Sie `instagram_basic` und `instagram_content_publish` ein. |
| Instagram | Verknüpfen Sie das Instagram-Business-Konto mit der Facebook-Seite. |
| Instagram | Weisen Sie das Instagram-Business-Konto dem Systemnutzer (System User) zu. |
| Instagram | Stellen Sie sicher, dass das Seiten-Token die Instagram-Scopes enthält. |

Zu den Facebook-Berechtigungen gehören Beispiele wie `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `pages_manage_engagement/comments` und `pages_read_user_content`.

### Notes

- Das Instagram-Mapping ist eine Facebook-Seite zu einem Instagram-Business-Konto.
- Detaillierte Instagram-Hinweise finden Sie in [INSTAGRAM.md](./INSTAGRAM.md).

## Common Workflows

### 1. Import and Analyze a Book

1. Öffnen Sie **Books**.
2. Wählen Sie **Import a book**.
3. Wählen Sie eine Markdown-Datei `.md` aus.
4. Legen Sie optional Autor und Sprache fest.
5. Bestätigen Sie den Import.
6. Warten Sie, während die App das Buch liest, analysiert und speichert.
7. Öffnen Sie das Buch, wenn die Abschluss-Toast-Benachrichtigung erscheint.
8. Überprüfen Sie Profil, Kapitel, Charaktere und den Status der visuellen Bibel.

### 2. Configure AI Before Importing

1. Öffnen Sie **Settings**.
2. Wählen Sie einen Textanbieter.
3. Authentifizieren Sie sich über einen CLI-Anbieter oder geben Sie einen API-Schlüssel ein, je nach Anbieterfamilie.
4. Wenn Sie einen API-Schlüssel-Anbieter verwenden, nutzen Sie **Load models** oder geben Sie das gewählte Modell / den Modellnamen Ihres Anbieters manuell ein.
5. Führen Sie die Text-Aktion **Test** aus.
6. Wählen Sie einen Bildanbieter, wenn Sie generierte Bilder möchten.
7. Geben Sie das gewählte Bildmodell / den Modellnamen Ihres Anbieters ein, falls erforderlich.
8. Führen Sie die Bild-Aktion **Test** aus.
9. Wählen Sie den Bildmodus **Library** oder **Direct**.

### 3. Connect a Facebook Page

1. Öffnen Sie **Connection**.
2. Fügen Sie ein Meta System User Page Access-Token ein.
3. Wählen Sie **Connect**.
4. Überprüfen Sie die von diesem Token verwalteten Seiten.
5. Wählen Sie die Seiten aus, die BookSocial Studio verwalten soll.
6. Wählen Sie **Save**.
7. Bestätigen Sie, dass gespeicherte Seiten das **Connected**-Badge anzeigen.
8. Wenn die Seite ein verknüpftes Instagram-Business-Konto hat, warten Sie auf die automatische Erkennung oder verzögerte Auflösung.

### 4. Associate a Book with a Page

1. Öffnen Sie **Books**.
2. Öffnen Sie das Buch.
3. Gehen Sie zum Reiter **Profile**.
4. Suchen Sie nach **Associated pages**.
5. Setzen Sie ein Häkchen bei den verbundenen Seiten, die für die Generierung zugelassen sein sollen.
6. Speichern Sie die relevanten Bucheinstellungen.

### 5. Build or Repair the Visual Bible

1. Öffnen Sie **Books**.
2. Öffnen Sie das Buch.
3. Erweitern Sie das **Visual bible**-Panel.
4. Überprüfen Sie den Status jedes Schritts und den Erledigt/Gesamt-Zähler.
5. Wählen Sie **Build visual bible**, um alle Schritte auszuführen.
6. Oder führen Sie einen einzelnen Schritt aus, wenn nur ein Bereich bearbeitet werden muss.
7. Überprüfen Sie fehlgeschlagene Schritte, ohne davon auszugehen, dass die gesamte Pipeline fehlgeschlagen ist, da die Schritte als Best-Effort und unabhängig voneinander konzipiert sind.

### 6. Generate Scene Images

1. Öffnen Sie das Buch.
2. Gehen Sie zum Reiter **Images**.
3. Wählen Sie die Anzahl pro Kapitel.
4. Wählen Sie das Seitenverhältnis.
5. Wählen Sie Kapitel aus oder lassen Sie die Kapitel für eine automatische, Spoiler-sichere Verteilung leer.
6. Wählen Sie optional Charaktere aus, die im Bild sein sollen.
7. Aktivieren Sie optional einen Flashback mit jüngerem Alter und historischen Outfits für den Stapel.
8. Starten Sie die Generierung.
9. Beobachten Sie den Live-Zähler und den Timer pro Bild.
10. Öffnen Sie generierte Bilder in der Lightbox, um die Ausgabe in Originalgröße sowie die Metadaten zu überprüfen.

### 7. Plan a Week of Content

1. Öffnen Sie **Planner**.
2. Wählen Sie eine Seite.
3. Wählen Sie ein Buch, das mit dieser Seite verknüpft ist.
4. Legen Sie die Quoten (Gesamtmenge für den gewählten Zeitraum) für Beiträge, Reels und Stories fest.
5. Fügen Sie Zeitfenster für Wochentage hinzu oder lassen Sie sie leer, um Standardwerte zu verwenden.
6. Wählen Sie **week** als Zeitraum.
7. Wählen Sie **Generate**.
8. Beobachten Sie den Live-Fortschritt `N/M`.
9. Überprüfen Sie jede generierte Entwurfskarte.
10. Bearbeiten, regenerieren, löschen oder veröffentlichen Sie Entwürfe nach Bedarf.

### 8. Schedule Future Drafts

1. Generieren Sie Entwürfe in **Planner**.
2. Überprüfen Sie Entwürfe und nehmen Sie Änderungen vor.
3. Stellen Sie sicher, dass visuelle Elemente für Entwürfe bereit sind, die solche benötigen.
4. Wählen Sie **Schedule publishing**.
5. Lesen Sie die Bestätigung, in der der Unterschied zwischen nativer Facebook-Planung und dem internen Scheduler erklärt wird.
6. Bestätigen Sie.
7. Denken Sie daran, dass Facebook-Beiträge nativ auf Facebook geplant werden, während Reels und Stories zur Veröffentlichungszeit den BookSocial Studio-Server benötigen.

### 9. Publish a Draft Immediately

1. Öffnen Sie **Planner**.
2. Suchen Sie die Entwurfskarte.
3. Bestätigen Sie, dass jedes erforderliche visuelle Element bereit ist.
4. Wählen Sie **Publish now**.
5. Bestätigen Sie ausdrücklich.

### 10. Add Instagram Publishing to a Scheduled Reel or Story

1. Öffnen Sie **Scheduled**.
2. Suchen Sie ein Facebook-Reel oder eine Story im 9:16-Videoformat.
3. Aktivieren Sie **Publish also on Instagram**.
4. Bestätigen Sie, dass ein Instagram-Zwillings-Job mit derselben Zeit erstellt wurde.
5. Lassen Sie den Server zur geplanten Zeit laufen.
6. Entfernen Sie den Zwilling, wenn das Instagram-Element nicht mehr veröffentlicht werden soll.

### 11. Manage Facebook Comments

1. Öffnen Sie **Page management**.
2. Wählen Sie die Seite aus.
3. Öffnen Sie den Reiter **Facebook**.
4. Öffnen Sie **Posts & comments**.
5. Wählen Sie einen Beitrag.
6. Sehen Sie sich die Kommentare an.
7. Antworten Sie auf Kommentare, blenden Sie sie ein oder aus, liken oder löschen Sie sie nach Bedarf.

### 12. Review Performance

1. Öffnen Sie **Insights**.
2. Wählen Sie eine Seite.
3. Wählen Sie Tag, Woche oder Monat aus.
4. Überprüfen Sie Facebook-KPI-Kacheln, Diagramme, Top-Beiträge, Demografie und den Verlauf.
5. Wenn Instagram verknüpft ist, öffnen Sie den Instagram-Reiter.
6. Überprüfen Sie Konto-KPIs und verfügbare Konto-Insights.
7. Wenn zwei oder mehr Seiten verbunden sind, überprüfen Sie die Seitenvergleichstabelle.

## Important Notes

### Security

- Facebook-Token und KI-API-Schlüssel werden verschlüsselt (AES-256-GCM) in `secrets.enc` gespeichert, niemals in der Datenbank.
- Die Abonnement-CLI-Authentifizierung lebt in der CLI selbst. In BookSocial Studio wird kein Abonnement-Token gespeichert.
- Verwenden Sie den **Connection**-Bildschirm, um Seiten zu trennen oder gespeicherte Seiten-Token zu löschen.

### Meta Limits

- Instagram-Profilfelder sind über die API schreibgeschützt. Ändern Sie sie in der Instagram-App.
- Instagram hat in dieser App keine native Planung, sodass die Instagram-Veröffentlichung interne Jobs verwendet.
- Einige Instagram-Metriken sind über API-Versionen hinweg inkonsistent und möglicherweise nicht verfügbar.
- Das Instagram-Mapping ist eine Facebook-Seite zu einem Instagram-Business-Konto.

### Performance

- Die Buchanalyse und die Wochengenerierung erfolgen asynchron und zeigen den Live-Fortschritt an.
- Die lokale Bildgenerierung ist der rechenintensive Teil.
- Die lokale Bildgenerierung erfolgt seriell, ein Bild nach dem anderen auf dem Gerät.
- Siehe [TESTED-ON.md](./TESTED-ON.md) für die getestete Maschine und Hinweise zur lokalen Bildgenerierung.

### Server Must Stay On

- Der interne Scheduler muss zur geplanten Zeit für Reels, Stories und Instagram-Elemente laufen.
- Wenn der Server zur geplanten Zeit ausgeschaltet ist, werden diese intern geplanten Elemente nicht veröffentlicht.
- Native Facebook-Beiträge werden unabhängig veröffentlicht, da sie auf Facebook geplant sind.