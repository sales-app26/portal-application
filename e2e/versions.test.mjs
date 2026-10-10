// Release notes: the once-only dialog, the history page, and the Super Admin's manager.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { click, fill, LAPTOP, PHONE, sleep, startApp, waitForText } from './harness.mjs'

let app
before(async () => (app = await startApp()))
after(async () => app?.close())

const seenWrites = (api) => api.writes.filter((w) => w.method === 'POST' && /\/versions\/[^/]+\/seen$/.test(w.path))

describe('what’s new dialog', () => {
  test('shows the live note once, records it as read, and stays closed after a reload', async () => {
    const { page, go, api, errors } = await app.open(PHONE, { role: 'sales_person', unreadRelease: true })
    await go('/home')
    await waitForText(page, 'Faster lead import')
    const text = await page.evaluate(() => document.body.innerText)
    assert.ok(text.includes('Version 1.1.0'), 'shows the number')
    assert.ok(text.includes('Import a CSV of leads in one go'), 'renders the note')

    await click(page, 'Got it')
    // The sheet slides out before it leaves the page.
    await page.waitForFunction(() => !document.body.innerText.includes('Import a CSV of leads in one go'), { timeout: 3000 })
    assert.equal(seenWrites(api).length, 1, 'the read is recorded once')

    await page.reload({ waitUntil: 'networkidle0' })
    await sleep(800)
    assert.equal(await page.evaluate(() => location.pathname), '/home')
    assert.ok(!(await page.evaluate(() => document.body.innerText)).includes('Import a CSV of leads in one go'), 'not shown again')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('See all updates opens the history, with the older release listed', async () => {
    const { page, go } = await app.open(PHONE, { role: 'sales_person', unreadRelease: true })
    await go('/home')
    await waitForText(page, 'Faster lead import')
    await click(page, 'See all updates')
    await waitForText(page, 'You’re on version 1.1.0')
    const text = await page.evaluate(() => document.body.innerText)
    assert.ok(text.includes('1.0.0') && text.includes('First release'), 'lists 1.0.0')
    await page.close()
  })

  test('the profile links to it and flags an unread release', async () => {
    const { page, go } = await app.open(PHONE, { role: 'moderator', unreadRelease: true })
    await go('/profile')
    await waitForText(page, 'Faster lead import')
    const isNew = () => page.evaluate(() => [...document.querySelectorAll('a[href="/whats-new"] span')].some((el) => el.textContent === 'New'))
    assert.ok(await isNew(), 'the row is flagged while the note is unread')
    await click(page, 'Got it')
    await page.waitForFunction(() => !document.body.innerText.includes('Import a CSV of leads in one go'), { timeout: 3000 })
    assert.ok(!(await isNew()), 'and unflagged once it has been read')
    await page.close()
  })
})

describe('version manager', () => {
  test('Super Admin sees every release, with its read count, and adds a new one', async () => {
    const { page, go, api, errors } = await app.open(LAPTOP, { role: 'super_admin' })
    await go('/versions')
    await waitForText(page, 'Versions')
    await waitForText(page, '1.0.0')
    const text = await page.evaluate(() => document.body.innerText)
    for (const t of ['1.1.0', 'Faster lead import', 'Live', 'Quiet', 'read']) assert.ok(text.includes(t), `shows ${t}`)

    await click(page, 'New release')
    await page.waitForSelector('#version-form')
    await fill(page, 'Version', '1.2.0')
    await fill(page, 'Release note', '## Added\n- Something new')
    await click(page, 'Save release')
    await sleep(500)
    const w = api.writes.find((x) => x.method === 'POST' && x.path === '/versions')
    assert.ok(w, 'POST /versions was sent')
    assert.match(w.contentType ?? '', /multipart\/form-data/)
    assert.ok(w.body.includes('1.2.0') && w.body.includes('Something new'))
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('a malformed version is stopped on the form', async () => {
    const { page, go, api } = await app.open(LAPTOP, { role: 'super_admin' })
    await go('/versions')
    await waitForText(page, '1.0.0')
    await click(page, 'New release')
    await page.waitForSelector('#version-form')
    await fill(page, 'Version', '1.2')
    await click(page, 'Save release')
    await waitForText(page, 'three numbers separated by dots')
    assert.equal(api.writes.filter((x) => x.path === '/versions').length, 0, 'nothing sent')
    await page.close()
  })

  test('a moderator cannot open it', async () => {
    const { page, go } = await app.open(PHONE, { role: 'moderator' })
    await go('/versions')
    await sleep(500)
    assert.notEqual(await page.evaluate(() => location.pathname), '/versions')
    await page.close()
  })
})
