// Calls next to visits: how a call is logged, its recording, times on follow-ups, Field or Calling, reminders.
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { click, fill, PHONE, sleep, startApp, waitForText } from './harness.mjs'
import { ids } from './mock-api.mjs'

let app
before(async () => {
  app = await startApp()
})
after(async () => {
  await app.close()
})

const recordingFile = join(mkdtempSync(join(tmpdir(), 'st-call-')), 'call-with-owner.m4a')
writeFileSync(recordingFile, Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(64)]))

const radios = (page) => page.evaluate(() => [...document.querySelectorAll('button[role=radio]')].map((b) => b.textContent.trim()))
const hasText = (page, text) => page.evaluate((t) => document.body.innerText.includes(t), text)
const lastFollowUp = (api) => api.writes.filter((w) => w.path.endsWith('/follow-ups')).at(-1)
const json = (write) => (typeof write.body === 'string' ? JSON.parse(write.body) : write.body)

describe('logging a call', () => {
  test('no answer takes two taps, saves a note by itself, and sends no status', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await waitForText(page, 'How did the call go?')
    assert.equal(await hasText(page, 'Status'), false, 'no stage to pick before the outcome')
    await click(page, 'No answer', 'button[role=radio]')
    await waitForText(page, 'it comes up again tomorrow')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Follow-up saved')

    const body = json(lastFollowUp(api))
    assert.equal(body.channel, 'call')
    assert.equal(body.callOutcome, 'no_answer')
    assert.equal(body.note, 'No answer')
    assert.equal(body.status, undefined)
    await page.close()
  })

  test('a call you spoke on needs the recording, and sends it', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Spoke', 'button[role=radio]')
    await waitForText(page, 'Add recording')
    await fill(page, 'Note', 'Owner wants a demo next week')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Add the call recording to save a call you spoke on.')
    assert.equal(lastFollowUp(api), undefined, 'nothing sent without it')

    const input = await page.$('input[type=file]')
    await input.uploadFile(recordingFile)
    await waitForText(page, 'call-with-owner.m4a')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Save this follow-up?')
    await click(page, 'Save follow-up', '[role=alertdialog] button, [role=dialog] button')
    await waitForText(page, 'Follow-up saved')
    const sent = String(lastFollowUp(api).body)
    assert.match(sent, /name="recording"; filename="call-with-owner.m4a"/)
    assert.match(sent, /name="callOutcome"\r\n\r\nspoke/)
    await page.close()
  })

  test('tapping Call and coming back opens the form on a call', async () => {
    const { page, go } = await app.open(PHONE)
    await go(`/leads/${ids.d2dLead}?log=call`)
    await waitForText(page, 'How did the call go?')
    await page.close()
  })
})

describe('listening back', () => {
  test('a call shows how it went, and the recording loads only when asked for', async () => {
    const { page, go } = await app.open(PHONE)
    await go('/day')
    await waitForText(page, 'Call · Spoke')
    assert.equal(await page.$('audio'), null)
    await click(page, 'Play recording')
    await page.waitForSelector('audio')
    await page.close()
  })
})

describe('who logs what', () => {
  test('door to door, a field rep starts on the visit photo and can switch to a call', async () => {
    const { page, go } = await app.open(PHONE)
    await go(`/leads/${ids.d2dLead}`)
    await click(page, 'Log follow-up')
    await page.waitForSelector('button[role=radio]')
    assert.ok((await radios(page)).includes('Visit'))
    assert.equal(await hasText(page, 'How did the call go?'), false)
    await click(page, 'Call', 'button[role=radio]')
    await waitForText(page, 'How did the call go?')
    await page.close()
  })

  test('someone set up for calling gets no visit at all', async () => {
    const { page, go } = await app.open(PHONE, { workType: 'calling' })
    await go(`/leads/${ids.d2dLead}`)
    await click(page, 'Log follow-up')
    await waitForText(page, 'How did the call go?')
    assert.equal((await radios(page)).includes('Visit'), false)
    await page.close()
  })
})

describe('the time on a follow-up', () => {
  test('appears once there is a date, and is sent with it', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Busy', 'button[role=radio]')
    assert.equal(await hasText(page, 'You get a reminder at this time.'), false)
    await click(page, 'Tomorrow')
    await waitForText(page, 'You get a reminder at this time.')
    await page.evaluate(() => {
      const el = document.querySelector('input[type=time]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '16:00')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(page, 'Save follow-up')
    await waitForText(page, 'Follow-up saved')
    const body = json(lastFollowUp(api))
    assert.equal(body.nextFollowUpTime, '16:00')
    assert.equal(body.nextFollowUpChannel, 'call')
    await page.close()
  })
})

describe('the next step after a call', () => {
  test('defaults to another call, even for a field rep', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go(`/leads/${ids.d2dLead}?log=call`)
    await waitForText(page, 'How did the call go?')
    await click(page, 'No answer', 'button[role=radio]')
    await click(page, 'Tomorrow')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Follow-up saved')
    assert.equal(json(lastFollowUp(api)).nextFollowUpChannel, 'call')
    await page.close()
  })
})

describe('Field or Calling', () => {
  test('is picked when adding a person, and sent', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'super_admin' })
    await go('/people?view=accounts')
    await waitForText(page, 'Priya Desai')
    await click(page, 'Add sales rep')
    await fill(page, 'Name', 'Cara Dsouza')
    await fill(page, 'Email', 'cara@example.test')
    await click(page, 'Field', '[role=dialog] button')
    await click(page, 'Calling', '[role=option]')
    await click(page, 'Add and send invite')
    await waitForText(page, 'Added to the team')
    const sent = api.writes.filter((w) => w.path === '/users').at(-1)
    assert.equal(json(sent).workType, 'calling')
    await page.close()
  })
})

describe('reminders on this phone', () => {
  test('Home offers once; Not now stays gone; Profile always has the switch', async () => {
    const { page, go } = await app.open(PHONE, { pushKey: 'BPublicKeyForTheTests' })
    await go('/home')
    await waitForText(page, 'Never miss a callback')
    await click(page, 'Not now')
    assert.equal(await hasText(page, 'Never miss a callback'), false)
    await go('/home')
    await sleep(400)
    assert.equal(await hasText(page, 'Never miss a callback'), false)
    await go('/profile')
    await waitForText(page, 'Follow-up reminders')
    await page.close()
  })

  test('nothing is offered when push isn’t set up on the server', async () => {
    const { page, go } = await app.open(PHONE)
    await go('/home')
    await sleep(400)
    assert.equal(await hasText(page, 'Never miss a callback'), false)
    await go('/profile')
    await sleep(400)
    assert.equal(await hasText(page, 'Follow-up reminders'), false)
    await page.close()
  })
})
