export function corpusIndexEntry(row: Record<string, unknown>) {
  return { key: row.id, name: row.name ?? null, updateTime: row.updated ?? null, totalPrice: row.total ?? null };
}
