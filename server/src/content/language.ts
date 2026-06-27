import { ContentError } from "./engine.js";

const ISO_TO_LANG: Record<string, string> = {
  it: "Italian",
  en: "English",
  fr: "French",
  de: "German",
  es: "Spanish",
  pt: "Portuguese",
  nl: "Dutch",
  ca: "Catalan",
  ro: "Romanian",
  gl: "Galician",
  sv: "Swedish",
  no: "Norwegian",
  nb: "Norwegian",
  nn: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  is: "Icelandic",
  pl: "Polish",
  cs: "Czech",
  sk: "Slovak",
  sl: "Slovenian",
  hr: "Croatian",
  sr: "Serbian",
  bg: "Bulgarian",
  uk: "Ukrainian",
  ru: "Russian",
  el: "Greek",
  hu: "Hungarian",
  et: "Estonian",
  lv: "Latvian",
  lt: "Lithuanian",
  tr: "Turkish",
  ar: "Arabic",
  he: "Hebrew",
  fa: "Persian",
  hi: "Hindi",
  bn: "Bengali",
  ur: "Urdu",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
};

export function languageName(code: string | null | undefined): string {
  const raw = (code ?? "").trim();
  if (raw === "") {
    throw new ContentError("languageName: missing language code (book language is required)");
  }
  const normalized = raw.toLowerCase().split(/[-_]/)[0]!;
  const name = ISO_TO_LANG[normalized];
  if (!name) {
    throw new ContentError(
      `languageName: unsupported language "${code}" (known codes: ${Object.keys(ISO_TO_LANG).join(", ")})`,
    );
  }
  return name;
}
