// Fails the build when the first page load or a lazy screen grows past its budget.
// Run after `npm run build`. Sizes are gzip, what a phone downloads.
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

// CSS rose from 20 to 28 with the HeroUI design system (only the components the app uses are
// imported); JS by 2 KB with the theme switcher and agenda. A ratchet: lower these when you can.
const BUDGET = { initialJs: 217, initialCss: 28, lazyChunk: 60 } // KB
// Big libraries that load only on the one screen that needs them, each with its own budget.
// PdfViewer is pdf.js: it downloads only when a rep opens a PDF lesson.
const LAZY_BUDGET = { PdfViewer: 135 } // KB
const dist = new URL('../dist/', import.meta.url)
const gz = (file) => gzipSync(readFileSync(new URL(file.replace(/^\//, ''), dist))).length / 1024

const html = readFileSync(new URL('index.html', dist), 'utf8')
const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
const initial = new Set(refs)
const js = [...initial].filter((f) => f.endsWith('.js'))
const css = [...initial].filter((f) => f.endsWith('.css'))
const lazy = readdirSync(new URL('assets/', dist)).filter((f) => f.endsWith('.js') && !initial.has(`/assets/${f}`))

const sum = (files) => files.reduce((n, f) => n + gz(f), 0)
const rows = [
  ['Initial JavaScript', sum(js), BUDGET.initialJs],
  ['Initial CSS', sum(css), BUDGET.initialCss],
  ...lazy.map((f) => {
    const name = f.replace(/-[\w-]{8}\.js$/, '')
    return [`Lazy: ${name}`, gz(`/assets/${f}`), LAZY_BUDGET[name] ?? BUDGET.lazyChunk]
  }),
]
let failed = false
for (const [name, size, max] of rows) {
  const over = size > max
  failed ||= over
  console.log(`${over ? 'FAIL' : 'ok  '} ${name.padEnd(34)} ${size.toFixed(1).padStart(6)} KB / ${max} KB`)
}
if (failed) {
  console.error('\nOver budget. Split the code, or lazy-load what the first screen does not need.')
  process.exit(1)
}
