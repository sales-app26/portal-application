// The installed app opens with no signal: runs against a real production build.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import puppeteer from 'puppeteer-core'
import { build, preview } from 'vite'
import { CHROME_PATHS, sleep, waitForText } from './harness.mjs'

let outDir, server, browser, base
before(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'st-offline-'))
  const root = new URL('..', import.meta.url).pathname
  await build({ root, logLevel: 'silent', build: { outDir, emptyOutDir: true } })
  server = await preview({ root, logLevel: 'silent', build: { outDir }, preview: { port: 0, host: '127.0.0.1' } })
  base = `http://127.0.0.1:${server.httpServer.address().port}`
  const executablePath = CHROME_PATHS.find((p) => existsSync(p))
  browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--no-first-run'] })
})
after(async () => {
  await browser?.close()
  await server?.close()
  rmSync(outDir, { recursive: true, force: true })
})

describe('offline', () => {
  test('after one visit the app shell and lazy screens open with no network', async () => {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${base}/login`, { waitUntil: 'networkidle0' })
    await waitForText(page, 'Your leads, follow-ups and visits in one place.')

    // The worker installs and fills its cache in the background.
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active && (await caches.keys()).some((k) => k.startsWith('st-')), { timeout: 10000 })
    const cached = await page.evaluate(async () => {
      const c = await caches.open((await caches.keys())[0])
      return (await c.keys()).map((r) => new URL(r.url).pathname)
    })
    assert.ok(cached.includes('/') && cached.some((p) => p.startsWith('/assets/') && p.endsWith('.js')), 'app shell and scripts are cached')
    assert.ok(!cached.some((p) => p.startsWith('/api/')), 'API responses are never cached')

    await page.setOfflineMode(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForText(page, 'Your leads, follow-ups and visits in one place.')

    // A screen that was never opened before still loads: its code is in the cache.
    await page.goto(`${base}/set-password`, { waitUntil: 'domcontentloaded' })
    await waitForText(page, 'This link has expired or was already used')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('the worker file is served and never cached by the browser for long', async () => {
    const res = await fetch(`${base}/sw.js`)
    assert.equal(res.status, 200)
    assert.match(await res.text(), /PRECACHE/)
    await sleep(10)
  })
})
