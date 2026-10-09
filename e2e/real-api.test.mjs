// The portal against the REAL API code (in-memory Postgres, fake Supabase), no mocking.
// Needs ../service-application installed. Run: npm run test:e2e:real
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { after, before, describe, test } from 'node:test'
import { click, clickNth, fill, LAPTOP, PHONE, sleep, startApp, waitForText } from './harness.mjs'

const SERVICE = new URL('../../service-application/', import.meta.url).pathname
let server, info, app

before(async () => {
  server = spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', 'test/support/dev-server.ts'], { cwd: SERVICE, detached: true, stdio: ['ignore', 'pipe', 'inherit'] })
  info = await new Promise((resolve, reject) => {
    let out = ''
    server.stdout.on('data', (d) => {
      out += d
      const m = /READY (\{.*\})/.exec(out)
      if (m) resolve(JSON.parse(m[1]))
    })
    server.on('exit', (c) => reject(new Error(`API dev server exited early (${c})`)))
    setTimeout(() => reject(new Error('API dev server did not start in 90 s')), 90_000)
  })
  process.env.VITE_API_PROXY = info.baseUrl // read by vite.config.ts when the app starts
  app = await startApp()
}, { timeout: 120_000 })

after(async () => {
  await app?.close()
  if (server?.pid) process.kill(-server.pid, 'SIGTERM')
})

// The API allows 10 sign-ins a minute per address, so each person signs in through the form once
// and later steps reuse that session (the same way an installed app stays signed in).
const sessions = new Map()
async function signIn(page, who) {
  const saved = sessions.get(who.email)
  if (saved) {
    await page.goto(`${app.base}/login`, { waitUntil: 'domcontentloaded' })
    await page.evaluate((v) => localStorage.setItem('st.session', v), saved)
    return
  }
  await page.goto(`${app.base}/login`, { waitUntil: 'networkidle0' })
  await fill(page, 'Email', who.email)
  await fill(page, 'Password', who.password)
  await click(page, 'Sign in', 'button[type=submit]')
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 10000 })
  sessions.set(who.email, await page.evaluate(() => localStorage.getItem('st.session')))
}
const as = async (who, opts) => {
  const t = await app.openReal(PHONE, opts)
  await signIn(t.page, who)
  // A saved session lands on the login page; open the app proper so it picks the session up.
  if (!/^\/(home|dashboard)/.test(new URL(t.page.url()).pathname)) await t.page.goto(`${app.base}/`, { waitUntil: 'networkidle0' })
  return t
}
const shared = {} // ids carried between the steps below

/** On a failing step, say what was on screen: real-API failures are hard to read from a timeout alone. */
async function describeFailure(page, label, fn) {
  try {
    return await fn()
  } catch (e) {
    const text = await page.evaluate(() => document.body.innerText.slice(0, 500).replace(/\n+/g, ' | ')).catch(() => '(page gone)')
    e.message = `${label}: ${e.message}\n  on screen: ${text}\n  url: ${page.url()}`
    throw e
  }
}

