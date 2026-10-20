// Per-person week/month summary and bulk CSV import (admin requests after the v1 PRD), on the fake API.
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { axeViolations, click, clickNth, fill, LAPTOP, PHONE, sleep, startApp, waitForText, clickContaining } from './harness.mjs'
import { ids } from './mock-api.mjs'

let app
before(async () => (app = await startApp()))
after(async () => app?.close())

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const monday = (ymd) => addDays(ymd, -((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7))
const lastSummary = (api) => api.calls.filter((c) => c.path === '/timeline/summary').at(-1).query
const csvFile = (name, text) => {
  const path = join(mkdtempSync(join(tmpdir(), 'st-csv-')), name)
  writeFileSync(path, text)
  return path
}
const GOOD_CSV = 'name,phone,business_name,location,notes,owner_email\nImran Shaikh,9123456780,,Kondhwa,,\n'
const field = (body, name) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(body)?.[1]

describe('person summary', () => {
  test('opens on the current Monday–Sunday week with totals and the days so far', async () => {
    const { page, go, api, errors } = await app.open(PHONE, { role: 'super_admin' })
    await go(`/people/${ids.priya}`)
    await waitForText(page, 'Priya Desai')
    await waitForText(page, 'Follow-ups')
    const q = lastSummary(api)
    assert.equal(q.from, monday(today))
    assert.equal(q.to, addDays(monday(today), 6))
    assert.equal(q.userId, ids.priya)
    // A week in progress lists the days so far, Monday to today.
    const sofar = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000) + 1
    assert.equal((await page.$$('main ul a[href*="/day?date="]')).length, sofar)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), PHONE.width, 'no horizontal overflow')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('previous and next week move by seven days; the future is out of reach', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'super_admin' })
    await go(`/people/${ids.priya}`)
    await waitForText(page, 'Follow-ups')
    assert.equal(await page.$eval('button[aria-label="Next week"]', (b) => b.disabled), true, 'cannot go past the current week')
    await click(page, 'Previous week')
    await page.waitForFunction((from) => location.search.includes(from), { timeout: 3000 }, addDays(monday(today), -7))
    await waitForText(page, 'Follow-ups')
    assert.equal(lastSummary(api).from, addDays(monday(today), -7))
    assert.equal(lastSummary(api).to, addDays(monday(today), -1))
    assert.equal(await page.$eval('button[aria-label="Next week"]', (b) => b.disabled), false)
    await click(page, 'Next week')
    await page.waitForFunction(() => document.querySelector('button[aria-label="Next week"]')?.disabled === true, { timeout: 3000 })
    await page.close()
  })

  test('Month switches to the calendar month and shows a grid whose days open that day', async () => {
    const { page, go, api, errors } = await app.open(PHONE, { role: 'moderator' })
    await go(`/people/${ids.priya}`)
    await waitForText(page, 'Follow-ups')
    await click(page, 'Month', 'button[role=radio]')
    await page.waitForFunction(() => location.search.includes('period=month'), { timeout: 3000 })
    await waitForText(page, new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date()))
    const q = lastSummary(api)
    assert.equal(q.from, `${today.slice(0, 7)}-01`)
    assert.ok(q.to.startsWith(today.slice(0, 7)) && q.to >= today)
    // One tappable cell for each day up to today; later days are inert.
    assert.equal((await page.$$('main a[href*="/day?date="]')).length, Number(today.slice(8)))
    await page.$eval(`a[href$="/day?date=${monday(today)}"]`, (a) => a.click())
    await page.waitForFunction((d) => location.pathname.endsWith('/day') && location.search.includes(d), { timeout: 4000 }, monday(today))
    await waitForText(page, 'Phone call, asked for a quote.')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('a quiet week says so instead of drawing empty bars', async () => {
    const { page, go } = await app.open(PHONE, { role: 'super_admin' })
    await go(`/people/${ids.modOther}`)
    await waitForText(page, 'Nothing logged this week')
    assert.equal(await page.$('main ul'), null)
    await page.close()
  })

  test('People, the dashboard and project members all lead to it', async () => {
    const { page, go } = await app.open(PHONE, { role: 'super_admin' })
    await go('/people')
    await waitForText(page, 'Priya Desai')
    await page.$eval('button[aria-label^="Priya Desai"], button.text-left', (b) => b.click())
    await page.waitForFunction((id) => location.pathname === `/people/${id}`, { timeout: 4000 }, ids.priya)
    await go('/dashboard')
    await waitForText(page, 'Target vs achieved')
    assert.ok(await page.$(`a[href="/people/${ids.priya}"]`), 'dashboard names link to the summary')
    await page.close()
  })

  test('a sales person cannot open it', async () => {
    const { page, go } = await app.open(PHONE, { role: 'sales_person' })
    await go(`/people/${ids.priya}`)
    await page.waitForFunction(() => location.pathname === '/home', { timeout: 4000 })
    await page.close()
  })

  test('laptop layout and accessibility, week and month', async () => {
    const { page, go } = await app.open(LAPTOP, { role: 'super_admin' })
    await go(`/people/${ids.priya}`)
    await waitForText(page, 'Follow-ups')
    await sleep(200)
    assert.deepEqual(await axeViolations(page), [])
    await click(page, 'Month', 'button[role=radio]')
    await page.waitForSelector('main a[href*="/day?date="]')
    await sleep(300)
    assert.deepEqual(await axeViolations(page), [])
    await page.close()
  })
})

