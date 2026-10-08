/**
 * Lightweight, dependency-free parsing for TPO bulk-paste imports (roster,
 * assessment scores). Handles:
 *  - comma OR tab-delimited rows (auto-detected per line, so pasting from a
 *    spreadsheet "just works" alongside typed comma-separated rows)
 *  - quoted fields containing commas (basic CSV quoting, single-line only)
 *  - flexible column order via header-name matching, with a positional
 *    fallback when no header row is present
 */

export function splitRow(line: string): string[] {
  const delimiter = line.includes("\t") ? "\t" : ",";
  if (delimiter === "\t") {
    return line.split("\t").map((c) => c.trim());
  }
  // Split on commas that are NOT inside double quotes, then strip wrapping quotes.
  const cells = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  return cells.map((c) => c.trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"'));
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Given the first row's cells and a map of `field -> [recognized header names]`,
 * tries to find a column for every field. Returns null if any field has no
 * match (caller should then fall back to positional/default order).
 */
export function detectHeaderMapping<F extends string>(
  headerCells: string[],
  synonyms: Record<F, string[]>
): Record<F, number> | null {
  const normalized = headerCells.map(normalizeHeader);
  const mapping = {} as Record<F, number>;

  for (const field of Object.keys(synonyms) as F[]) {
    const candidates = synonyms[field].map(normalizeHeader);
    const idx = normalized.findIndex((h) => candidates.includes(h));
    if (idx === -1) return null;
    mapping[field] = idx;
  }
  return mapping;
}
