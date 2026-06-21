#!/usr/bin/env bash
# Crea il virtualenv per il pre-pass NLP (spaCy + sumy) e scarica il modello italiano.
#
# NON e' eseguito automaticamente: il download del modello it_core_news_lg e' grande
# (~500MB). Lancialo a mano una sola volta:
#
#     bash server/nlp/setup.sh
#
# Tutto il pre-pass NLP e' OPZIONALE: se questo venv non esiste, l'app funziona
# comunque, semplicemente senza estrazione di personaggi/citazioni via spaCy.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HERE/.venv"

# Preferisci pyenv 3.11.14 se presente (spaCy/numpy hanno wheel stabili li').
PYENV_PY="$HOME/.pyenv/versions/3.11.14/bin/python3.11"
if [ -x "$PYENV_PY" ]; then
  PYBIN="$PYENV_PY"
elif command -v python3.11 >/dev/null 2>&1; then
  PYBIN="$(command -v python3.11)"
else
  PYBIN="$(command -v python3)"
fi

echo "[nlp/setup] Python: $PYBIN ($($PYBIN --version 2>&1))"
echo "[nlp/setup] venv:   $VENV"

"$PYBIN" -m venv "$VENV"
# shellcheck disable=SC1091
source "$VENV/bin/activate"

python -m pip install --upgrade pip
python -m pip install "spacy>=3.7,<3.9" "sumy>=0.11"
python -m spacy download it_core_news_lg
# Tokenizer NLTK richiesti da sumy/TextRank (estrazione frasi salienti = citazioni).
# Senza questi il pre-pass degrada e NON estrae citazioni (book_quote resta vuoto).
python -m nltk.downloader punkt punkt_tab

echo "[nlp/setup] Completato. Binario Python del venv:"
echo "  $VENV/bin/python"
echo "[nlp/setup] Verifica rapida:"
echo "  echo '[{\"index\":0,\"title\":null,\"text\":\"Marco salutò Anna. Marco era felice.\"}]' | $VENV/bin/python $HERE/index_book.py"
