// Automated accessibility checks (axe-core, WCAG 2.1 A/AA) on the main screens and open overlays.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { axeViolations, click, clickNth, LAPTOP, PHONE, sleep, startApp, waitForText } from './harness.mjs'
import { ids } from './mock-api.mjs'

let app
before(async () => (app = await startApp()))
after(async () => app?.close())

const screens = [
  { name: 'sign in (phone)', role: null, path: '/login', viewport: PHONE, ready: 'Sign in' },
  { name: 'home', role: 'sales_person', path: '/home', ready: 'Due today' },
  { name: 'my leads', role: 'sales_person', path: '/leads', ready: 'Asha Patil' },
  { name: 'lead detail', role: 'sales_person', path: `/leads/${ids.lead}`, ready: 'History' },
  { name: 'my day', role: 'sales_person', path: '/day', ready: 'Phone call, asked for a quote.' },
  { name: 'profile', role: 'sales_person', path: '/profile', ready: 'Log out' },
  { name: 'dashboard', role: 'super_admin', path: '/dashboard', ready: 'Target vs achieved' },
  { name: 'people', role: 'super_admin', path: '/people', ready: 'Priya Desai' },
  { name: 'projects', role: 'super_admin', path: '/projects', ready: 'Pune Retail Drive' },
  { name: 'project detail', role: 'moderator', path: `/projects/${ids.online}`, ready: 'Priya Desai' },
  { name: 'transfers', role: 'moderator', path: '/transfers', ready: 'Approve' },
]

describe('axe: screens on a phone and a laptop', () => {
  for (const viewport of [PHONE, LAPTOP]) {
    for (const s of screens) {
      test(`${s.name} @${viewport.width}`, async () => {
        const { page, go } = await app.open(s.viewport ?? viewport, { signedIn: !!s.role, role: s.role ?? 'sales_person' })
        await go(s.path)
        await waitForText(page, s.ready)
        await sleep(300)
        const v = await axeViolations(page)
        assert.deepEqual(v, [])
        await page.close()
      })
    }
  }
})

describe('axe: open overlays', () => {
  test('log follow-up sheet', async () => {
    const { page, go } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await waitForText(page, 'Save follow-up')
    await sleep(500)
    assert.deepEqual(await axeViolations(page), [])
    await page.close()
  })

  test('status chips, quick notes and quick dates inside the form', async () => {
    const { page, go } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Follow-up scheduled', '[role=radio]')
    await waitForText(page, 'Tomorrow')
    await sleep(500)
    assert.deepEqual(await axeViolations(page), [])
    await page.close()
  })

  test('lead actions menu', async () => {
    const { page, go } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await clickNth(page, 'More actions', 0)
    await waitForText(page, 'Request transfer')
    await sleep(500)
    assert.deepEqual(await axeViolations(page), [])
    await page.close()
  })

  test('photo viewer', async () => {
    const { page, go } = await app.open(PHONE)
    await go('/day')
    await click(page, 'Open visit photo')
    await waitForText(page, 'Open in Maps')
    await sleep(400)
    assert.deepEqual(await axeViolations(page), [])
    await page.close()
  })

  test('add lead form', async () => {
    const { page, go } = await app.open(PHONE, { projectId: ids.d2d })
    await go('/home')
    await click(page, 'Add lead')
    await waitForText(page, 'Save lead')
    await sleep(500)
    assert.deepEqual(await axeViolations(page), [])
    await page.close()
  })
})
