# Renderer Reel (video) — Remotion reale + fallback robusto

Questo modulo produce i **reel** (`spec.kind = "reel_text"`) come MP4 9:16. Il kind
`reel_text` viene instradato dal dispatcher (`renderers/index.ts`) a
`renderers/remotion.ts`, che applica una strategia a DUE livelli.

## 1) Percorso primario: Remotion REALE (Chromium headless + ffmpeg)

`server/src/media/renderRemotion.ts` esegue un render Remotion vero:

1. `ensureBrowser()` scarica/verifica il Chromium headless di Remotion alla prima
   esecuzione;
2. `@remotion/bundler` builda la composizione `Reel` (vedi `Reel.tsx` / `Root.tsx`
   / `index.ts` in questa cartella) — animazioni React (fade-up + `spring`),
   tipografia serif per le citazioni, sfondo a gradiente per palette;
3. `selectComposition` + `renderMedia` (codec `h264`) producono l'MP4, usando il
   binario di `ffmpeg-static`.

Le scene ricevono lo spec validato via `inputProps`; i testi sono **citazioni REALI**
(`book_quote`), mai inventate. La durata totale è calcolata dalle scene
(`calculateMetadata`).

> Questi file `.tsx`/`index.ts` NON passano dal `tsc` del server: sono esclusi in
> `tsconfig.json` (`exclude: ["src/media/remotion/**"]`) e vengono compilati
> dall'esbuild interno di Remotion al momento del bundle.

## 2) Fallback: satori-frames + ffmpeg (niente Chromium)

Se Remotion/Chromium non è utilizzabile su questo ambiente (download non riuscito,
librerie di sistema mancanti, sandbox senza rete), `renderers/remotion.ts` passa
automaticamente a `server/src/media/renderVideo.ts`:

1. ogni scena → **PNG** con `satori` + `@resvg/resvg-js` (template `templates/reel.ts`);
2. `ffmpeg-static` monta i frame in MP4 (`concat`, `yuv420p`, `+faststart`).

Deterministico, locale, **nessun GPU/Chromium**. È la rete di sicurezza che
garantisce un reel anche dove Remotion non gira.

Per **forzare** il fallback senza tentare Remotion: `REEL_RENDERER=ffmpeg`.

Se anche il fallback fallisce (deps assenti), viene lanciato
`RendererUnavailableError`: la coda segna il job `failed` con messaggio chiaro
(«reel non disponibile su questo ambiente»). **Card e storyboard continuano a
funzionare in ogni caso.** MAI crash dell'app.

## Dipendenze

```bash
cd server && npm i @remotion/renderer @remotion/bundler remotion react react-dom ffmpeg-static
# + satori @resvg/resvg-js (gia' usati dalle card) e i font in server/assets/fonts/
```

## Musica (opzionale)

Se presenti file audio royalty-free in `server/assets/music/` (scelti per
`spec.music.mood`), si possono mixare con un secondo input `ffmpeg`
(`-i music.mp3 -shortest`). In assenza della cartella, il reel resta **senza
audio**: nessun errore.

## Nessuna pubblicazione automatica

L'MP4 prodotto viene registrato come `media_asset` e impostato come `media_path`
della **bozza**. Non viene mai pubblicato su Facebook.