describe('bulk import', () => {
  const owners = async (page) => {
    await clickContaining(page, 'Priya Desai', '[role=checkbox]').catch(() => {})
  }

  test('the project’s Leads tab offers it', async () => {
    const { page, go } = await app.open(PHONE, { role: 'moderator' })
    await go(`/projects/${ids.online}?tab=leads`)
    await waitForText(page, 'Add leads from a sheet')
    await page.$eval('a[href$="/import"]', (a) => a.click())
    await page.waitForFunction((id) => location.pathname === `/projects/${id}/import`, { timeout: 4000 }, ids.online)
    await waitForText(page, 'Who gets the leads')
    await page.close()
  })

  test('review: check the file, see every lead, assign them on screen, then import', async () => {
    const { page, go, api, errors } = await app.open(PHONE, { role: 'moderator' })
    await go(`/projects/${ids.online}/import`)
    await waitForText(page, 'Who gets the leads')

    // Not possible without a file.
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Check sheet')?.disabled), true)

    await (await page.$('#import-file')).uploadFile(csvFile('leads.csv', GOOD_CSV))
    await waitForText(page, 'leads.csv')
    await fill(page, 'Location for leads that have none', 'Pune')
    await click(page, 'Check sheet', 'button')
    await waitForText(page, '4 leads ready · 4 not assigned yet')
    await waitForText(page, 'Phone must be a 10-digit Indian mobile number, or left empty.')

    const dry = api.writes.find((w) => w.path.endsWith('/leads/import'))
    assert.equal(field(dry.body, 'dryRun'), 'true')
    assert.equal(field(dry.body, 'review'), 'true')
    assert.equal(field(dry.body, 'defaultLocation'), 'Pune')

    // No one is needed: leads left unassigned go in under Not assigned, to hand out later.
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add 4 leads')?.disabled), false)

    // One lead by hand, the rest in bulk.
    await clickNth(page, 'Assign', 0, 'li button') // the first lead in the file
    await clickContaining(page, 'Priya Desai', '[role=option]')
    await waitForText(page, '3 not assigned yet')
    await click(page, 'Select unassigned (3)', 'button')
    await click(page, 'Assign 3', 'button')
    await clickContaining(page, 'Meera Nair', '[role=option]')
    await waitForText(page, 'all assigned')

    await click(page, 'Add 4 leads', 'button')
    await waitForText(page, '4 leads added')
    const real = api.writes.filter((w) => w.path.endsWith('/leads/import')).at(-1)
    assert.equal(field(real.body, 'dryRun'), 'false')
    const sent = JSON.parse(field(real.body, 'assignments'))
    assert.deepEqual(Object.keys(sent), ['2', '3', '4', '7'])
    assert.equal(sent['2'], ids.priya)
    assert.equal(new Set(Object.values(sent)).size, 2)
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('all to one person: every lead goes to the member picked', async () => {
    const { page, go, api, errors } = await app.open(PHONE, { role: 'moderator' })
    await go(`/projects/${ids.online}/import`)
    await waitForText(page, 'Who gets the leads')
    await clickContaining(page, 'All to one person', '[role=radio]')
    await (await page.$('#import-file')).uploadFile(csvFile('leads.csv', GOOD_CSV))
    await waitForText(page, 'leads.csv')
    // A person must be picked first.
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Check sheet')?.disabled), true)
    await clickContaining(page, 'Priya Desai', '[role=checkbox]')
    await click(page, 'Check sheet', 'button')
    await waitForText(page, '4 leads are ready to add')
    const dry = api.writes.find((w) => w.path.endsWith('/leads/import'))
    assert.equal(field(dry.body, 'ownerId'), ids.priya)
    await click(page, 'Add 4 leads', 'button')
    await waitForText(page, '4 leads added')
    assert.equal(field(api.writes.at(-1).body, 'ownerId'), ids.priya)
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('the file’s own mistakes show next to the file and nothing moves on', async () => {
    const { page, go } = await app.open(PHONE, { role: 'moderator' })
    await go(`/projects/${ids.online}/import`)
    await waitForText(page, 'Who gets the leads')
    await (await page.$('#import-file')).uploadFile(csvFile('wrong.csv', 'client,town\nA,Pune\n'))
    await click(page, 'Check sheet', 'button')
    await waitForText(page, 'The top line of the sheet needs headings, including name and phone.')
    assert.ok(await page.$('#import-file'), 'still on the form')
    await page.close()
  })

  test('a file that is not a CSV is refused before anything is sent', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'moderator' })
    await go(`/projects/${ids.online}/import`)
    await waitForText(page, 'Who gets the leads')
    await (await page.$('#import-file')).uploadFile(csvFile('leads.xlsx', 'not really'))
    await waitForText(page, 'Save your sheet as CSV first. In Excel: Save As')
    assert.equal(api.writes.filter((w) => w.path.endsWith('/import')).length, 0)
    await page.close()
  })

  test('the template and the not-imported list download as CSV files', async () => {
    const { page, go } = await app.open(PHONE, { role: 'moderator' })
    await go(`/projects/${ids.online}/import`)
    await waitForText(page, 'Download a sample sheet')
    await page.evaluate(() => {
      window.__blobs = []
      const make = URL.createObjectURL.bind(URL)
      URL.createObjectURL = (b) => (window.__blobs.push(b), make(b))
    })
    await click(page, 'Download a sample sheet', 'button')
    const sample = await page.evaluate(async () => (await window.__blobs[0].text()).replace('﻿', '').trim().split('\r\n'))
    assert.equal(sample[0], 'business_name,phone,name,location,notes,owner_email')
    // The phone is optional: the sample shows a lead without one.
    assert.equal(sample.at(-1), 'Joshi Medicals,,,Kondhwa,No number yet,')

    await (await page.$('#import-file')).uploadFile(csvFile('leads.csv', GOOD_CSV))
    await click(page, 'Check sheet', 'button')
    await waitForText(page, 'Not added')
    await click(page, 'Download list', 'button')
    const report = await page.evaluate(async () => (await window.__blobs.at(-1).text()).replace('﻿', ''))
    assert.match(report, /^row,kind,lead,phone,reason\r\n5,invalid,Bad Phone,12345,"Phone must be a 10-digit Indian mobile number, or left empty\."/)
    await page.close()
  })

  test('accessible: the form, the report and the result', async () => {
    const { page, go } = await app.open(PHONE, { role: 'moderator' })
    await go(`/projects/${ids.online}/import`)
    await waitForText(page, 'Who gets the leads')
    assert.deepEqual(await axeViolations(page), [], 'form')
    await (await page.$('#import-file')).uploadFile(csvFile('leads.csv', GOOD_CSV))
    await click(page, 'Check sheet', 'button')
    await waitForText(page, '4 not assigned yet')
    await sleep(500) // let the page transition finish; axe reads colours mid-fade otherwise
    assert.deepEqual(await axeViolations(page), [], 'report')
    await click(page, 'Select all', 'button')
    await click(page, 'Assign 4', 'button')
    await clickContaining(page, 'Priya Desai', '[role=option]')
    await click(page, 'Add 4 leads', 'button')
    await waitForText(page, '4 leads added')
    await sleep(500)
    assert.deepEqual(await axeViolations(page), [], 'result')
    await page.close()
  })

  test('laptop: one column, the action in the page header', async () => {
    const { page, go } = await app.open(LAPTOP, { role: 'super_admin' })
    await go(`/projects/${ids.online}/import`)
    await waitForText(page, 'Who gets the leads')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), LAPTOP.width)
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('header button')].some((b) => b.textContent.trim() === 'Check sheet')), 'Check sheet sits in the header')
    await owners(page)
    await page.close()
  })
})
