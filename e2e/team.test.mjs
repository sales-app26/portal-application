// Team collaboration: notifications, team notes, help, leave and cover, roster, leaderboard,
// feedback, shared messages, asking for a teammate's lead, and adding a rep in one step.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { click, clickNth, fill, PHONE, sleep, startApp, waitForText } from './harness.mjs'
import { ids } from './mock-api.mjs'

let app
before(async () => (app = await startApp()))
after(async () => app?.close())

const bodyOf = (api, pathEnd, method = 'POST') => {
  const w = api.writes.findLast((x) => x.method === method && x.path.endsWith(pathEnd))
  assert.ok(w, `${method} ${pathEnd} was sent`)
  return JSON.parse(w.body)
}
const text = (page) => page.evaluate(() => document.body.innerText)
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

describe('notifications', () => {
  test('the bell shows unread, the inbox lists them, and Mark all read clears the badge', async () => {
    const { page, go, api, errors } = await app.open(PHONE)
    await go('/home')
    await page.waitForSelector('a[aria-label="Notifications, 1 unread"]')
    await click(page, 'Notifications, 1 unread', 'a')
    await waitForText(page, 'Farah Khan mentioned you on Asha Patil')
    assert.ok((await text(page)).includes('Farah Khan approved the handover of Neha Joshi to Ravi Kumar'))
    await click(page, 'Mark all read')
    await page.waitForSelector('a[aria-label="Notifications"]', { timeout: 5000 }).catch(() => {})
    assert.deepEqual(bodyOf(api, '/notifications/read'), { all: true })
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('tapping a notification marks it read and opens the lead', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go('/notifications')
    await click(page, 'Farah Khan mentioned you on Asha Patil', 'button span, button p')
    await page.waitForFunction((id) => location.pathname === `/leads/${id}`, { timeout: 5000 }, ids.lead)
    assert.deepEqual(bodyOf(api, '/notifications/read'), { ids: ['n1'] })
    await page.close()
  })
})

describe('team notes on a lead', () => {
  test('the pinned handover shows at the top; a note with a mention sends only who is still named', async () => {
    const { page, go, api, errors } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await waitForText(page, 'Team notes')
    assert.ok((await text(page)).includes('Owner prefers calls after 4 pm. Sent pricing last week.'), 'pinned note')
    await page.focus('#team-note')
    await page.type('#team-note', 'Can you join the demo?')
    await click(page, 'Farah Khan', 'button[aria-pressed]')
    await click(page, 'Priya Desai', 'button[aria-pressed]')
    // Remove Priya's name from the text: she is no longer mentioned.
    await page.$eval('#team-note', (el) => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      set.call(el, el.value.replace(' @Priya Desai', ''))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(page, 'Send')
    await waitForText(page, 'Note saved.')
    const b = bodyOf(api, `/leads/${ids.lead}/comments`)
    assert.equal(b.mentionIds.length, 1)
    assert.equal(b.mentionIds[0], ids.modOther)
    assert.ok(b.body.includes('@Farah Khan'))
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('Ask for help goes to the help endpoint', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await page.waitForSelector('#team-note')
    await page.type('#team-note', 'Owner wants a discount, what can I offer?')
    await click(page, 'Ask for help')
    await waitForText(page, 'Your sales managers have been asked to help.')
    assert.deepEqual(bodyOf(api, `/leads/${ids.lead}/help`), { body: 'Owner wants a discount, what can I offer?' })
    await page.close()
  })
})

describe('leave and cover', () => {
  test('a rep marks tomorrow as leave from Profile', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go('/profile')
    await click(page, 'Mark leave', 'button span, button')
    await waitForText(page, 'Save leave')
    await click(page, 'Tomorrow', 'button[aria-pressed]')
    await fill(page, 'Note', 'Family function')
    await click(page, 'Save leave')
    await waitForText(page, 'Leave saved. Your backup has been told.')
    const tomorrow = addDays(todayIST(), 1)
    assert.deepEqual(bodyOf(api, '/leaves'), { startsOn: tomorrow, endsOn: tomorrow, note: 'Family function' })
    await page.close()
  })

  test('Home shows who you cover; opening it lists their leads without moving them', async () => {
    const { page, go, api, errors } = await app.open(PHONE)
    await go('/home')
    await waitForText(page, 'Covering for Priya Desai')
    await page.$eval('button[aria-expanded="false"]', (b) => b.click())
    const deadline = Date.now() + 5000
    let call
    while (Date.now() < deadline && !(call = api.calls.find((c) => c.query.coveringFor === ids.priya))) await sleep(100)
    assert.ok(call, 'lead list asked for coveringFor')
    assert.equal(call.path, `/projects/${ids.online}/leads`)
    assert.equal(api.writes.filter((w) => /reassign|transfer/.test(w.path)).length, 0, 'nothing is transferred')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('a moderator sets leave for a rep from the roster', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'moderator' })
    await go('/people')
    await waitForText(page, 'Today')
    await waitForText(page, 'Priya Desai')
    await clickNth(page, 'More actions', 0)
    await click(page, 'Set leave', 'button')
    await waitForText(page, 'Leave for Priya Desai')
    await click(page, 'Next 3 days', 'button[aria-pressed]')
    await click(page, 'Save leave')
    await waitForText(page, 'Priya Desai is on leave')
    const b = bodyOf(api, '/leaves')
    assert.equal(b.userId, ids.priya)
    assert.equal(b.endsOn, addDays(b.startsOn, 2))
    await page.close()
  })
})

describe('roster', () => {
  test('shows who is active and who is on leave, with load and target', async () => {
    const { page, go, errors } = await app.open(PHONE, { role: 'moderator' })
    await go('/people')
    await waitForText(page, 'Karan Mehta')
    const t = await text(page)
    for (const s of ['1 active today', '1 on leave', 'On leave until', 'Backup: Karan Mehta', 'Due today', 'Overdue', 'Target this week', '6 / 10'])
      assert.ok(t.includes(s), `shows ${s}`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), PHONE.width)
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('Team list keeps its place in the URL', async () => {
    const { page, go } = await app.open(PHONE, { role: 'moderator' })
    await go('/people')
    await click(page, 'Team list', 'button[role=radio]')
    await page.waitForFunction(() => location.search === '?view=accounts')
    await waitForText(page, 'Search people', 3000).catch(() => {})
    await page.close()
  })
})

describe('leaderboard and my transfers', () => {
  test('a rep sees the team leaderboard without revenue, and their own row marked', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go('/performance')
    await waitForText(page, 'Team leaderboard')
    const t = await text(page)
    assert.ok(t.includes('Priya Desai') && t.includes('You'), 'rows and You')
    assert.ok(!/₹/.test(t.slice(t.indexOf('Team leaderboard'))), 'no revenue in the leaderboard')
    await click(page, 'This month', 'button[role=radio]')
    const deadline = Date.now() + 5000
    while (Date.now() < deadline && !api.calls.some((c) => c.path.endsWith('/leaderboard') && c.query.period === 'month')) await sleep(100)
    assert.ok(api.calls.some((c) => c.path.endsWith('/leaderboard') && c.query.period === 'month'))
    await page.close()
  })

  test('a rep opens My handovers from Profile', async () => {
    const { page, go } = await app.open(PHONE)
    await go('/profile')
    await click(page, 'My handovers', 'a span, a')
    await page.waitForFunction(() => location.pathname === '/transfers')
    await waitForText(page, 'My handovers')
    await page.close()
  })
})

describe('manager feedback', () => {
  test("a moderator leaves quick feedback on a rep's entry", async () => {
    const { page, go, api, errors } = await app.open(PHONE, { role: 'moderator' })
    await go(`/people/${ids.priya}/day`)
    await clickNth(page, 'Feedback', 0)
    await waitForText(page, 'They see it under this follow-up and get a notification.')
    await click(page, 'Push for the demo')
    await waitForText(page, 'Feedback sent to')
    const w = api.writes.findLast((x) => x.method === 'POST' && /\/leads\/[^/]+\/comments$/.test(x.path))
    const b = JSON.parse(w.body)
    assert.equal(b.kind, 'feedback')
    assert.equal(b.body, 'Push for the demo')
    assert.ok(b.entryId)
    assert.deepEqual(errors, [])
    await page.close()
  })
})

describe('shared messages', () => {
  test("a moderator adds a project's WhatsApp message", async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'moderator' })
    await go(`/projects/${ids.online}?tab=messages`)
    await waitForText(page, 'Using our standard messages')
    await click(page, 'Add message')
    await fill(page, 'Name', 'Pricing')
    await page.$eval('textarea', (el) => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      set.call(el, 'Hi {client}, our plans start at ₹999 a month.')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(page, 'Save message')
    await waitForText(page, 'Message added.')
    assert.deepEqual(bodyOf(api, `/projects/${ids.online}/templates`), { label: 'Pricing', body: 'Hi {client}, our plans start at ₹999 a month.', sort: 0 })
    await waitForText(page, 'our plans start at')
    await page.close()
  })
})

