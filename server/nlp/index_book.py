#!/usr/bin/env python3
"""Pre-pass NLP "classico" per BookSocial Studio.

Input  (STDIN, JSON): [{ "index": int, "title": str|null, "text": str }, ...]
Output (STDOUT, JSON): {
  "characters": [{ "name", "aliases":[...], "mentions":int, "chapters":[int,...] }],
  "quotes":     [{ "chapterIndex":int, "text", "kind":"quote"|"dialogue",
                   "speaker":str|null, "score":float }]
}

Dipende da spaCy (modello it_core_news_lg) e, opzionalmente, da sumy per il
ranking delle frasi notevoli (TextRank). Entrambi sono installati nel venv da
setup.sh. Lo script e' pensato per girare con il Python del venv; il wrapper Node
(nlpIndex.ts) lo spawna e cattura SOLO lo stdout. Qualsiasi diagnostica va su stderr.

Il pre-pass e' interamente OPZIONALE: se manca spaCy/il modello, lo script esce
con codice != 0 e un messaggio su stderr; il wrapper Node tratta quel caso come
"NLP non disponibile" e l'app prosegue invariata.
"""

import json
import re
import sys
from collections import defaultdict


def _eprint(*args):
    print(*args, file=sys.stderr)


def _load_nlp():
    """Carica spaCy + il modello italiano. Solleva RuntimeError con messaggio chiaro."""
    try:
        import spacy  # noqa: F401
    except Exception as exc:  # pragma: no cover - dipende dall'ambiente
        raise RuntimeError(f"spaCy non disponibile: {exc}")
    import spacy

    try:
        return spacy.load("it_core_news_lg")
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Modello spaCy 'it_core_news_lg' non disponibile. "
            f"Esegui server/nlp/setup.sh. Dettaglio: {exc}"
        )


# --------------------------- personaggi ---------------------------

# Token "rumorosi" che spaCy a volte etichetta PER ma che non sono nomi propri utili.
_STOPNAME = {
    "signore", "signora", "signor", "dio", "dio.", "madonna", "santo", "santa",
}


def _clean_name(name):
    """Normalizza spazi e apostrofi; ritorna None se non plausibile come nome."""
    n = re.sub(r"\s+", " ", name).strip(" \t\n\r\"'«»“”‘’.,;:!?-")
    if not n:
        return None
    # Deve iniziare con maiuscola (nome proprio).
    if not n[0].isupper():
        return None
    if n.lower() in _STOPNAME:
        return None
    # Scarta token con cifre o troppo corti.
    if len(n) < 2 or any(ch.isdigit() for ch in n):
        return None
    return n


def _extract_person_spans(doc):
    """Estrae i nomi candidati da un Doc: entita' PER tenendo SOLO i token PROPN.

    Restituisce una lista di stringhe normalizzate (puo' contenere duplicati).
    """
    names = []
    for ent in doc.ents:
        if ent.label_ != "PER":
            continue
        # Tieni solo i token con POS == PROPN (scarta articoli/preposizioni interni
        # tipo "il", "di", che spaCy a volte ingloba nell'entita').
        toks = [t.text for t in ent if t.pos_ == "PROPN"]
        if not toks:
            continue
        cleaned = _clean_name(" ".join(toks))
        if cleaned:
            names.append(cleaned)
    return names


def _merge_aliases(name_counts):
    """Merge alias conservativo.

    Regola: un nome a 1 token confluisce in un multi-token SOLO se ne e' il primo
    o l'ultimo token (es. "Marco" -> "Marco Rossi"). MAI fondere due multi-token
    diversi tra loro. Il nome canonico e' il multi-token (piu' informativo).

    Ritorna: dict canonical_name -> { "aliases": set, "count": int }
    """
    multi = [n for n in name_counts if " " in n]
    single = [n for n in name_counts if " " not in n]

    canonical = {}
    for m in multi:
        canonical[m] = {"aliases": set(), "count": name_counts[m]}

    # Indicizza i multi-token per primo/ultimo token (case-insensitive).
    first_idx = defaultdict(list)
    last_idx = defaultdict(list)
    for m in multi:
        parts = m.split(" ")
        first_idx[parts[0].lower()].append(m)
        last_idx[parts[-1].lower()].append(m)

    for s in single:
        key = s.lower()
        # Candidati: multi-token di cui s e' primo OPPURE ultimo token.
        cands = set(first_idx.get(key, [])) | set(last_idx.get(key, []))
        if len(cands) == 1:
            # Confluisce in modo non ambiguo.
            target = next(iter(cands))
            canonical[target]["aliases"].add(s)
            canonical[target]["count"] += name_counts[s]
        else:
            # 0 candidati -> personaggio a se'; >1 candidati -> ambiguo, resta a se'.
            canonical[s] = {"aliases": set(), "count": name_counts[s]}

    return canonical


def _characters(chapters_docs):
    """chapters_docs: list of (chapterIndex, doc). Ritorna la lista personaggi."""
    name_counts = defaultdict(int)
    name_chapters = defaultdict(set)

    for idx, doc in chapters_docs:
        for nm in _extract_person_spans(doc):
            name_counts[nm] += 1
            name_chapters[nm].add(idx)

    canonical = _merge_aliases(name_counts)

    # Costruisci i chapters per ogni canonico unendo quelli del nome e degli alias.
    out = []
    for canon, info in canonical.items():
        chapters = set(name_chapters.get(canon, set()))
        for al in info["aliases"]:
            chapters |= name_chapters.get(al, set())
        mentions = info["count"]
        # Soglia: almeno 2 menzioni totali.
        if mentions < 2:
            continue
        out.append({
            "name": canon,
            "aliases": sorted(info["aliases"]),
            "mentions": int(mentions),
            "chapters": sorted(int(c) for c in chapters),
        })

    # Ordina per menzioni decrescenti (i protagonisti in cima).
    out.sort(key=lambda c: (-c["mentions"], c["name"]))
    return out


