# Changelog

Alle wesentlichen Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
und dieses Projekt hält sich an [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.5] - 2026-06-28

### Hinzugefügt
- **Strikter relativer Pfad beim Schreiben**: Wird ein Dateipfad in der Datenbank gespeichert, wird er nun strikt relativ zum Datenverzeichnis über `toDataRelativeStrict()` abgelegt und jeder Pfad außerhalb abgelehnt (ergänzt `resolveInsideDataDir` auf der Leseseite).
- **Audio-Inhaltsvalidierung**: hochgeladene Audiodateien werden nun per Magic Bytes geprüft (OGG, FLAC, WAV, MP3/ID3, MP4/M4A, AAC), analog zur Bildprüfung — eine Audio-Endung/-MIME mit nicht-Audio-Inhalt wird abgelehnt.
- **Erweiterte Backend-Tests**: Provider-Registry der Text-Engine (unterstützt vs. nicht), Auth/Session (Login, Sperre, Session-Invalidierung), DB-Migrationen (Erstanlage, Idempotenz, Schema-Version), plus die Fälle Path-Strict und Audio.

### Geändert
- **Provider-Konfiguration angeglichen**: `server/.env.example` listet keine nicht unterstützten Text-API-Anbieter (OpenAI/Anthropic/Google/OpenAI-compatible) mehr für die Text-Engine — nur CLI (opencode/Codex/Claude/agy) + Ollama — und nutzt `CONTENT_PROVIDER=none` als Standard. Die OpenAI/Google-Schlüssel sind nur noch bei den Bildanbietern dokumentiert.
- **Docker-Standard angeglichen**: `docker-compose.yml` nutzt nun `CONTENT_PROVIDER=none` als Standard (zuvor `opencode`), passend zu README und Runtime.
- **Produktionsdoku mit kompiliertem Runtime**: die manuellen Produktionsanweisungen (in allen 5 Sprachen) bauen und starten nun `node dist/index.js` (`npm run build` + `npm run start:prod`) statt `npm start` (tsx), wie das Docker-Image.

## [0.5.4] - 2026-06-28

### Hinzugefügt
- **Eigene Outfits für Rückblenden und Träume**: Figuren erhalten nun eigene kanonische Outfits für Erinnerungs-/Rückblenden- und Traumszenen, über alle Renderings hinweg konsistent.
- **Gezielte Outfits pro Figur**: Outfits werden nur für die Schauplätze der Kapitel erzeugt, in denen die Figur tatsächlich vorkommt, nicht für das ganze Buch.
- **Upload-Validierung**: Buch-, Bild- und Audio-Uploads werden auf Größe, Endung, MIME-Typ und (bei Bildern) Magic Bytes geprüft; die Grenzwerte sind über Umgebungsvariablen konfigurierbar.
- **Pfadsicherheit**: aus einem Datenbankpfad ausgelieferte Dateien werden strikt innerhalb des Datenverzeichnisses aufgelöst und blockieren absolute Pfade oder `../`-Traversal.
- **Härtung der Anmeldung**: Ratenbegrenzung mit temporärer Sperre nach wiederholten Fehlversuchen, konfigurierbare Sitzungsdauer und Invalidierung aller Sitzungen bei Passwortänderung.
- **Allgemeine API-Ratenbegrenzung** pro Client.
- **Konfigurationsprüfung beim Start**: klare Fehlermeldung, wenn das Datenverzeichnis nicht beschreibbar ist, Warnungen, wenn ffmpeg fehlt oder kein Textanbieter konfiguriert ist.
- **Kompiliertes Docker-Runtime**: der Container führt nun das kompilierte JavaScript (`node dist/index.js`) statt der TypeScript-Quellen aus.
- **Dokumentation**: unterstützte Betriebsmodi (lokal / LAN / öffentlich) sowie Hinweise zu geheimem Schlüssel und Backups.

