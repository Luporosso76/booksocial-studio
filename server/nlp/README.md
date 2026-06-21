# Pre-pass NLP (spaCy) — OPZIONALE

Questo modulo aggiunge un "anello CODE FINDS" prima dell'AI: un'estrazione
classica (spaCy) di **personaggi** e **citazioni/dialoghi reali** dai capitoli
del libro, salvati nel DB (`book_quote`, colonne extra su `book_character`).

È **interamente opzionale e con fallback**: se Python/spaCy/il modello non sono
installati, il pre-pass viene saltato e l'applicazione funziona esattamente come
prima. Niente crash, niente errori propagati.

## Componenti

- `index_book.py` — script Python. Legge da **STDIN** un JSON di capitoli
  `[{ index, title, text }]` e scrive su **STDOUT** un JSON:
  ```json
  {
    "characters": [{ "name", "aliases":[], "mentions": 0, "chapters": [] }],
    "quotes":     [{ "chapterIndex": 0, "text", "kind": "quote"|"dialogue",
                     "speaker": null, "score": 0.0 }]
  }
  ```
  Regole di pulizia: personaggi solo da entità `PER` tenendo i token `POS=PROPN`;
  merge alias conservativo (un nome a 1 token confluisce in un multi-token solo se
  ne è primo o ultimo token; mai fondere due multi-token diversi); soglia ≥ 2
  menzioni. Citazioni: dialoghi (euristica `« »`, virgolette, trattini) + frasi
  notevoli via TextRank (`sumy`), lunghezza 40–200 caratteri.

- `setup.sh` — crea il venv `.venv/` e installa le dipendenze. **Da lanciare a
  mano una volta** (il modello è grande, ~500MB):
  ```bash
  bash server/nlp/setup.sh
  ```
  Usa `~/.pyenv/versions/3.11.14/bin/python3.11` se presente, altrimenti
  `python3.11`/`python3`.

- `server/src/content/nlpIndex.ts` — wrapper Node che spawna lo script (riusa il
  pattern di `engine.ts`). Config via env:
  - `NLP_ENABLED` (default `true`): se `false`/`0`, il pre-pass è disattivato.
  - `NLP_PYTHON` (default `server/nlp/.venv/bin/python`): binario Python da usare.
  - `NLP_TIMEOUT_MS` (default `120000`).

  Se il binario o lo script non esistono, o lo script fallisce, il wrapper
  ritorna `null` (nessun errore propagato).

## Verifica rapida (dopo setup)

```bash
echo '[{"index":0,"title":null,"text":"Marco salutò Anna. Marco era felice. «Andiamo via subito da qui, non c'\''è più tempo per restare ancora.»"}]' \
  | server/nlp/.venv/bin/python server/nlp/index_book.py
```
