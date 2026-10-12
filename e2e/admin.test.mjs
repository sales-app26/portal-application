// Admin screens (phase 5), run as Super Admin or Moderator against the fake API.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { click, clickNth, fill, LAPTOP, mouseClick, PHONE, sleep, startApp, waitForText } from './harness.mjs'
import { ids } from './mock-api.mjs'

let app
before(async () => (app = await startApp()))
after(async () => app?.close())

const bodyOf = (api, pathEnd, method = 'POST') => {
  const w = api.writes.find((x) => x.method === method && x.path.endsWith(pathEnd))
  assert.ok(w, `${method} ${pathEnd} was sent`)
  return JSON.parse(w.body)
}
const visibleButtons = (page, text) => page.evaluate((t) => [...document.querySelectorAll('button, a')].filter((b) => b.textContent.trim() === t && b.getClientRects().length).length, text)

describe('dashboard', () => {
  test('phone: numbers, targets, logged-nothing list and people; no overflow', async () => {
    const { page, go, errors } = await app.open(PHONE, { role: 'super_admin' })
    await go('/dashboard')
    await waitForText(page, 'Target vs achieved')
    const text = await page.evaluate(() => document.body.innerText)
    for (const t of ['New leads', 'Pending transfers', 'Priya Desai', 'Logged nothing today', 'Karan Mehta', 'Conversions this week', 'Leads by status']) assert.ok(text.includes(t), `shows ${t}`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), PHONE.width)
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('filters: choosing a project and a range is sent to the API', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'moderator' })
    await go('/dashboard')
    await click(page, 'Filters', 'button[aria-label^="Filters"]')
    await click(page, 'Last 7 days')
    await click(page, 'All my projects', 'button[aria-haspopup=listbox]')
    await click(page, 'Pune Retail Drive', '[role=option]')
    await click(page, 'Show results')
    await sleep(500)
    const last = api.calls.filter((c) => c.path === '/dashboard').at(-1)
    assert.equal(last.query.projectId, '11111111-1111-4111-8111-111111111111')
    assert.notEqual(last.query.from, last.query.to, '7-day range')
    await page.close()
  })

  test('export leads downloads the CSV for the current range', async () => {
    const { page, go, api } = await app.open(LAPTOP, { role: 'super_admin' })
    await go('/dashboard')
    await waitForText(page, 'Target vs achieved')
    await mouseClick(page, 'button[aria-label="Export CSV"]')
    await page.waitForSelector('[role=menuitem]')
    await mouseClick(page, '[role=menuitem]')
    await waitForText(page, 'Saved leads_')
    const c = api.calls.find((x) => x.path === '/exports/leads')
    assert.ok(c.query.from && c.query.to)
    await page.close()
  })

  test('an export over 92 days is stopped before asking the server', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'super_admin' })
    await go('/dashboard?from=2026-01-01&to=2026-10-01')
    await waitForText(page, 'Target vs achieved')
    await click(page, 'Export CSV', 'button[aria-label="Export CSV"]')
    await click(page, 'Export leads (CSV)', 'button')
    await waitForText(page, 'An export can cover at most 92 days.')
    assert.equal(api.calls.filter((c) => c.path === '/exports/leads').length, 0)
    await page.close()
  })
})

describe('transfers', () => {
  test('approve sends the decision and clears the pending row and the nav badge', async () => {
    const { page, go, api, errors } = await app.open(PHONE, { role: 'super_admin' })
    await go('/transfers')
    await waitForText(page, 'Karan lives next to the shop.')
    assert.ok(await page.$('nav[aria-label=Main] a[href="/transfers"] .bg-down'), 'badge before')
    await click(page, 'Approve')
    await waitForText(page, 'Transfer approved.')
    await waitForText(page, 'No transfers waiting')
    assert.ok(api.writes.some((w) => w.path === `/transfers/${ids.transfer}/approve`))
    await page.waitForFunction(() => !document.querySelector('nav[aria-label=Main] a[href="/transfers"] .bg-down'), { timeout: 3000 })
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('reject takes an optional reason', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'moderator' })
    await go('/transfers')
    await click(page, 'Reject')
    await waitForText(page, 'Reject transfer')
    await page.waitForSelector('textarea')
    await page.type('textarea', 'Priya keeps this one.')
    await click(page, 'Reject transfer', 'button')
    await waitForText(page, 'Transfer rejected.')
    assert.equal(bodyOf(api, '/reject').note, 'Priya keeps this one.')
    await page.close()
  })
})