### Geändert
- **Text-KI-Anbieter**: Unterstützt werden nur Abo-CLIs (opencode, Codex, Claude, agy) und lokales Ollama. Die nicht unterstützten Text-API-Anbieter (OpenAI/Anthropic/Google) wurden aus Konfiguration, Einstellungs-UI und Dokumentation entfernt; die Auswahl eines veralteten Anbieters schlägt nun mit einem klaren Fehler fehl, statt still nichts zu tun.
- **Sitzungs-Cookie**: das `Secure`-Attribut wird nur gesetzt, wenn die Verbindung tatsächlich HTTPS ist, damit die Anmeldung lokal/in der Entwicklung über HTTP funktioniert.
- **Verschlüsselungsschlüssel**: es wird eine Warnung protokolliert, wenn der Schlüssel im Datenverzeichnis gespeichert ist; es wird empfohlen, `BOOKSOCIAL_SECRET_KEY` außerhalb des Datenvolumens zu setzen.
- **Backend-Routen** in domänenspezifische Module umstrukturiert (keine Änderung an Endpunkten oder Verhalten).

### Behoben
- Anmeldesitzungen gehen über HTTP nicht mehr aufgrund des `Secure`-Cookie-Flags verloren.

## [0.5.3] - 2026-06-28

### Hinzugefügt
- **Bildstil pro Anbieter**: Wähle den visuellen Stil der generierten Bilder (Graphic Novel, malerisch, fotorealistisch, Aquarell, Concept Art und mehr) mit einstellbarer Stilisierungsstärke und Farbintensität, unabhängig für jeden Bildanbieter festlegbar — und getrennt für den primären Anbieter und seinen Fallback, sodass jeder in seinem eigenen Stil rendert.

### Geändert
- **Bild-Prompts behalten die vollständige Art-Direction**: Der Prompt-Generator überträgt die visuellen Regeln des Buches jetzt vollständig (Ausrüstung, Haltung, Technik), statt sie zusammenzufassen.
- **Physik pro Szene**: Die Realismusregeln eines Kapitels gelten jetzt nur noch für die tatsächlich in der Szene vorhandenen Objekte, sodass Regeln zu abwesenden Objekten nicht mehr ins Bild gelangen.
- Kleidungshinweise im Prompt für Konsistenz zusammengeführt.

### Behoben
- **Facebook-Token-Feld**: Der Browser füllt das gespeicherte Admin-Login-Passwort nicht mehr automatisch in das Facebook-Zugriffstoken-Feld auf der Verbindungsseite ein.

## [0.5.2] - 2026-06-28

### Geändert
- **Bildgenerierung — intelligentere Nutzung der visuellen Bibel**: Der Szenen-Prompt wird jetzt in ZWEI Schritten erstellt. Zuerst wählt das Modell, welchen einzelnen Moment des Kapitels es illustriert, und benennt das Motiv sowie nur die Figuren und Objekte, die in diesem Moment tatsächlich vorhanden sind. Dann wird der finale Bild-Prompt ausschließlich mit dem Kanon dieser Szene geschrieben. Zuvor wurde jede Figur, jedes Objekt und jede Vorgabe des gesamten Kapitels in einen einzigen Prompt gegossen, sodass unbeteiligte Personen und Objekte ins Bild gerieten, Figuren verdoppelt oder vermischt wurden und die wichtigen Details verwässerten. Der zweistufige Ablauf hält jede Szene fokussiert: die richtigen Personen, die richtige Ausrüstung, die richtige Pose — und unterschiedliche Bilder über ein Kapitel hinweg.
- **Sport- und Action-Posen** werden jetzt mit ihrer vollen dynamischen Haltung dargestellt, statt aufrecht erzwungen zu werden.

## [0.4.0] - 2026-06-26

### Hinzugefügt
- **Authentifizierung**: Ein integriertes Login schützt die App. Beim ersten Start lauten die Zugangsdaten `admin` / `12345678` und ein Passwortwechsel ist erforderlich; das Passwort wird gehasht gespeichert. Abmelden über die Seitenleiste. (Ersetzt die alte optionale HTTP Basic Auth.)
- **HTTPS**: Der Server kann über HTTPS ausliefern. Binde dein eigenes Zertifikat in Docker ein (`TLS_CERT_PATH`/`TLS_KEY_PATH`), oder es wird ein selbstsigniertes erzeugt; andernfalls fällt er auf HTTP zurück. Siehe README.
- **Mobiles Layout**: Die gesamte Oberfläche ist jetzt responsiv — einklappbare Seitenleiste mit Hamburger-Menü und an Telefone angepasste Bildschirme.
- **Traum-/Rückblenden-Bilder erzeugen**: Der Bildgenerator kann den Traum oder die Rückblende eines Kapitels ansteuern oder zufällig zwischen Gegenwart/Traum/Rückblende wählen, nicht nur die Gegenwartsszene.
- **Alter pro Figur in der Rückblende**: In einer Rückblende kannst du das genaue Alter jeder Figur für diese Szene festlegen, damit Figuren mit unterschiedlichem Alter korrekt dargestellt werden.

