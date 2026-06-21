import { createHash } from "node:crypto";
import { ContentError } from "./engine.js";

// Reads a full Markdown book and prepares it for analysis: computes the SHA-256
// of the content (to know when to re-analyze) and splits into chapters by
// Markdown headings (# / ##). If there are no headings, the book is one chapter.
// Ported from Java BookImporter.

export interface ImportedChapter {
  index: number;
  title: string | null;
  text: string;
  charCount: number;
}

export interface ImportedBook {
  title: string;
  author: string | null;
  language: string;
  contentHash: string;
  charCount: number;
  chapters: ImportedChapter[];
}

const HEADING = /^(#{1,2})\s+(.+?)\s*$/gm;
const TITLE_H1 = /^#\s+(.+?)\s*$/m;
// YAML frontmatter block at the top of the file (--- ... ---).
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
// title: field inside frontmatter (unquoted or single/double-quoted).
const FRONTMATTER_TITLE = /^title:\s*["']?(.+?)["']?\s*$/m;

export function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// Strips extension and converts separators to spaces for use as fallback title.
function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "") // drop extension
    .replace(/[_-]+/g, " ") // hyphens/underscores -> spaces
    .trim();
}

export function readBook(
  content: string,
  defaultTitle: string,
  author: string | null,
  language: string | null,
): ImportedBook {
  if (content.trim() === "") {
    throw new ContentError("Il file libro e' vuoto");
  }
  const hash = sha256(content);
  const chapters = splitChapters(content);
  const title = detectTitle(content) ?? (titleFromFileName(defaultTitle) || defaultTitle);
  return {
    title,
    author,
    language: language ?? "it",
    contentHash: hash,
    charCount: content.length,
    chapters,
  };
}

// Strategia di splitting (in ordine di preferenza):
// 1) heading Markdown # / ## (convenzione standard);
// 2) fallback per export pandoc/.docx senza heading: marcatori "Capitolo N" oppure
//    una riga col solo numero del capitolo seguita dal titolo in corsivo *Titolo*;
// 3) altrimenti capitolo unico.
function splitChapters(content: string): ImportedChapter[] {
  const byHeadings = splitByMarkdownHeadings(content);
  if (byHeadings !== null) return byHeadings;

  const byMarkers = splitByPlainMarkers(content);
  if (byMarkers !== null) return byMarkers;

  const text = content.trim();
  return [{ index: 0, title: null, text, charCount: text.length }];
}

// Split su heading Markdown # / ##. null se non ce ne sono.
function splitByMarkdownHeadings(content: string): ImportedChapter[] | null {
  const headings: { start: number; end: number; title: string }[] = [];
  HEADING.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEADING.exec(content)) !== null) {
    headings.push({ start: m.index, end: m.index + m[0].length, title: m[2].trim() });
  }
  if (headings.length === 0) return null;

  const chapters: ImportedChapter[] = [];
  for (let i = 0; i < headings.length; i++) {
    const bodyStart = headings[i].end;
    const bodyEnd = i + 1 < headings.length ? headings[i + 1].start : content.length;
    const text = content.substring(bodyStart, bodyEnd).trim();
    chapters.push({ index: i, title: headings[i].title, text, charCount: text.length });
  }
  return chapters;
}

// Fallback senza heading Markdown (tipico di export da .docx via pandoc):
//  - righe "Capitolo N" / "CAPITOLO N - Titolo";
//  - una riga col solo numero (anche in corsivo, es. *1*) seguita dal titolo in corsivo *Titolo*.
// Richiede almeno 2 marcatori per evitare falsi positivi su numeri isolati nel testo.
function splitByPlainMarkers(content: string): ImportedChapter[] | null {
  const lines = content.split(/\r?\n/);
  const numberOnly = /^\s*\*?\d{1,3}\*?[.)]?\s*$/; // "2", "*1*", "3.", "12)"
  const italicTitle = /^\s*\*([^*].{0,78})\*\s*$/; // "*Titolo*" (breve, non grassetto)
  const capLine = /^\s*(?:capitolo|cap\.)\s+([0-9ivxlcdm]+)\s*[-–—:.)]?\s*(.*)$/i;

  type Marker = { idx: number; bodyStart: number; title: string | null };
  const markers: Marker[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cap = capLine.exec(lines[i]);
    if (cap) {
      const t = cap[2].trim();
      markers.push({ idx: i, bodyStart: i + 1, title: t !== "" ? t : `Capitolo ${cap[1]}` });
      continue;
    }
    if (numberOnly.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length) {
        const it = italicTitle.exec(lines[j]);
        if (it) {
          markers.push({ idx: i, bodyStart: j + 1, title: it[1].trim() });
          i = j; // salta la riga del titolo
        }
      }
    }
  }
  if (markers.length < 2) return null;

  const chapters: ImportedChapter[] = [];
  for (let k = 0; k < markers.length; k++) {
    const start = markers[k].bodyStart;
    const end = k + 1 < markers.length ? markers[k + 1].idx : lines.length;
    const text = lines.slice(start, end).join("\n").trim();
    chapters.push({ index: k, title: markers[k].title, text, charCount: text.length });
  }
  return chapters;
}

function detectTitle(content: string): string | null {
  // 1. YAML frontmatter title: field takes precedence.
  const fm = FRONTMATTER.exec(content);
  if (fm) {
    const ft = FRONTMATTER_TITLE.exec(fm[1]);
    if (ft && ft[1].trim() !== "") return ft[1].trim();
  }
  // 2. First level-1 Markdown heading.
  const m = TITLE_H1.exec(content);
  return m ? m[1].trim() : null;
}

export function joinChapters(chapters: ImportedChapter[]): string {
  let sb = "";
  for (const ch of chapters) {
    if (ch.title) sb += `# ${ch.title}\n\n`;
    sb += `${ch.text}\n\n`;
  }
  return sb;
}
