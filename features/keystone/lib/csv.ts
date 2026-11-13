/** RFC 4180 CSV reader: quoted fields, doubled quotes, CRLF or LF, a leading byte-order mark. No dependencies. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i += 1 } else quoted = false } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1
      row.push(field); field = ''
      if (row.some(x => x.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (quoted) throw new Error('A quoted value is never closed.')
  row.push(field)
  if (row.some(x => x.trim() !== '')) rows.push(row)
  return rows
}

export const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

/** Rows as objects keyed by normalised header, with the 1-based file line of each (header is line 1). */
export function readTable(text: string) {
  const rows = parseCsv(text)
  if (!rows.length) return { headers: [] as string[], records: [] as { line: number; values: Record<string, string> }[] }
  const headers = rows[0].map(normalizeHeader)
  const records = rows.slice(1).map((r, i) => ({ line: i + 2, values: Object.fromEntries(headers.map((h, k) => [h, (r[k] ?? '').trim()])) }))
  return { headers, records }
}
