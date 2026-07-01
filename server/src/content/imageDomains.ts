function tokenizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

export function matchesKeyword(haystack: string, keyword: string): boolean {
  const kw = tokenizeWords(keyword);
  if (kw.length === 0) return false;
  const hay = tokenizeWords(haystack);
  if (hay.length < kw.length) return false;
  for (let i = 0; i + kw.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < kw.length; j++) {
      const h = hay[i + j]!;
      const k = kw[j]!;
      if (h !== k && !h.startsWith(k)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

export function anyKeywordMatches(haystack: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => matchesKeyword(haystack, k));
}