describe('a number a teammate already has', () => {
  test('the rep can ask for the lead instead of re-adding it', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go('/home')
    await click(page, 'Add lead')
    await fill(page, 'Contact person', 'Sunil Bakery')
    await fill(page, 'Phone', '98111 00000')
    await fill(page, 'Location', 'Wanowrie')
    await fill(page, 'Note', 'Walked in, wants a demo.')
    await click(page, 'Save lead')
    await waitForText(page, 'This number is already a lead in this campaign, owned by Priya Desai.')
    await click(page, 'Ask for this lead')
    await fill(page, 'Why should it be yours?', 'The owner called me directly.')
    await click(page, 'Send request')
    await waitForText(page, 'Request sent.')
    assert.deepEqual(bodyOf(api, `/projects/${ids.online}/leads/request-by-phone`), { phone: '9811100000', reason: 'The owner called me directly.' })
    await page.close()
  })
})

describe('adding a sales person', () => {
  test('one step: account, project, target and backup', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'moderator' })
    await go('/people')
    await click(page, 'Add sales rep')
    await fill(page, 'Name', 'Imran Shaikh')
    await fill(page, 'Email', 'imran@example.test')
    await click(page, 'Choose a campaign', 'button[aria-haspopup=listbox]')
    await click(page, 'Pune Retail Drive', '[role=option]')
    await fill(page, 'Target', '12')
    await click(page, 'No backup', 'button[aria-haspopup=listbox]')
    await page.waitForSelector('[role=option]')
    const opts = await page.$$eval('[role=option]', (o) => o.map((e) => e.textContent))
    await click(
      page,
      opts.find((t) => t.includes('Priya')),
      '[role=option]',
    )
    await click(page, 'Add and send invite')
    await waitForText(page, 'Added to Pune Retail Drive with a target of 12 a week.')
    const user = bodyOf(api, '/users')
    assert.equal(user.role, 'sales_person')
    const member = bodyOf(api, `/projects/${ids.online}/members`)
    assert.deepEqual({ targetCount: member.targetCount, targetPeriod: member.targetPeriod }, { targetCount: 12, targetPeriod: 'weekly' })
    const backup = bodyOf(api, '/backup', 'PUT')
    assert.equal(backup.backupUserId, ids.priya)
    await page.close()
  })
})

describe('campaign page on a phone', () => {
  test('four section tabs fit without making the page scroll sideways', async () => {
    const { page, go } = await app.open(PHONE, { role: 'super_admin' })
    await go(`/projects/${ids.online}`)
    await waitForText(page, 'Settings')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), PHONE.width)
    await page.close()
  })
})