- **Alter & Ethnizität der Figuren**: jetzt eigene, editierbare Felder (nicht mehr in der physischen Beschreibung versteckt). Sie werden in jedem Bild-Prompt ausdrücklich genannt, damit Alter und Ethnizität über alle Illustrationen hinweg konsistent bleiben.
- **Markenzeichen-Kleidung**: ein Kleidungsstück oder Accessoire, das eine Figur immer trägt (z. B. ein bestimmter Hut), wird einmal festgelegt und in jeder Szene über der Szenenkleidung dargestellt.
- **Szenenmomente (Traum / Rückblende)**: jede Kapitelkarte erfasst die Art der Hauptszene (normal, Traum oder Rückblende) sowie sekundäre Träume/Rückblenden, alle in eigenen Tabs editierbar. Traumszenen werden traumhaft dargestellt; Rückblenden lassen die Figuren jünger erscheinen.
- **Bildnutzung**: jedes Bild zeigt, wie oft und worin es verwendet wurde (Reels, Storys, Posts), mit Filter verwendet / unbenutzt.
- **Musiknutzung**: Titel zeigen dasselbe Nutzungs-Badge (Reels / Storys) mit Filter.
- **Bild-Untertabs nach Format und Kapitel**: die Bildbibliothek lässt sich nach Format und innerhalb eines Formats nach Kapitel filtern, mit Zählern — und du kannst Bilder nur für dieses Kapitel erzeugen.
- **Automatische Bereinigung veröffentlichter Medien**: gerenderte Reel-/Story-/Post-Videos werden 24 Stunden nach der Veröffentlichung auf Facebook und Instagram gelöscht, um Speicher freizugeben. Gerenderte Dateien liegen nun im Unterordner `media/renders/`.

### Geändert
- **Flashback-Bildgenerierung**: Der Flashback-Schalter im Generierungspanel ist jetzt ein einfaches An/Aus — gerendert wird mit dem Alter pro Figur aus der Kapitelkarte; das manuelle Feld „Jahre jünger" wurde entfernt.

- **Stärkere Figurenkonsistenz in den Bild-Prompts**: Alter, Ethnizität, Statur und Haare werden immer genannt; bei zwei oder mehr Figuren im Bild bleiben sie unterscheidbar und werden nie vertauscht; Posen sind natürlich und aufrecht; eine angeforderte Figur erscheint immer.

### Behoben
- **Kapitel-Szenenextraktion**: Ein Kapitel mit sowohl einer realen Szene als auch einem Traum/einer Rückblende behält jetzt BEIDE (die Wachszene als Hauptszene plus Traum/Rückblende als eigenen Moment), statt das ganze Kapitel auf den Traum zu reduzieren; lange mehrteilige Kapitel verlieren keinen Traum/keine Rückblende mehr, der/die in einem eigenen Abschnitt steht.