describe('sales person, online project', () => {
  test('wrong password gives the one generic message; right one lands on Home with the target', async () => {
    const { page, errors } = await app.openReal(PHONE)
    await page.goto(`${app.base}/login`, { waitUntil: 'networkidle0' })
    await fill(page, 'Email', info.sales.email)
    await fill(page, 'Password', 'not-the-password')
    await click(page, 'Sign in', 'button[type=submit]')
    await waitForText(page, 'Email or password is incorrect')
    await page.evaluate(() => (document.querySelector('input[type=password]').value = ''))
    await page.click('input[type=password]', { clickCount: 3 })
    await page.keyboard.type(info.sales.password)
    await click(page, 'Sign in', 'button[type=submit]')
    await page.waitForFunction(() => location.pathname === '/home', { timeout: 10000 })
    await waitForText(page, 'Pune Retail Drive')
    await waitForText(page, 'converted this week')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('add a lead: the real server normalises the phone, creates the location and the first entry', async () => {
    const { page, errors } = await as(info.sales)
    await click(page, 'Add lead')
    await fill(page, 'Name', 'Asha Patil')
    await fill(page, 'Business name', 'Patil General Store')
    await fill(page, 'Phone', '+91 98765 43210')
    await fill(page, 'Location', 'Wanowrie')
    await fill(page, 'Note', 'Owner interested in the monthly plan.')
    await click(page, 'Save lead')
    await page.waitForFunction(() => /^\/leads\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 10000 })
    shared.onlineLead = await page.evaluate(() => location.pathname.split('/')[2])
    await waitForText(page, 'Asha Patil')
    await waitForText(page, '98765 43210')
    await waitForText(page, 'Owner interested in the monthly plan.')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('the same phone again is refused with a link to the existing lead', async () => {
    const { page } = await as(info.sales)
    await click(page, 'Add lead')
    await fill(page, 'Name', 'Someone Else')
    await fill(page, 'Phone', '9876543210')
    await fill(page, 'Location', 'Wanowrie')
    await fill(page, 'Note', 'Trying a duplicate number.')
    await click(page, 'Save lead')
    await waitForText(page, 'You already have this lead.')
    await click(page, 'Open that lead', 'a')
    await page.waitForFunction((id) => location.pathname === `/leads/${id}`, { timeout: 5000 }, shared.onlineLead)
    await page.close()
  })

  test('log a follow-up: status, note and next date are accepted and shown', async () => {
    const { page, go, errors } = await as(info.sales)
    await go(`/leads/${shared.onlineLead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Choose a status')
    await click(page, 'Follow-up scheduled', '[role=option]')
    await fill(page, 'Note', 'Called, wants a demo on Monday.')
    // Required date for "Follow-up scheduled": saving without it is stopped first.
    await click(page, 'Save follow-up')
    await waitForText(page, 'Choose the next follow-up date for Follow-up scheduled.')
    // The date field is a calendar. It must open on this month, not on the latest allowed one.
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + 86_400_000))
    await page.$eval('button[aria-haspopup=dialog]', (b) => b.click())
    await page.waitForSelector(`[role=gridcell][data-day="${tomorrow}"]`, { timeout: 5000 })
    await page.$eval(`[role=gridcell][data-day="${tomorrow}"] button`, (b) => b.click())
    await click(page, 'Save follow-up')
    await waitForText(page, 'Follow-up saved.')
    await waitForText(page, 'Called, wants a demo on Monday.')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('note shorter than five characters is refused by the server rules too', async () => {
    const { page, go } = await as(info.sales)
    await go(`/leads/${shared.onlineLead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Choose a status')
    await click(page, 'Contacted', '[role=option]')
    await fill(page, 'Note', 'ok')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Write at least 5 characters.')
    await page.close()
  })
})

describe('sales person, door-to-door project', () => {
  test('a visit with a real camera frame: the server stamps it and the portal shows it', async () => {
    const { page, errors } = await as(info.sales, { projectKey: [`st.project.${info.sales.id}`, info.projects.doorToDoor] })
    await waitForText(page, 'Kondhwa Door-to-door')
    await click(page, 'Add lead')
    await click(page, 'Take photo', 'button > span > span.text-title-sm')
    await page.waitForSelector('button[aria-label="Take photo"]:not([disabled])', { timeout: 15000 })
    await click(page, 'Take photo', 'button[aria-label="Take photo"]')
    await click(page, 'Use photo')
    await waitForText(page, 'Photo taken')
    await fill(page, 'Name', 'Imran Shaikh')
    await fill(page, 'Phone', '9123456780')
    await fill(page, 'Location', 'Kondhwa')
    await fill(page, 'Note', 'Shop visited, owner present.')
    await click(page, 'Save lead')
    await page.waitForFunction(() => /^\/leads\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 20000 })
    shared.visitLead = await page.evaluate(() => location.pathname.split('/')[2])
    await page.waitForSelector('img[alt^="Visit photo"]', { timeout: 10000 })
    // The signed link points at the (fake) storage host, so check it from Node, not the page.
    const src = await page.$eval('img[alt^="Visit photo"]', (img) => img.src)
    const res = await fetch(src)
    const kb = Math.round((await res.arrayBuffer()).byteLength / 1024)
    assert.equal(res.headers.get('content-type'), 'image/jpeg')
    assert.ok(kb > 1 && kb < 400, `stamped photo is ${kb} KB`)
    await waitForText(page, '± 12 m')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('My day shows both leads, the visit has a pin, and the photo opens full screen', async () => {
    const { page, go, errors } = await as(info.sales)
    await go('/day')
    await waitForText(page, 'Imran Shaikh')
    await waitForText(page, 'Asha Patil')
    await click(page, 'Map')
    await page.waitForSelector('.leaflet-container .map-pin', { timeout: 10000 })
    await page.evaluate(() => history.back())
    await page.waitForFunction(() => !document.querySelector('.leaflet-container'), { timeout: 3000 })
    await click(page, 'Open visit photo')
    await waitForText(page, 'Open in Maps')
    const loaded = await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog] img')].some((i) => i.complete && i.naturalWidth > 0), { timeout: 8000 })
    assert.ok(loaded)
    assert.deepEqual(errors, [])
    await page.close()
  })
})

describe('transfers and admin', () => {
  test('sales person requests a transfer; the moderator approves it; the lead moves', async () => {
    const ravi = await as(info.sales)
    const d = (label, fn) => describeFailure(ravi.page, label, fn)
    await ravi.go(`/leads/${shared.onlineLead}`)
    await d('open menu', () => clickNth(ravi.page, 'More actions', 0))
    await d('menu item', () => click(ravi.page, 'Request transfer', 'button'))
    await d('open picker', () => click(ravi.page, 'Choose a person', 'button[aria-haspopup=listbox]'))
    await d('pick Karan', () => click(ravi.page, 'KMKaran Mehta', '[role=option]'))
    await ravi.page.waitForSelector('textarea')
    await ravi.page.type('textarea', 'Karan covers Wanowrie.')
    await d('submit', () => click(ravi.page, 'Request transfer', 'button'))
    await d('toast', () => waitForText(ravi.page, 'Transfer requested.'))
    await ravi.page.close()

    const meera = await as(info.moderator)
    const m = (label, fn) => describeFailure(meera.page, label, fn)
    await meera.go('/transfers')
    await m('reason shown', () => waitForText(meera.page, 'Karan covers Wanowrie.'))
    await m('approve', () => click(meera.page, 'Approve'))
    await m('approved toast', () => waitForText(meera.page, 'Transfer approved.'))
    await m('list empty', () => waitForText(meera.page, 'No transfers waiting'))
    await meera.page.close()

    const ravi2 = await as(info.sales)
    await ravi2.go('/leads')
    // Ravi's only online lead moved, so that project's list is empty (Imran is in the other project).
    await describeFailure(ravi2.page, 'ravi leads', () => waitForText(ravi2.page, 'No leads yet'))
    assert.ok(!(await ravi2.page.evaluate(() => document.body.innerText)).includes('Asha Patil'), 'the transferred lead left the list')
    await ravi2.page.close()
  })

  test('moderator dashboard reflects the day, and exports a CSV', async () => {
    const { page, errors } = await as(info.moderator)
    await page.goto(`${app.base}/dashboard`, { waitUntil: 'networkidle0' })
    await waitForText(page, 'Target vs achieved')
    const text = await page.evaluate(() => document.body.innerText)
    for (const t of ['Ravi Kumar', 'Logged nothing today', 'Priya Desai']) assert.ok(text.includes(t), `shows ${t}`)
    await page.click('button[aria-label="Export CSV"]')
    await click(page, 'Export leads (CSV)', 'button')
    await waitForText(page, 'Saved leads_')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('moderator reassigns a lead from the project screen', async () => {
    const { page, errors } = await as(info.moderator)
    await page.goto(`${app.base}/projects/${info.projects.online}?tab=leads`, { waitUntil: 'networkidle0' })
    await waitForText(page, 'Asha Patil')
    await click(page, 'Select to reassign')
    await page.$$eval('[role=checkbox]', (rows) => rows[0].click())
    await click(page, 'Reassign 1')
    await click(page, 'Choose a person', 'button[aria-haspopup=listbox]')
    await click(page, 'PDPriya DesaiSales Person', '[role=option]')
    await page.waitForSelector('textarea')
    await page.type('textarea', 'Priya now covers this area.')
    await click(page, 'Reassign', 'button')
    await waitForText(page, '1 lead reassigned.')
    await waitForText(page, 'Priya Desai')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('super admin sees every project and can open a lead; people lists the team', async () => {
    const { page } = await as(info.superAdmin)
    await page.goto(`${app.base}/people`, { waitUntil: 'networkidle0' })
    await waitForText(page, 'Ravi Kumar')
    await page.goto(`${app.base}/projects`, { waitUntil: 'networkidle0' })
    await waitForText(page, 'Pune Retail Drive')
    await waitForText(page, 'Kondhwa Door-to-door')
    await page.goto(`${app.base}/leads/${shared.visitLead}`, { waitUntil: 'networkidle0' })
    await waitForText(page, 'Imran Shaikh')
    await page.close()
  })

  test('laptop: the admin dashboard and the leads split view work on real data', async () => {
    const t = await app.openReal(LAPTOP)
    await signIn(t.page, info.moderator)
    await t.go('/dashboard')
    await waitForText(t.page, 'Target vs achieved')
    await sleep(200)
    assert.equal(await t.page.evaluate(() => document.documentElement.scrollWidth), LAPTOP.width)
    await t.page.close()
  })
})

describe('summary and bulk import on real data', () => {
  const tile = (page, label) =>
    page.evaluate((l) => [...document.querySelectorAll('div, button')].find((e) => e.children.length === 2 && e.children[1].textContent === l && e.children[1].tagName === 'SPAN')?.children[0].textContent, label)

  test('the summary counts what Ravi really did today, the same as the dashboard says', async () => {
    const { page, errors } = await as(info.moderator)
    await page.goto(`${app.base}/people/${info.sales.id}`, { waitUntil: 'networkidle0' })
    await describeFailure(page, 'summary', () => waitForText(page, 'Ravi Kumar'))
    await describeFailure(page, 'tiles', () => waitForText(page, 'Leads added'))
    // Earlier tests: two leads added (each with a first entry), one more follow-up, one visit with a photo.
    assert.equal(await tile(page, 'Follow-ups'), '3')
    assert.equal(await tile(page, 'Visits with photo'), '1')
    assert.equal(await tile(page, 'Leads added'), '2')
    await waitForText(page, 'Active on 1 of')

    await click(page, 'Month', 'button[role=radio]')
    await page.waitForFunction(() => document.querySelectorAll('main a[href*="/day?date="]').length > 0, { timeout: 8000 })
    assert.equal(await tile(page, 'Follow-ups'), '3')
    // Today's cell opens the day's timeline with those same entries.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    await page.$eval(`a[href$="/day?date=${today}"]`, (a) => a.click())
    await describeFailure(page, 'day timeline', () => waitForText(page, 'Imran Shaikh'))
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('a moderator imports a CSV: check, report, import; the people picked find the leads in My leads', async () => {
    const csv = [
      'name,phone,business_name,location,notes,owner_email',
      'Vikram Rao,9000000101,Rao Traders,Baner,Met at the expo,',
      'Sunita Kale,+91 90000 00102,,,Interested in the annual plan,',
      'Deepak Jain,9000000103,Jain Pharma,Aundh,,karan@pronttera.in',
      'Bad Number,12345,,Baner,,',
      'Asha Again,9876543210,,Baner,,',
      'Ghost Owner,9000000104,,Baner,,nobody@pronttera.in',
      '',
    ].join('\n')
    const path = (await import('node:path')).join((await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'st-real-')), 'import.csv')
    ;(await import('node:fs')).writeFileSync(path, csv)

    const { page, errors } = await as(info.moderator)
    await page.goto(`${app.base}/projects/${info.projects.online}/import`, { waitUntil: 'networkidle0' })
    await describeFailure(page, 'form', () => waitForText(page, 'Who gets the leads'))
    await (await page.$('#import-file')).uploadFile(path)
    await waitForText(page, 'import.csv')
    // Rows without an owner_email are shared by Priya and Karan.
    await page.$$eval('[role=checkbox]', (rows) => rows.filter((r) => /Priya|Karan/.test(r.textContent)).forEach((r) => r.click()))
    await waitForText(page, '2 people picked')
    await fill(page, 'Location for rows that have none', 'Pune')
    await click(page, 'Check file', 'button')

    await describeFailure(page, 'report', () => waitForText(page, '3 leads are ready to import'))
    await waitForText(page, '1 duplicate')
    await waitForText(page, '2 rows with a problem')
    await waitForText(page, 'Phone must be a 10-digit Indian mobile number.')
    await waitForText(page, 'Already a lead in this project, owned by Priya Desai.') // reassigned to Priya in an earlier test
    await waitForText(page, 'No active member of this project has this owner_email.')

    // Checking changed nothing: Priya has only the lead she was reassigned.
    await click(page, 'Import 3 leads', 'button')
    await describeFailure(page, 'result', () => waitForText(page, '3 leads imported'))
    await waitForText(page, 'Who got them')
    assert.deepEqual(errors, [])
    await page.close()

    // The list is alphabetical, so Karan was picked first: he gets the first shared row, Priya the next,
    // and Deepak goes to Karan by his owner_email. Each finds theirs, as New, in their own list.
    const priya = await as(info.others.priya)
    await priya.go('/leads')
    await describeFailure(priya.page, 'priya leads', () => waitForText(priya.page, 'Sunita Kale'))
    const priyaText = await priya.page.evaluate(() => document.body.innerText)
    assert.ok(priyaText.includes('New'), 'imported leads start as New')
    assert.ok(!priyaText.includes('Vikram Rao') && !priyaText.includes('Deepak Jain'), "Priya didn't get Karan's")
    await priya.page.close()

    const karan = await as(info.others.karan)
    await karan.go('/leads')
    await describeFailure(karan.page, 'karan leads', () => waitForText(karan.page, 'Deepak Jain'))
    const karanText = await karan.page.evaluate(() => document.body.innerText)
    assert.ok(karanText.includes('Vikram Rao') && !karanText.includes('Sunita Kale'), 'Karan has Vikram and Deepak')
    await karan.page.close()
  })

  test('importing the same file again imports nothing and says why', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const nodePath = await import('node:path')
    const path = nodePath.join(fs.mkdtempSync(nodePath.join(os.tmpdir(), 'st-real-')), 'again.csv')
    fs.writeFileSync(path, 'name,phone,location\nVikram Rao,9000000101,Baner\n')
    const { page } = await as(info.moderator)
    await page.goto(`${app.base}/projects/${info.projects.online}/import`, { waitUntil: 'networkidle0' })
    await (await page.$('#import-file')).uploadFile(path)
    await page.$$eval('[role=checkbox]', (rows) => rows[0].click())
    await click(page, 'Check file', 'button')
    await describeFailure(page, 'second report', () => waitForText(page, 'Nothing in this file can be imported'))
    await waitForText(page, 'Already a lead in this project')
    await page.close()
  })
})
