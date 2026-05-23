export function normalizeForSearch(value: string | number | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function searchTokens(query: string) {
  return normalizeForSearch(query).split(" ").filter(Boolean);
}

export function matchesSearch(query: string, values: Array<string | number | null | undefined>) {
  const tokens = searchTokens(query);

  if (tokens.length === 0) {
    return true;
  }

  const haystack = normalizeForSearch(values.join(" "));
  return tokens.every((token) => haystack.includes(token));
}
