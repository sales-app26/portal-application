// Team scorecard (People → Scorecard) and one rep's performance review, against the fake API.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { axeViolations, click, clickContaining, clickNth, LAPTOP, PHONE, sleep, startApp, waitForText } from './harness.mjs'
import { ids } from './mock-api.mjs'

let app
before(async () => (app = await startApp()))
after(async () => app?.close())

const KARAN = '99999999-9999-4999-8999-999999999999'
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const pad = (n) => String(n).padStart(2, '0')
const monthRange = (y, m) => ({ from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}` })
const [Y, M] = todayIST().split('-').map(Number)
const THIS_MONTH = monthRange(Y, M)
const LAST_MONTH = M === 1 ? monthRange(Y - 1, 12) : monthRange(Y, M - 1)
const Q = Math.floor((M - 1) / 3) * 3 + 1
const THIS_QUARTER = { from: monthRange(Y, Q).from, to: monthRange(Y, Q + 2).to }

const tableNames = (page) => page.$$eval('.sc-table tbody td.sc-name a', (as) => as.map((a) => a.textContent.trim()))
const cardNames = (page) => page.$$eval('ol > li > a', (as) => as.map((a) => a.querySelector('.truncate').textContent.trim()))
const lastCall = (api, path) => api.calls.filter((c) => c.path === path).at(-1)
const noSidewaysScroll = async (page, viewport) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width, 'no sideways scroll')

/** Waits until the latest request to `path` matches. */
async function waitForCall(api, path, check) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const c = lastCall(api, path)
    if (c && check(c)) return c
    await sleep(50)
  }
  assert.fail(`no ${path} call matched; last was ${JSON.stringify(lastCall(api, path))}`)
}

describe('team scorecard', () => {
  test('laptop: a sortable table with the team total and the average rep, no sideways scroll', async () => {
    const { page, go, errors } = await app.open(LAPTOP, { role: 'super_admin' })
    await go('/people?view=scorecard')
    await waitForText(page, 'Average sales rep')
    const text = await page.evaluate(() => document.body.innerText)
    for (const t of ['Team total', 'Deals won', 'Revenue won', 'Conversion', 'Active days', 'Overdue now', 'Download scorecard', 'Conversion = deals won ÷ (deals won + leads marked Not interested or Lost)', 'Active days = days with at least one follow-up'])
      assert.ok(text.includes(t), `shows ${t}`)
    // Most deals won first.
    assert.deepEqual(await tableNames(page), ['Priya Desai', 'Sunil Patil', 'Karan Mehta'])
    assert.equal(await page.$eval('th[aria-sort]', (th) => [th.textContent.trim(), th.getAttribute('aria-sort')].join(':')), 'Deals won:descending')

    await click(page, 'Follow-ups', 'th button')
    assert.deepEqual(await tableNames(page), ['Karan Mehta', 'Sunil Patil', 'Priya Desai'])
    await click(page, 'Follow-ups', 'th button')
    assert.deepEqual(await tableNames(page), ['Priya Desai', 'Sunil Patil', 'Karan Mehta'])
    assert.equal(await page.$eval('th[aria-sort]', (th) => th.getAttribute('aria-sort')), 'ascending')
    // Fewest overdue first.
    await click(page, 'Overdue now', 'th button')
    assert.deepEqual(await tableNames(page), ['Sunil Patil', 'Priya Desai', 'Karan Mehta'])

    await noSidewaysScroll(page, LAPTOP)
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('phone: ranked cards with a sort chooser, no sideways scroll', async () => {
    const { page, go, errors } = await app.open(PHONE, { role: 'moderator' })
    await go('/people?view=scorecard')
    await waitForText(page, 'Ranked by deals won')
    assert.deepEqual(await cardNames(page), ['Priya Desai', 'Sunil Patil', 'Karan Mehta'])
    assert.ok((await page.evaluate(() => document.body.innerText)).includes('Team total'))

    await click(page, 'Deals won', 'button[aria-haspopup=listbox]')
    await click(page, 'Follow-ups', '[role=option]')
    await waitForText(page, 'Ranked by follow-ups')
    assert.deepEqual(await cardNames(page), ['Karan Mehta', 'Sunil Patil', 'Priya Desai'])

    await noSidewaysScroll(page, PHONE)
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('This month by default; Last month, This quarter and a campaign are sent to the server', async () => {
    const { page, go, api } = await app.open(LAPTOP, { role: 'super_admin' })
    await go('/people?view=scorecard')
    await waitForText(page, 'Average sales rep')
    const first = lastCall(api, '/reports/scorecard')
    assert.deepEqual({ from: first.query.from, to: first.query.to }, THIS_MONTH)
    assert.equal(first.query.projectId, undefined)

    await click(page, 'Last month', '[role=radio]')
    await waitForCall(api, '/reports/scorecard', (c) => c.query.from === LAST_MONTH.from && c.query.to === LAST_MONTH.to)
    assert.match(page.url(), /period=last_month/)

    await click(page, 'This quarter', '[role=radio]')
    await waitForCall(api, '/reports/scorecard', (c) => c.query.from === THIS_QUARTER.from && c.query.to === THIS_QUARTER.to)

    await click(page, 'All my campaigns', 'button[aria-haspopup=listbox]')
    await click(page, 'Pune Retail Drive', '[role=option]')
    const c = await waitForCall(api, '/reports/scorecard', (x) => !!x.query.projectId)
    assert.equal(c.query.projectId, ids.online)
    assert.equal(c.query.from, THIS_QUARTER.from)
    await page.close()
  })

  test('Download scorecard saves the file for the chosen dates and campaign', async () => {
    const { page, go, api } = await app.open(LAPTOP, { role: 'super_admin' })
    await go(`/people?view=scorecard&period=last_month&projectId=${ids.online}`)
    await waitForText(page, 'Average sales rep')
    await click(page, 'Download scorecard')
    await waitForText(page, `Saved scorecard_${LAST_MONTH.from}_${LAST_MONTH.to}.csv`)
    const c = lastCall(api, '/exports/scorecard')
    assert.deepEqual(c.query, { ...LAST_MONTH, projectId: ids.online })
    await page.close()
  })

  test('a custom range over 92 days is stopped before asking for the file', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'super_admin' })
    await go('/people?view=scorecard&period=custom&from=2026-01-01&to=2026-06-30')
    await waitForText(page, 'Ranked by deals won')
    assert.deepEqual(lastCall(api, '/reports/scorecard').query, { from: '2026-01-01', to: '2026-06-30' })
    await click(page, 'Download scorecard')
    await waitForText(page, 'A downloaded scorecard can cover at most 92 days.')
    assert.equal(api.calls.filter((c) => c.path === '/exports/scorecard').length, 0)
    await page.close()
  })

  test('tapping a rep opens their review for the same dates', async () => {
    const { page, go } = await app.open(PHONE, { role: 'super_admin' })
    await go('/people?view=scorecard&period=last_month')
    await waitForText(page, 'Ranked by deals won')
    await clickContaining(page, 'Karan Mehta', 'ol > li > a')
    await page.waitForFunction((id) => location.pathname === `/people/${id}/review` && location.search === '?period=last_month', { timeout: 5000 }, KARAN)
    await waitForText(page, 'Performance review')
    await page.close()
  })

  test('the short address and the Overview both lead to it', async () => {
    const { page, go } = await app.open(LAPTOP, { role: 'moderator' })
    await go('/performance/team')
    await page.waitForFunction(() => location.pathname === '/people' && location.search === '?view=scorecard', { timeout: 5000 })
    await go('/dashboard')
    await click(page, 'Team scorecard for the month', 'a')
    await page.waitForFunction(() => location.search === '?view=scorecard', { timeout: 5000 })
    await waitForText(page, 'Average sales rep')
    await page.close()
  })
})

describe('rep review', () => {
  for (const viewport of [PHONE, LAPTOP]) {
    test(`numbers beside the team average, charts and lists @${viewport.width}, no sideways scroll`, async () => {
      const { page, go, api, errors } = await app.open(viewport, { role: 'super_admin' })
      await go(`/people/${ids.priya}/review`)
      await waitForText(page, 'Feedback received')
      const text = await page.evaluate(() => document.body.innerText)
      for (const t of [
        'Priya Desai',
        'Deals won',
        'Revenue won (₹/month)',
        'Target reached',
        '6 of 10 deals',
        'Above the team average 4',
        'Below the team average 46.7',
        'Active days',
        '12 of 13',
        'Trend',
        'Stages reached',
        'Busiest days',
        'Why leads said no',
        'Where leads came from',
        'Plans sold',
        'Growth',
        'Recent wins',
        'Patil Sweets',
        'Great visit notes, keep the photos clear.',
        '5 notes from managers in these dates.',
        'Give feedback',
        'Print / save as PDF',
      ])
        assert.ok(text.includes(t), `shows ${t}`)
      // Fewer overdue than the team reads as good news, in words and colour.
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('.vs-team')].find((e) => e.textContent.includes('team average 2'))?.dataset.tone), 'up')
      assert.deepEqual(lastCall(api, `/reports/people/${ids.priya}/review`).query, THIS_MONTH)
      await noSidewaysScroll(page, viewport)
      assert.deepEqual(errors, [])
      await page.close()
    })
  }

  test('the trend switches measure, and a new period asks again', async () => {
    const { page, go, api } = await app.open(LAPTOP, { role: 'moderator' })
    await go(`/people/${ids.priya}/review`)
    await waitForText(page, 'Feedback received')
    await click(page, 'Visits', '[role=radio], button')
    await waitForText(page, 'Visits per day')
    await click(page, 'Last month', '[role=radio]')
    await waitForCall(api, `/reports/people/${ids.priya}/review`, (c) => c.query.from === LAST_MONTH.from && c.query.to === LAST_MONTH.to)
    await page.close()
  })

  test('Give feedback opens their day; Print opens the print dialog', async () => {
    const { page, go } = await app.open(LAPTOP, { role: 'super_admin' })
    await go(`/people/${ids.priya}/review`)
    await waitForText(page, 'Feedback received')
    await page.evaluate(() => {
      window.printed = 0
      window.print = () => window.printed++
    })
    await click(page, 'Print / save as PDF')
    assert.equal(await page.evaluate(() => window.printed), 1)
    await click(page, 'Give feedback')
    await page.waitForFunction((id) => location.pathname === `/people/${id}/day`, { timeout: 5000 }, ids.priya)
    await page.close()
  })

  test('prints as one clean page without the app around it', async () => {
    const { page, go } = await app.open(LAPTOP, { role: 'super_admin' })
    await go(`/people/${ids.priya}/review`)
    await waitForText(page, 'Feedback received')
    await page.emulateMediaType('print')
    const hidden = await page.evaluate(() => ['nav', 'header', '.no-print'].map((s) => [...document.querySelectorAll(s)].every((e) => getComputedStyle(e).display === 'none')))
    assert.deepEqual(hidden, [true, true, true], 'navigation, top bar and buttons are hidden')
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    const pages = (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
    assert.equal(pages, 1, 'one page')
    await page.close()
  })

  test('reachable from the roster menu, the team list and the person summary', async () => {
    const { page, go } = await app.open(PHONE, { role: 'moderator' })
    await go('/people')
    await waitForText(page, 'Priya Desai')
    await clickNth(page, 'More actions', 0)
    await click(page, 'Performance review', 'button')
    await page.waitForFunction((id) => location.pathname === `/people/${id}/review`, { timeout: 5000 }, ids.priya)

    await go(`/people/${ids.priya}`)
    await click(page, 'Performance review', 'a')
    await page.waitForFunction((id) => location.pathname === `/people/${id}/review`, { timeout: 5000 }, ids.priya)

    await go('/people?view=accounts')
    await waitForText(page, 'Karan Mehta')
    await clickNth(page, 'More actions', 0)
    await click(page, 'Performance review', 'button')
    await page.waitForFunction(() => /\/people\/[^/]+\/review$/.test(location.pathname), { timeout: 5000 })
    await page.close()
  })

  test('a person out of reach shows the message, not an empty review', async () => {
    const { page, go } = await app.open(PHONE, { role: 'moderator' })
    await go(`/people/${ids.modOther}/review`)
    await waitForText(page, 'We couldn’t find this person on your team.')
    await page.close()
  })
})

describe('axe: scorecard and review, light and dark', () => {
  const screens = [
    { name: 'scorecard', path: '/people?view=scorecard', ready: 'Team total' },
    { name: 'review', path: `/people/${ids.priya}/review`, ready: 'Feedback received' },
  ]
  for (const theme of ['light', 'dark'])
    for (const viewport of [PHONE, LAPTOP])
      for (const s of screens)
        test(`${s.name} @${viewport.width} ${theme}`, async () => {
          const { page, go } = await app.open(viewport, { role: 'super_admin' })
          await page.evaluate((t) => localStorage.setItem('st.theme', t), theme)
          await go(s.path)
          await waitForText(page, s.ready)
          assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme)
          await sleep(300)
          assert.deepEqual(await axeViolations(page), [])
          await page.close()
        })
})

// Phone sort sheet, open: the overlay itself must pass too.
test('axe: the sort chooser sheet', async () => {
  const { page, go } = await app.open(PHONE, { role: 'super_admin' })
  await go('/people?view=scorecard')
  await waitForText(page, 'Ranked by deals won')
  await click(page, 'Deals won', 'button[aria-haspopup=listbox]')
  await waitForText(page, 'Revenue won (₹/month)')
  await sleep(500)
  assert.deepEqual(await axeViolations(page), [])
  await page.close()
})