describe('people', () => {
  test('super admin adds a moderator with only the needed fields', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'super_admin' })
    await go('/people')
    await waitForText(page, 'Priya Desai')
    await click(page, 'Moderators', 'button[role=radio]')
    await waitForText(page, 'Farah Khan')
    await click(page, 'Add moderator')
    await waitForText(page, 'They get an email to set their password.')
    await fill(page, 'Name', 'Zoya Ali')
    await fill(page, 'Email', 'Zoya@Example.test')
    await click(page, 'Add and send invite')
    await waitForText(page, 'An email has been sent to set the password.')
    const b = bodyOf(api, '/users')
    assert.deepEqual(b, { name: 'Zoya Ali', email: 'zoya@example.test', role: 'moderator' })
    await page.close()
  })

  test('an email that belongs to a deactivated user offers Reactivate', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'moderator' })
    await go('/people')
    await click(page, 'Add sales person')
    await fill(page, 'Name', 'Old Timer')
    await fill(page, 'Email', 'old@example.test')
    await click(page, 'Add and send invite')
    await waitForText(page, 'Reactivate Old Timer')
    await click(page, 'Reactivate Old Timer')
    await waitForText(page, 'User reactivated.')
    assert.ok(api.writes.some((w) => w.path.endsWith('/reactivate')))
    await page.close()
  })

  test('deactivate asks first and names the consequence', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'moderator' })
    await go('/people')
    await waitForText(page, 'Priya Desai')
    await clickNth(page, 'More actions', 0) // Priya's row, the first
    await click(page, 'Deactivate', 'button')
    await waitForText(page, 'Owner inactive')
    assert.equal(api.writes.filter((w) => w.path.endsWith('/deactivate')).length, 0, 'nothing sent yet')
    await click(page, 'Deactivate Priya Desai')
    await waitForText(page, 'User deactivated.')
    await page.close()
  })
})

describe('projects', () => {
  test('moderator sees the projects he was added to; no create or join button', async () => {
    const { page, go } = await app.open(PHONE, { role: 'moderator' })
    await go('/projects')
    await waitForText(page, 'Pune Retail Drive')
    assert.equal(await visibleButtons(page, 'New project'), 0)
    assert.equal(await visibleButtons(page, 'Join a project'), 0)
    await page.close()
  })

  test('super admin creates a project and lands on it', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'super_admin' })
    await go('/projects')
    await click(page, 'New project')
    await fill(page, 'Name', 'New Drive')
    await click(page, 'Create project')
    await waitForText(page, 'Project created.')
    const b = bodyOf(api, '/projects')
    assert.equal(b.name, 'New Drive')
    assert.equal(b.type, 'online')
    assert.match(b.startDate, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(!('endDate' in b) && !('description' in b), 'empty optional fields are left out')
    await page.close()
  })

  test('set and clear a member target; both fields travel together', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'super_admin' })
    await go(`/projects/${ids.online}`)
    await waitForText(page, '10 / week')
    const openTarget = async () => {
      await clickNth(page, 'More actions', 0) // Priya's row
      await click(page, 'Set target', 'button')
      await waitForText(page, 'Save target')
    }
    await openTarget()
    await page.evaluate(() => document.querySelector('input[inputmode=numeric]').select())
    await page.keyboard.type('25')
    await click(page, 'Month', '[role=radio]')
    await click(page, 'Save target')
    await waitForText(page, 'Target updated.')
    assert.deepEqual(bodyOf(api, '/target', 'PATCH'), { targetCount: 25, targetPeriod: 'monthly' })
    await sleep(500)
    await openTarget()
    await page.evaluate(() => document.querySelector('input[inputmode=numeric]').select())
    await page.keyboard.press('Backspace')
    await click(page, 'Save target')
    await sleep(600)
    const last = api.writes.filter((w) => w.path.endsWith('/target')).at(-1)
    assert.deepEqual(JSON.parse(last.body), { targetCount: null, targetPeriod: null })
    await page.close()
  })

  test('moderator sees no Settings tab and cannot remove another moderator', async () => {
    const { page, go } = await app.open(PHONE, { role: 'moderator' })
    await go(`/projects/${ids.online}`)
    await waitForText(page, 'Priya Desai')
    assert.equal(await visibleButtons(page, 'Settings'), 0)
    // Menus: Priya (sales person) offers Remove, Farah (moderator) does not.
    const menus = await page.$$('button[aria-label="More actions"]')
    await menus[1].evaluate((b) => b.click())
    await waitForText(page, 'Set target')
    assert.equal(await visibleButtons(page, 'Remove from project'), 0)
    await page.close()
  })

  test('select leads and reassign them in one action', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'moderator' })
    await go(`/projects/${ids.online}?tab=leads`)
    await waitForText(page, 'Asha Patil')
    await click(page, 'Select to reassign')
    const rows = await page.$$('[role=checkbox]')
    assert.equal(rows.length, 4)
    await rows[0].evaluate((r) => r.click())
    await rows[1].evaluate((r) => r.click())
    await waitForText(page, '2 selected')
    await click(page, 'Reassign 2')
    await waitForText(page, 'Reassign 2 leads')
    await click(page, 'Choose a person', 'button[aria-haspopup=listbox]')
    await click(page, 'PDPriya DesaiSales Person', '[role=option]') // initials + name + role line
    await page.waitForSelector('textarea')
    await page.type('textarea', 'Priya covers this area now.')
    await click(page, 'Reassign', 'button')
    await waitForText(page, '2 leads reassigned.')
    const b = bodyOf(api, '/leads/reassign')
    assert.equal(b.leadIds.length, 2)
    assert.equal(b.toUserId, ids.priya)
    assert.equal(b.reason, 'Priya covers this area now.')
    await page.close()
  })

  test('closing a project asks first and explains what happens', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'super_admin' })
    await go(`/projects/${ids.online}?tab=settings`)
    await click(page, 'Close project', 'button span.text-title-sm') // the row's title, not its subtitle
    await waitForText(page, 'Pending transfers are rejected')
    assert.equal(api.writes.filter((w) => w.path.endsWith('/close')).length, 0)
    await click(page, 'Close project', '[role=dialog] button')
    await waitForText(page, 'Project closed. It is now read-only.')
    await page.close()
  })
})