- **Keine fehlplatzierten Motive mehr**: was nur in einem Traum, einer Erinnerung oder einer Redewendung vorkommt (und Homonyme wie das Surf-Manöver „Turtle Roll") landet nicht mehr in der realen Szene des Kapitels.

## [0.3.1] - 2026-06-24

### Hinzugefügt

- **Einzelne Warteschlangen-Einträge abbrechen**: Sie können jetzt einen einzelnen wartenden Stapel in der
  Bildgenerierungs-Warteschlange abbrechen, zusätzlich zu „Alles abbrechen".

### Geändert

- **Bildgenerierung serialisiert**: Generierungen verschiedener Bücher und Neugenerierungen werden nun in
  eine Warteschlange gestellt und nacheinander ausgeführt statt parallel; die Aktivitätsanzeige
  unterscheidet „Läuft" von „In Warteschlange".

### Behoben

- **Aktivitätsfenster im Vordergrund**: Das Aktivitätsmenü der Kopfzeile erscheint beim Scrollen nun über
  dem Bildraster.

## [0.3.0] - 2026-06-24

### Hinzugefügt

- **Marketing-Karten je Kapitel**: ein dauerhaftes narratives Verständnis jedes Kapitels (spoilerfreie
  Zusammenfassung, emotionaler Kern, Leserfrage, sichere Zitate und bewertete Post-Blickwinkel), das die
  Post-Generierung untermauert, einmal pro Kapitel erstellt und wiederverwendet.
- **Ideen-Ranker mit Blickwinkel-Rotation**: Posts greifen auf die vorgeprüften Blickwinkel des Kapitels
  zurück und rotieren durch sie, sodass ein wiederverwendetes Kapitel jedes Mal einen anderen Blickwinkel liefert.
- **Qualitätsrichter**: ein abschließender Durchlauf, der generische Posts (die zu jedem Buch passen
  würden) verwirft und sie einmal mit einem gezielten Hinweis neu generiert.
- **Editor für die Kapitel-Präsenz von Figuren**: lege manuell fest, in welchen Kapiteln eine Figur vorkommt.
- **Reproduzierbare Bilder**: der Generierungs-Seed wird bei jedem generierten Bild gespeichert.

### Geändert

- **Posts mit mehr Bezug zum Buch**: eine interne Checkliste zwingt jeden Post, ein konkretes Detail aus
  dem Kapitel zu verwenden, mit echten spoilerfreien Zitaten und stärker anti-generischer, anti-KI-Sprache.
- **Outfits und Szenenobjekte folgen der Bildsprache des Buches**: Kleidung für Praxis/Zeremonie/Epoche
  und die in den visuellen Vorgaben beschriebenen Schlüsselobjekte werden nun im Kanon und in den
  Szenenkarten der Kapitel berücksichtigt.
- **Planer-Kontingente sind die Gesamtmenge für den gewählten Zeitraum** (Woche/Monat/benutzerdefiniert),
  ohne verborgene Skalierung; der Planer stellt nun sicher, dass jeder angeforderte Inhalt platziert wird,
  auch bei wenigen Zeitfenstern.
- **Szenenbild-Panel neu gestaltet**: einklappbare Abschnitte für Kapitel/Figuren und kompakteres Layout.

- Der Qualitätsrichter bewertet Posts auch anhand der Marketing-Karte des Kapitels, nicht nur anhand des Auszugs, und vermeidet so ungerechte Ablehnungen.
- Zitate der Marketing-Karte werden gegen den echten Kapiteltext geprüft; erfundene oder paraphrasierte Zitate werden verworfen.

### Behoben

- Der erneute Import eines Buchs mit geändertem Text macht nun seine Kapitel-Marketing-Karten ungültig, damit Posts auf dem neuen Text basieren.
- Die Post-Generierung wird blockiert, wenn das Buchprofil nicht zum importierten Text passt, damit Posts nie auf einem veralteten Buchdatenblatt basieren.
- Das Bearbeiten der Hashtags eines Entwurfs wird jetzt korrekt gespeichert.
- Posts, Reels und Storys ohne Visual bleiben Entwürfe, anstatt bei der Veröffentlichung zu scheitern.

## [0.2.0] - 2026-06-23

### Hinzugefügt

- **Editierbare zusätzliche Prompt-Anweisungen** (Einstellungen): Freitext, der an die Text- und Bild-Prompts angehängt wird,
  sowohl global als auch pro Buch, zusätzlich zum entwickelten Kern (die Kernregeln werden nie überschrieben).
- **Dashboard**: ein wöchentlicher + monatlicher **Kalender** von geplanten Inhalten mit Farben pro Buch, kompakten
  KPIs pro Seite (Facebook + Instagram) und einer Hintergrundaktivitätskarte mit Fortschritt und Live-Timern.
- **CLI-first KI-Anbieter**: Text- und Bildgenerierung durch Abonnement-CLIs (opencode, Codex,
  Gemini) neben API-Keys, mit einem dedizierten Fallback-Anbieter/-Modell und einem KI-Einstellungsbereich mit vier Registerkarten.
- **Bildformat-Tabs** (vertikal 9:16 / quadratisch / horizontal) mit Anzahl in der Bildbibliothek eines Buches.
- **Schnelle NLP-Reindexierung**-Aktion: echte Zitate erneut extrahieren, ohne die vollständige Analyse erneut auszuführen.
- **Schlüsselmoment**-Feld auf Szenenkarten pro Kapitel, das zur Verankerung des Bildmotivs verwendet wird.
- UI und Dokumentation in **fünf Sprachen** (IT/EN/FR/ES/DE).

### Geändert

- **Weniger Wiederholungen**: Posts, reels und stories wählen jetzt die am längsten nicht verwendeten Zitate, Bilder, Musik
  und Kapitel über verschiedene Durchläufe hinweg aus, sodass aufeinanderfolgende wöchentliche Pläne und Regenerierungen das gesamte
  Material durchlaufen, anstatt es zu wiederholen.
- **KI-Prompts auf Englisch neu geschrieben**, während die generierte Ausgabe immer in der Sprache des Buches bleibt.
- **Präziserer visueller Kanon**: Das Aussehen der Charaktere und die Outfits basieren auf echten Buchpassagen,
  mit Verankerung von Ethnizität/Land/Ära und Kleidungs-Keywords, die aus dem tatsächlichen Vokabular des Buches stammen.
- Ein zusätzlicher **Anti-KI-Humanisierungs**-Durchgang für generierte Posts, angewendet in der Ausgabesprache.

### Behoben

- Das Löschen eines Entwurfs gibt dessen Zitate, Bilder, Musik und Kapitel sofort zur Wiederverwendung frei.
- Nativ geplante Facebook-Posts werden nach ihrer geplanten Zeit mit "veröffentlicht" abgeglichen (keine
  Einträge mehr, die als "in der Vergangenheit geplant" feststecken).
- Veröffentlichte Posts können aus dem Dashboard ausgeblendet werden, ohne sie zu löschen.

## [0.1.0] - 2026-06-20

Erste öffentliche, selbst-hostbare Version.

### Hinzugefügt

- Einzel-Container-**Docker**-Image (Backend + gebautes Frontend) und `docker compose`-Setup.
- **Buchanalyse & visuelle Bibel**: Importiere ein Markdown-Buch, extrahiere Profil und Charaktere und erstelle einen buchspezifischen Kanon (Aussehen, Outfits, Requisiten, Nebencharaktere, kapitelweise Szenenkarten).
- **Content-Generierung** für einen Wochenplan: Posts, Reels und Stories mit Zitaten, Hashtags und Links; die Logik zur Ideenfindung und Humanisierung ist in die Prompts eingebettet, sodass sie mit jedem Provider funktioniert.
- **Planung & Veröffentlichung** auf **Facebook** (native Planung für Posts; ein interner Scheduler für Reels/Stories) und **Instagram** (Reels/Stories an verknüpfte Instagram Business-Konten).
- **Facebook & Instagram Management**: Posts, Kommentare, Seiteneinstellungen und Account-Insights, mit einem Facebook/Instagram-Tab, der angezeigt wird, wenn eine Seite ein verknüpftes Instagram-Konto hat.
- **Erweiterbare KI-Provider**: API-Schlüssel (OpenAI, Anthropic, Google, jeder OpenAI-kompatible Endpunkt, lokales Ollama) oder Abonnement-CLIs (opencode, Codex, Gemini) mit einem Authenticate-Flow; erweiterbare Image-Engines (lokales `sd-cli`, OpenAI, Google, Stability, Black Forest Labs/FLUX, Replicate, fal.ai) mit einem reinen Upload-Fallback.
- **Einstellungen**-Bildschirm; Secrets werden im Ruhezustand verschlüsselt in `secrets.enc` (AES-256-GCM) aufbewahrt.
- **i18n (IT/EN)** für die Web-UI, mit Spracherkennung und -umschaltung.
- **Optionales Basic Auth** zum Schutz der App beim Self-Hosting.
- **Dokumentation**: Benutzerhandbuch, Setup, KI-Provider, Instagram, Architektur und Contributing.

[0.2.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.2.0
[0.1.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.1.0
