import { apiRaw } from './api'

/** Fetches a CSV with the bearer token and saves it (api-contract §5: raw file, not the JSON envelope). */
export async function downloadCsv(path: string, query: Record<string, string | undefined>): Promise<string> {
  const res = await apiRaw(path, { query })
  const blob = await res.blob()
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'export.csv'
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return name
}

const csvCell = (v: string | number) => {
  const t = String(v)
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/** Saves text the app built itself (templates, reports) as a file. Starts with a BOM so Excel reads UTF-8. */
export function saveCsv(fileName: string, header: string[], rows: (string | number)[][]) {
  const text = `﻿${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
