# Testato sul nostro hardware

## Panoramica

Questa è la macchina di riferimento e la configurazione che i maintainer hanno usato per sviluppare e testare BookSocial Studio. I risultati possono variare, soprattutto per la generazione locale di immagini.

## Specifiche della macchina

| Componente | Configurazione testata |
| --- | --- |
| OS | Ubuntu 26.04 LTS |
| Kernel | Linux 7.0 |
| CPU | AMD Ryzen 7 6800H, 8 core / 16 thread |
| RAM | 26 GiB |
| GPU | AMD Radeon 680M integrata, iGPU RDNA2 "Rembrandt" |
| Driver/API GPU | Vulkan tramite RADV |
| GPU discreta | Nessuna |
| Runtime | Node.js, il servizio gira su v24, le build su v22 |
| Database | SQLite, file singolo |

I passaggi di installazione sono documentati separatamente in [SETUP.md](./SETUP.md).

## Generazione locale di immagini

### Riepilogo della configurazione

Le immagini delle scene dei libri sono state generate sul dispositivo con `sd-cli` da `stable-diffusion.cpp`, eseguendo Z-Image-Turbo sulla iGPU AMD Radeon 680M integrata tramite Vulkan.

La suddivisione testata era:

| Componente | Dispositivo |
| --- | --- |
| Text encoder | CPU |
| VAE | CPU |
| Diffusion | GPU integrata tramite `vulkan0` |

L’impostazione predefinita del backend era:

```bash
SDCPP_BACKEND="te=cpu,vae=cpu,diffusion=vulkan0"
```

La generazione avviene in serie: un’immagine alla volta su una singola iGPU.

La configurazione di campionamento testata era:

| Impostazione | Valore |
| --- | --- |
| Steps | 8 |
| CFG scale | 1.0 |
| Sampler | Euler |
| Flash attention | Abilitata |
| Offload to CPU | Abilitato, per rientrare nella memoria della iGPU |

### File dei modelli

| Scopo | File |
| --- | --- |
| Modello di diffusion | `z_image_turbo-Q8_0.gguf` |
| LLM text-encoder | `qwen_3_4b-Q8_0.gguf` |
| VAE | `ae_bf16.safetensors` |

### Variabili d’ambiente

| Variabile | Scopo |
| --- | --- |
| `SDCPP_DIR` | Punta a una directory `stable-diffusion.cpp` personalizzata |
| `SDCPP_CLI` | Punta a un binario `sd-cli` personalizzato |
| `SDCPP_BACKEND` | Cambia la suddivisione del backend |
| `SDCPP_ZIMAGE_DIR` | Punta alla directory del modello Z-Image |
| `SDCPP_ZIMAGE_MODEL` | Punta al file del modello di diffusion |
| `SDCPP_ZIMAGE_LLM` | Punta al file LLM text-encoder |
| `SDCPP_ZIMAGE_VAE` | Punta al file VAE |
| `SDCPP_TIMEOUT_MS` | Timeout per la generazione delle immagini; il valore predefinito è 15 minuti |
| `IMAGEGEN_ENABLED` | Imposta su `false` per forzare la modalità solo upload |

### Prestazioni

Su questa GPU integrata, un’immagine 1024x1024 richiede circa 11 minuti per essere generata.

È lento perché la macchina non ha una GPU discreta. Una GPU dedicata sarebbe molto più veloce, e i provider cloud di immagini sono quasi istantanei in confronto.

### Come cambiare modello o engine

L’implementazione dell’engine locale per le immagini si trova in:

```text
server/src/media/imageEngine.ts
```

Cerca:

```text
LocalSdCliImageEngine
```

La guida generica per i provider si trova in [PROVIDERS.md](./PROVIDERS.md).

## Provider di testo AI

Durante i test, i maintainer hanno usato `opencode`, la CLI in abbonamento, come provider di testo AI.

La logica di post-generazione è incorporata direttamente nei prompt: BookSocial Studio chiede al provider di trovare la singola idea autonoma più forte in un capitolo, poi di umanizzarla. Poiché questa logica è inline, funziona con qualsiasi provider senza installare skill aggiuntive.

## Cosa abbiamo verificato end-to-end

I seguenti flussi sono stati verificati end-to-end sulla macchina di riferimento:

| Area | Flusso verificato |
| --- | --- |
| Importazione libro | Importato il libro di esempio incluso e i libri dei maintainer |
| Bibbia visiva | Eseguita l’analisi completa della bibbia visiva: aspetto dei personaggi, schede delle scene dei capitoli, outfit, oggetti di scena, personaggi minori e presenza dei personaggi |
| Immagini locali | Generati localmente batch di immagini di scene in stile graphic novel |
| Account social | Collegate due Pagine Facebook e i relativi account Instagram Business associati |
| Pubblicazione | Programmati e pubblicati Reels e Stories su Facebook e Instagram live |

## Indicazioni per il tuo hardware

Usa una GPU discreta o un provider cloud di immagini se vuoi una generazione rapida delle immagini.

BookSocial Studio funziona bene anche senza GPU locale in modalità solo upload. Imposta:

```bash
IMAGEGEN_ENABLED=false
```

Tutto tranne la generazione locale di immagini è leggero. Il carico principale sensibile all’hardware è la generazione locale di immagini sul dispositivo.
