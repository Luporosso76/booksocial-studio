# Changelog

Alle wesentlichen Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
und dieses Projekt hält sich an [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Behoben

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
