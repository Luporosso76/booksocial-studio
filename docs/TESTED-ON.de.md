# Getestet auf unserer Hardware

## Übersicht

Dies ist die Referenzmaschine und Konfiguration, die die Maintainer verwendet haben, um BookSocial Studio zu entwickeln und zu testen. Deine Ergebnisse können variieren, insbesondere bei der lokalen Bildgenerierung.

## Maschinenspezifikationen

| Komponente | Getestete Konfiguration |
| --- | --- |
| Betriebssystem | Ubuntu 26.04 LTS |
| Kernel | Linux 7.0 |
| CPU | AMD Ryzen 7 6800H, 8 Kerne / 16 Threads |
| RAM | 26 GiB |
| GPU | Integrierte AMD Radeon 680M, RDNA2 "Rembrandt" iGPU |
| GPU-Treiber/API | Vulkan via RADV |
| Dedizierte GPU | Keine |
| Laufzeitumgebung | Node.js, Dienst läuft auf v24, Builds auf v22 |
| Datenbank | SQLite, einzelne Datei |

Installationsschritte sind separat in [SETUP.md](./SETUP.md) dokumentiert.

## Lokale Bildgenerierung

### Zusammenfassung der Einrichtung

Buchszenenbilder wurden geräteintern mit `sd-cli` aus `stable-diffusion.cpp` generiert, wobei Z-Image-Turbo auf der integrierten AMD Radeon 680M iGPU über Vulkan ausgeführt wurde.

Die getestete Aufteilung war:

| Komponente | Gerät |
| --- | --- |
| Text-Encoder | CPU |
| VAE | CPU |
| Diffusion | Integrierte GPU über `vulkan0` |

Die Standard-Backend-Einstellung war:

```bash
SDCPP_BACKEND="te=cpu,vae=cpu,diffusion=vulkan0"
```

Die Generierung läuft seriell ab: ein Bild nach dem anderen auf einer einzelnen iGPU.

Die getestete Sampling-Konfiguration war:

| Einstellung | Wert |
| --- | --- |
| Schritte | 8 |
| CFG-Skala | 1.0 |
| Sampler | Euler |
| Flash Attention | Aktiviert |
| Auf CPU auslagern | Aktiviert, um in den iGPU-Speicher zu passen |

### Modelldateien

| Zweck | Datei |
| --- | --- |
| Diffusionsmodell | `z_image_turbo-Q8_0.gguf` |
| Text-Encoder-LLM | `qwen_3_4b-Q8_0.gguf` |
| VAE | `ae_bf16.safetensors` |

### Umgebungsvariablen

| Variable | Zweck |
| --- | --- |
| `SDCPP_DIR` | Zeigt auf ein benutzerdefiniertes `stable-diffusion.cpp`-Verzeichnis |
| `SDCPP_CLI` | Zeigt auf eine benutzerdefinierte `sd-cli`-Binärdatei |
| `SDCPP_BACKEND` | Ändert die Backend-Aufteilung |
| `SDCPP_ZIMAGE_DIR` | Zeigt auf das Z-Image-Modellverzeichnis |
| `SDCPP_ZIMAGE_MODEL` | Zeigt auf die Diffusionsmodelldatei |
| `SDCPP_ZIMAGE_LLM` | Zeigt auf die Text-Encoder-LLM-Datei |
| `SDCPP_ZIMAGE_VAE` | Zeigt auf die VAE-Datei |
| `SDCPP_TIMEOUT_MS` | Timeout für die Bildgenerierung; Standardwert sind 15 Minuten |
| `IMAGEGEN_ENABLED` | Auf `false` setzen, um den reinen Upload-Modus zu erzwingen |

### Leistung

Auf dieser integrierten GPU dauert die Generierung eines 1024x1024-Bildes etwa 11 Minuten.

Dies ist langsam, da die Maschine über keine dedizierte GPU verfügt. Eine dedizierte GPU wäre weitaus schneller und Cloud-Bildanbieter sind im Vergleich dazu nahezu sofort einsatzbereit.

### Wie man das Modell oder die Engine austauscht

Die Implementierung der lokalen Bild-Engine befindet sich in:

```text
server/src/media/imageEngine.ts
```

Suche nach:

```text
LocalSdCliImageEngine
```

Die allgemeine Anleitung für Anbieter findest du in [PROVIDERS.md](./PROVIDERS.md).

## KI-Textanbieter

Während der Tests verwendeten die Maintainer `opencode`, die Abonnement-CLI, als KI-Textanbieter.

Die Post-Generation-Logik ist direkt in die Prompts eingebettet: BookSocial Studio bittet den Anbieter, die stärkste, eigenständige Idee in einem Kapitel zu finden und sie dann zu vermenschlichen. Da diese Logik inline ist, funktioniert sie mit jedem Anbieter, ohne dass zusätzliche Skills installiert werden müssen.

## Was wir End-to-End getestet haben

Die folgenden Abläufe wurden auf der Referenzmaschine End-to-End getestet:

| Bereich | Getesteter Ablauf |
| --- | --- |
| Buch-Import | Das mitgelieferte Beispielbuch und die eigenen Bücher der Maintainer wurden importiert |
| Visuelle Bibel | Die vollständige Analyse der visuellen Bibel wurde ausgeführt: Aussehen der Charaktere, Szenenkarten für Kapitel, Outfits, Requisiten, Nebenfiguren und Präsenz der Charaktere |
| Lokale Bilder | Stapel von Graphic-Novel-Szenenbildern wurden lokal generiert |
| Soziale Konten | Zwei Facebook-Seiten und deren verknüpfte Instagram-Business-Konten wurden verbunden |
| Veröffentlichung | Reels und Stories wurden geplant und live auf Facebook und Instagram veröffentlicht |

## Erkenntnisse für deine eigene Hardware

Verwende eine dedizierte GPU oder einen Cloud-Bildanbieter, wenn du eine schnelle Bildgenerierung möchtest.

BookSocial Studio läuft auch im reinen Upload-Modus einwandfrei ohne lokale GPU. Setze:

```bash
IMAGEGEN_ENABLED=false
```

Alles außer der lokalen Bildgenerierung ist ressourcenschonend. Die wichtigste hardwareabhängige Arbeitslast ist die lokale Bildgenerierung auf dem Gerät.