# --------------------------- citazioni / dialoghi ---------------------------

_MIN_LEN = 40
_MAX_LEN = 200

# Righe di dialogo: aperte da «, virgolette dritte/curve, o trattino lungo/em-dash.
_DIALOGUE_OPEN = ("«", '"', "“", "”", "—", "–", "- ")


def _is_wellformed(text):
    t = text.strip()
    if not (_MIN_LEN <= len(t) <= _MAX_LEN):
        return False
    # Almeno qualche lettera; scarta righe fatte di soli simboli/numeri.
    letters = sum(1 for ch in t if ch.isalpha())
    if letters < _MIN_LEN // 2:
        return False
    return True


def _extract_dialogue_lines(raw_text, chapter_index):
    """Euristica per le battute di dialogo, riga per riga (virgolette/trattini)."""
    quotes = []
    for line in raw_text.splitlines():
        s = line.strip()
        if not s:
            continue
        opener = next((o for o in _DIALOGUE_OPEN if s.startswith(o)), None)
        if opener is None:
            continue
        # Ripulisci i delimitatori esterni.
        cleaned = s.strip("«»\"“”—–- \t").strip()
        if not _is_wellformed(cleaned):
            continue
        quotes.append({
            "chapterIndex": chapter_index,
            "text": cleaned,
            "kind": "dialogue",
            "speaker": None,
            "score": 0.5,
        })
    return quotes


def _extract_inline_quotes(raw_text, chapter_index):
    """Estrae frasi tra «...» o virgolette curve quando NON sono a inizio riga
    (dialoghi inline nel mezzo della prosa)."""
    quotes = []
    for m in re.finditer(r"«([^«»]{%d,%d})»" % (_MIN_LEN, _MAX_LEN), raw_text):
        cleaned = m.group(1).strip()
        if _is_wellformed(cleaned):
            quotes.append({
                "chapterIndex": chapter_index,
                "text": cleaned,
                "kind": "dialogue",
                "speaker": None,
                "score": 0.5,
            })
    return quotes


def _textrank_sentences(text, max_n):
    """Frasi notevoli via TextRank (sumy). Ritorna lista di stringhe, best-effort.

    Se sumy non e' installato, ritorna [] (le citazioni si limitano ai dialoghi)."""
    try:
        from sumy.parsers.plaintext import PlaintextParser
        from sumy.nlp.tokenizers import Tokenizer
        from sumy.summarizers.text_rank import TextRankSummarizer
    except Exception:
        return []
    try:
        parser = PlaintextParser.from_string(text, Tokenizer("italian"))
        summarizer = TextRankSummarizer()
        sentences = summarizer(parser.document, max_n)
        return [str(s) for s in sentences]
    except Exception as exc:  # pragma: no cover
        _eprint(f"[nlp] TextRank saltato: {exc}")
        return []


def _quotes(chapters):
    """chapters: list of {index, title, text}. Ritorna la lista citazioni."""
    out = []
    seen = set()

    def _add(q):
        key = (q["text"].lower(), q["chapterIndex"])
        if key in seen:
            return
        seen.add(key)
        out.append(q)

    for ch in chapters:
        idx = int(ch.get("index", 0))
        raw = ch.get("text") or ""
        if not raw.strip():
            continue

        # 1) Battute di dialogo (inizio riga + inline tra caporali).
        for q in _extract_dialogue_lines(raw, idx):
            _add(q)
        for q in _extract_inline_quotes(raw, idx):
            _add(q)

        # 2) Frasi notevoli (TextRank) come citazioni "quote".
        flat = re.sub(r"\s+", " ", raw).strip()
        for sent in _textrank_sentences(flat, max_n=5):
            cleaned = sent.strip().strip("«»\"“”").strip()
            if _is_wellformed(cleaned):
                _add({
                    "chapterIndex": idx,
                    "text": cleaned,
                    "kind": "quote",
                    "speaker": None,
                    "score": 0.7,
                })

    return out


# --------------------------- main ---------------------------

def main():
    try:
        raw = sys.stdin.read()
        chapters = json.loads(raw) if raw.strip() else []
    except Exception as exc:
        _eprint(f"[nlp] input JSON non valido: {exc}")
        return 2

    if not isinstance(chapters, list):
        _eprint("[nlp] input deve essere una lista di capitoli")
        return 2

    try:
        nlp = _load_nlp()
    except RuntimeError as exc:
        _eprint(f"[nlp] {exc}")
        return 3

    # Limita la lunghezza per evitare picchi di memoria su capitoli enormi.
    nlp.max_length = max(nlp.max_length, 3_000_000)

    chapters_docs = []
    for ch in chapters:
        if not isinstance(ch, dict):
            continue
        idx = int(ch.get("index", 0))
        text = ch.get("text") or ""
        if not text.strip():
            continue
        try:
            doc = nlp(text)
        except Exception as exc:  # pragma: no cover
            _eprint(f"[nlp] parsing capitolo {idx} fallito: {exc}")
            continue
        chapters_docs.append((idx, doc))

    characters = _characters(chapters_docs)
    quotes = _quotes(chapters)

    json.dump(
        {"characters": characters, "quotes": quotes},
        sys.stdout,
        ensure_ascii=False,
    )
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
