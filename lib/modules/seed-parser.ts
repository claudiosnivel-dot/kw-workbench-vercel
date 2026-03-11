export function parseSeedsFromRows(rows: { keyword: string }[]): string[] {
  return Array.from(
    new Set(
      rows
        .map((row) => row.keyword.trim())
        .filter(Boolean)
    )
  );
}
