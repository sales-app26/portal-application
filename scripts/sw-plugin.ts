import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

// Files in /public that the build doesn't list but the app needs offline.
const STATIC = ['/favicon.svg', '/manifest.webmanifest', '/app-icon-192.png', '/app-icon-512.png']

/**
 * Fonts ship one file per script and per format. A phone only ever uses the Latin woff2 files,
 * so the install skips the rest (they are still cached if a page ever asks for them).
 */
const skipForNow = (file: string) => /\.woff2?$/.test(file) && !/-latin-\d+-normal-[\w-]+\.woff2$/.test(file)

/**
 * Emits /sw.js with the list of every built file, so the installed app opens with no signal.
 * - Built files are fingerprinted: cache-first is safe.
 * - Page loads: network first, falling back to the cached app shell.
 * - /api and cross-origin requests (map tiles, signed photo links) are never cached.
 */
export function precacheServiceWorker(): Plugin {
  return {
    name: 'precache-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js' && !skipForNow(f))
      const urls = ['/', ...files.filter((f) => f !== 'index.html').map((f) => `/${f}`), ...STATIC]
      const version = createHash('sha1').update(urls.join('|')).digest('hex').slice(0, 10)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: template(urls, version) })
    },
  }
}

const template = (urls: string[], version: string) => `// Generated at build time. Do not edit.
const CACHE = 'st-${version}'
const PRECACHE = ${JSON.stringify(urls)}

self.addEventListener('install', (event) => {
  // No skipWaiting here: the page asks for it, so an open form is never swapped under the user.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)))
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('st-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')))
    return
  }
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && url.pathname.startsWith('/assets/')) caches.open(CACHE).then((c) => c.put(req, res.clone()))
      return res
    })),
  )
})
`
