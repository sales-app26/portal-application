// Starts Vite, launches the system Chrome and routes /api/v1 to the in-memory mock.
// CHROME_PATH overrides the browser; HEADFUL=1 shows the window.
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
import { createMockApi, ids } from './mock-api.mjs'

export const CHROME_PATHS = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

export const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
export const LAPTOP = { width: 1280, height: 800, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }

export async function startApp() {
  const server = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' })
  await server.listen()
  const { port } = server.httpServer.address()
  const base = `http://127.0.0.1:${port}`
  const executablePath = CHROME_PATHS.find((p) => existsSync(p))
  if (!executablePath) throw new Error('No Chrome found. Set CHROME_PATH.')
  const browser = await puppeteer.launch({
    executablePath,
    headless: process.env.HEADFUL ? false : 'new',
    // A fake camera that auto-grants: the visit photo flow runs without a person.
    args: ['--no-first-run', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  })
  await browser.defaultBrowserContext().overridePermissions(base, ['geolocation', 'camera'])

  async function open(viewport = PHONE, { signedIn = true, projectId, role = 'sales_person', unreadRelease = false, gps = { latitude: 18.4966, longitude: 73.8993, accuracy: 12 } } = {}) {
    const api = createMockApi({ role, unreadRelease })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
    await page.setViewport(viewport)
    if (gps) await page.setGeolocation(gps)
    await page.setRequestInterception(true)
    page.on('request', async (req) => {
      const url = new URL(req.url())
      // Map tiles: a blank tile, so tests never touch the network.
      if (url.hostname === 'tile.openstreetmap.org') return req.respond({ status: 200, contentType: 'image/png', body: TILE })
      if (!url.pathname.startsWith('/api/v1/')) return req.continue()
      let body = null
      if (req.hasPostData()) body = req.postData() ?? (await req.fetchPostData().catch(() => null))
      // Binary multipart bodies come back base64-encoded.
      if (body && /multipart/.test(req.headers()['content-type'] ?? '') && !body.includes('Content-Disposition')) body = Buffer.from(body, 'base64').toString('latin1')
      const r = api.handle({ method: req.method(), path: url.pathname.slice('/api/v1'.length) + url.search, contentType: req.headers()['content-type'] ?? '', body })
      if (r.raw !== undefined) return req.respond({ status: r.status, headers: r.headers, body: r.raw })
      await req.respond({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) })
    })
    await page.goto(`${base}/login`)
    await page.evaluate(
      (signedIn, userId, projectId) => {
        localStorage.clear()
        if (signedIn) localStorage.setItem('st.session', JSON.stringify({ accessToken: 'test', refreshToken: 'test', expiresAt: Math.floor(Date.now() / 1000) + 3600 }))
        if (projectId) localStorage.setItem(`st.project.${userId}`, projectId)
      },
      signedIn,
      ids.me,
      projectId ?? null,
    )
    return { page, api, errors, go: (path) => page.goto(`${base}${path}`, { waitUntil: 'networkidle0' }) }
  }

  /** A page that talks to whatever the dev proxy points at (the real API): no mocking. */
  async function openReal(viewport = PHONE, { gps = { latitude: 18.4966, longitude: 73.8993, accuracy: 12 }, projectKey } = {}) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
    await page.setViewport(viewport)
    if (gps) await page.setGeolocation(gps)
    await page.setRequestInterception(true)
    // Only map tiles are stubbed; every API call goes to the real server.
    page.on('request', (req) => (new URL(req.url()).hostname === 'tile.openstreetmap.org' ? req.respond({ status: 200, contentType: 'image/png', body: TILE }) : req.continue()))
    await page.goto(`${base}/login`)
    await page.evaluate(() => localStorage.clear())
    if (projectKey) await page.evaluate(([k, v]) => localStorage.setItem(k, v), projectKey)
    return { page, errors, go: (path) => page.goto(`${base}${path}`, { waitUntil: 'networkidle0' }) }
  }

  return { base, open, openReal, close: async () => (await browser.close(), await server.close()) }
}

// ---------------------------------------------------------------- page helpers

/** Clicks the last visible element whose text or aria-label matches exactly. */
export async function click(page, text, selector = 'button, a, [role=option], li[role=option]') {
  await page.waitForFunction(
    (text, selector) => [...document.querySelectorAll(selector)].some((e) => (e.textContent.trim() === text || e.getAttribute('aria-label') === text) && e.getClientRects().length),
    { timeout: 5000 },
    text,
    selector,
  )
  await page.evaluate(
    (text, selector) => {
      const el = [...document.querySelectorAll(selector)].reverse().find((e) => (e.textContent.trim() === text || e.getAttribute('aria-label') === text) && e.getClientRects().length)
      el.click()
    },
    text,
    selector,
  )
}

/** Clicks the last visible element of `selector` whose text contains `text` (rows with avatars or a second line). */
export async function clickContaining(page, text, selector) {
  await page.waitForFunction((t, s) => [...document.querySelectorAll(s)].some((e) => e.textContent.includes(t) && e.getClientRects().length), { timeout: 5000 }, text, selector)
  await page.evaluate((t, s) => [...document.querySelectorAll(s)].reverse().find((e) => e.textContent.includes(t) && e.getClientRects().length).click(), text, selector)
}

export const waitForText = (page, text, timeout = 5000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text)
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Types into the input or textarea labelled `label`. */
export async function fill(page, label, value) {
  const id = await page.evaluate((label) => [...document.querySelectorAll('label')].find((l) => l.textContent.replace('(optional)', '').trim() === label && l.getClientRects().length)?.htmlFor, label)
  if (!id) throw new Error(`no field labelled "${label}"`)
  await page.type(`[id="${id}"]`, value)
}

/** A real mouse click (pointerdown + up), needed by Radix dropdown menus. */
export async function mouseClick(page, selector, index = 0) {
  const el = (await page.$$(selector))[index]
  if (!el) throw new Error(`nothing matches ${selector}`)
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await el.click()
}

/** Click the nth visible button/link with this exact text or aria-label (default: the first). */
export async function clickNth(page, text, index = 0, selector = 'button, a') {
  await page.waitForFunction((t, s) => [...document.querySelectorAll(s)].some((e) => (e.textContent.trim() === t || e.getAttribute('aria-label') === t) && e.getClientRects().length), { timeout: 5000 }, text, selector)
  await page.evaluate((t, s, i) => [...document.querySelectorAll(s)].filter((e) => (e.textContent.trim() === t || e.getAttribute('aria-label') === t) && e.getClientRects().length)[i].click(), text, selector, index)
}

/** Runs axe-core (WCAG 2.0/2.1 A and AA) on the current page; returns a short list of violations. */
export async function axeViolations(page) {
  const { readFileSync } = await import('node:fs')
  const { createRequire } = await import('node:module')
  const src = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
  await page.evaluate(src)
  const results = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }))
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}× e.g. ${v.nodes[0].target.join(' ')} — ${v.help}`)
}