describe('single lead admin actions', () => {
  const lead = '22222220-2222-4222-8222-222222222222'

  test('admin reassigns one lead through the single endpoint, owner not offered', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'moderator' })
    await go(`/leads/${lead}`)
    await waitForText(page, 'Asha Patil')
    await clickNth(page, 'More actions', 0)
    await click(page, 'Reassign', 'button')
    await waitForText(page, 'Reassign 1 lead')
    await click(page, 'Choose a person', 'button[aria-haspopup=listbox]')
    const options = await page.$$eval('[role=option]', (o) => o.map((e) => e.textContent))
    assert.ok(options.length > 0 && options.every((t) => !t.includes('Ravi')), 'current owner not offered')
    await click(page, options.find((t) => t.includes('Priya')), '[role=option]')
    await page.waitForSelector('textarea')
    await page.type('textarea', 'Moving to the area owner.')
    await click(page, 'Reassign', 'button')
    await waitForText(page, '1 lead reassigned.')
    const w = api.writes.find((x) => x.path === `/leads/${lead}/reassign`)
    assert.deepEqual(JSON.parse(w.body), { toUserId: ids.priya, reason: 'Moving to the area owner.' })
    await page.close()
  })

  test('only the super admin sees Delete lead, and it asks first', async () => {
    let t = await app.open(PHONE, { role: 'moderator' })
    await t.go(`/leads/${lead}`)
    await waitForText(t.page, 'Asha Patil')
    await clickNth(t.page, 'More actions', 0)
    await waitForText(t.page, 'Reassign')
    assert.equal(await visibleButtons(t.page, 'Delete lead'), 0, 'moderator has no delete')
    await t.page.close()

    t = await app.open(PHONE, { role: 'super_admin' })
    await t.go(`/leads/${lead}`)
    await waitForText(t.page, 'Asha Patil')
    await clickNth(t.page, 'More actions', 0)
    await click(t.page, 'Delete lead', 'button')
    await waitForText(t.page, 'its phone number can be added again')
    assert.equal(t.api.writes.filter((w) => w.method === 'DELETE').length, 0, 'nothing sent yet')
    await click(t.page, 'Delete lead', '[role=dialog] button')
    await t.page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 4000 })
    assert.ok(t.api.writes.some((w) => w.method === 'DELETE' && w.path === `/leads/${lead}`))
    await t.page.close()
  })

  test('super admin can delete a history entry; others cannot', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'super_admin' })
    await go(`/leads/${lead}`)
    await waitForText(page, 'Delete entry')
    await click(page, 'Delete entry', 'button')
    await waitForText(page, 'A correct entry has to be logged again.')
    await click(page, 'Delete entry', '[role=dialog] button')
    await waitForText(page, 'Deleted successfully.')
    assert.ok(api.writes.some((w) => w.method === 'DELETE' && w.path.startsWith('/entries/')))
    await page.close()

    const mod = await app.open(PHONE, { role: 'moderator' })
    await mod.go(`/leads/${lead}`)
    await waitForText(mod.page, 'History')
    assert.equal(await visibleButtons(mod.page, 'Delete entry'), 0)
    await mod.page.close()
  })
})

describe('roles and navigation', () => {
  test('super admin gets Dashboard, Projects, People, Transfers in the bar', async () => {
    const { page, go } = await app.open(PHONE, { role: 'super_admin' })
    await go('/')
    await waitForText(page, 'Dashboard')
    // Rail and drawer are in the DOM but hidden on a phone: only the visible bar counts.
    const hrefs = await page.$$eval('nav[aria-label=Main] a', (as) => as.filter((a) => a.getClientRects().length).map((a) => a.getAttribute('href')))
    assert.deepEqual(hrefs, ['/dashboard', '/projects', '/people', '/transfers', '/more'])
    await page.close()
  })

  test('a sales person is sent home from admin screens', async () => {
    const { page, go } = await app.open(PHONE, { role: 'sales_person' })
    await go('/dashboard')
    await page.waitForFunction(() => location.pathname === '/home', { timeout: 4000 })
    await page.close()
  })
})
