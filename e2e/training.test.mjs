// Training in every campaign: a rep's Learn tab (reminder on Home, field card, quiz, video check,
// practice pitch with the AI owner), the manager's Training tab, and the sales head's library.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { click, clickContaining, LAPTOP, PHONE, startApp, waitForText } from './harness.mjs'
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
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

describe('a rep learns', () => {
  test('Home reminds the rep, and Learn is in the bottom bar', async () => {
    const { page, go, errors } = await app.open(PHONE)
    await go('/home')
    await waitForText(page, 'Start your training')
    const hrefs = await page.$$eval('nav[aria-label=Main] a', (as) => as.filter((a) => a.getClientRects().length).map((a) => a.getAttribute('href')))
    assert.deepEqual(hrefs, ['/home', '/leads', '/learn', '/day', '/more'])
    await click(page, 'Start your training', 'a')
    await page.waitForFunction(() => location.pathname === '/learn', { timeout: 4000 })
    await waitForText(page, '0 of 4 done')
    for (const step of ['Watch', 'Practise', 'Prove', 'Field kit']) assert.ok((await text(page)).includes(step), step)
    assert.ok(await noSideScroll(page), 'no sideways scroll on a phone')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('a field card is read and ticked off', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go('/learn/les-card')
    await waitForText(page, 'Discovery')
    await click(page, 'Got it')
    await waitForText(page, 'Read. It stays here for your visits.')
    assert.deepEqual(bodyOf(api, '/training/items/les-card/progress'), { projectId: ids.online, done: true })
    await page.close()
  })

  test('the quiz goes one question at a time and explains every answer', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go('/learn/les-quiz')
    await click(page, 'Start the quiz')
    await waitForText(page, '1 of 2. A shop has 3 branches. Which plan?')
    await click(page, 'Pro', 'button[role=radio]')
    await click(page, 'Next')
    await click(page, 'On your laptop', 'button[role=radio]')
    await click(page, 'Submit')
    await waitForText(page, '50%')
    assert.deepEqual(bodyOf(api, '/training/items/les-quiz/attempts'), { projectId: ids.online, answers: [1, 1] })
    const t = await text(page)
    assert.ok(t.includes('More than one branch means Pro.'), 'explanation shown')
    assert.ok(t.includes('The answer is “On their phone”'), 'the right answer is named')
    assert.ok(t.includes('Passed.'), 'passes at the 50% mark')
    await page.close()
  })

  test('a video with a check is finished by answering it (YouTube blocked: plain embed)', async () => {
    const { page, go, api, errors } = await app.open(PHONE)
    await go('/learn/les-video')
    await waitForText(page, 'Quick check')
    assert.ok(await page.$('iframe[src*="youtube-nocookie.com/embed/aqz-KE-bpKQ"]'), 'falls back to the plain embed')
    await click(page, 'Nothing', 'button[role=radio]')
    await click(page, 'Submit')
    await waitForText(page, 'All right. Lesson done.')
    assert.deepEqual(bodyOf(api, '/training/items/les-video/attempts'), { projectId: ids.online, answers: [0] })
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('a practice pitch: the owner speaks first, the rep replies, and the coach scores it', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go('/learn/les-pitch')
    await waitForText(page, 'Get Ravi to start a free trial.')
    assert.ok((await text(page)).includes('The owner speaks Hinglish.'))
    await click(page, 'Start the pitch')
    await waitForText(page, 'Haan bolo, kya bechne aaye ho?')
    await page.type('#pitch-message', 'Namaste! Mahine ke kitne order Zomato se aate hain?')
    await click(page, 'Send')
    await waitForText(page, 'Zomato pe toh customer already hain.')
    assert.deepEqual(bodyOf(api, '/roleplay/pitch-2/turns'), { message: 'Namaste! Mahine ke kitne order Zomato se aate hain?' })
    await click(page, 'Finish and get my score')
    await waitForText(page, 'Ask for the trial earlier.')
    const t = await text(page)
    assert.ok(t.includes('82'), 'score')
    assert.ok(t.includes('Ask for the trial earlier.'), 'what to do next time')
    assert.ok(await noSideScroll(page))
    await page.close()
  })
})

describe('watching and reading inside the app', () => {
  test('the app tutorial plays module by module, with what’s watched', async () => {
    const { page, go, api, errors } = await app.open(PHONE)
    await go('/learn')
    await waitForText(page, 'How the app works')
    await go('/learn/les-tutorial')
    await waitForText(page, 'Module 1 of 3')
    // YouTube is blocked in tests, so each module falls back to the plain embed.
    await page.waitForSelector('iframe[src*="youtube-nocookie.com/embed/tutorial001"]', { timeout: 5000 })
    const rows = await page.$$eval('section[aria-label=Modules] li', (li) => li.map((x) => x.innerText))
    assert.equal(rows.length, 3)
    assert.ok(rows[1].includes('2 · Getting started'))

    await click(page, 'I’ve watched this module')
    await waitForText(page, 'Module 2 of 3')
    assert.deepEqual(bodyOf(api, '/training/items/les-tutorial/progress'), { projectId: ids.online, moduleId: 'tutorial001', done: true })
    await waitForText(page, '1 of 3 watched')

    await clickContaining(page, '3 · Your storefront', 'section[aria-label=Modules] button')
    await waitForText(page, 'Module 3 of 3')
    await page.waitForSelector('iframe[src*="embed/tutorial003"][src*="autoplay=1"]', { timeout: 5000 })
    assert.ok(await noSideScroll(page), 'no sideways scroll on a phone')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('a PDF reads inside the lesson, page by page, never in a new tab', async () => {
    const { page, go, api, errors } = await app.open(LAPTOP)
    const tabs = (await page.browser().pages()).length
    await go('/learn/les-doc')
    await waitForText(page, 'Page 1 of 2', 15000)
    assert.equal(await page.$$eval('[data-page] canvas', (c) => c.length), 2, 'both pages drawn')
    assert.deepEqual(bodyOf(api, '/training/items/les-doc/progress'), { projectId: ids.online, done: true })

    await click(page, 'Zoom in')
    await waitForText(page, '125%')
    await click(page, 'Full screen')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('section[aria-label="Frostique Sales Playbook.pdf"]')).position === 'fixed', { timeout: 3000 })
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('section[aria-label="Frostique Sales Playbook.pdf"]')).position !== 'fixed', { timeout: 3000 })
    assert.equal((await page.browser().pages()).length, tabs, 'no new tab opened')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('a PDF fits a phone', async () => {
    const { page, go } = await app.open(PHONE)
    await go('/learn/les-doc')
    await waitForText(page, 'Page 1 of 2', 15000)
    assert.ok(await noSideScroll(page), 'no sideways scroll on a phone')
    await page.close()
  })

  test('a Google Doc link shows in a frame, with a way out if a site refuses', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go('/learn/les-link')
    await page.waitForSelector('iframe[src="https://docs.google.com/document/d/1AbCdEfGh/preview"]', { timeout: 5000 })
    assert.ok((await text(page)).includes('Open it in the browser'))
    await page.waitForFunction(() => true)
    assert.deepEqual(bodyOf(api, '/training/items/les-link/progress'), { projectId: ids.online, done: true })
    await page.close()
  })
})

describe('managers and the sales head', () => {
  test('a campaign’s Training tab shows who is certified, and its lessons', async () => {
    const { page, go } = await app.open(LAPTOP, { role: 'moderator' })
    await go(`/projects/${ids.online}?tab=training`)
    await waitForText(page, 'Latest practice pitches')
    let t = await text(page)
    assert.ok(t.includes('Ravi Kumar') && t.includes('Certified'), 'certified rep')
    assert.ok(t.includes('Priya Desai') && t.includes('1/4 lessons'), 'rep still learning')
    await click(page, 'Lessons', 'button')
    await waitForText(page, 'Only in')
    t = await text(page)
    assert.ok(t.includes('Frostique: core sales training'), 'the campaign’s course')
    await page.close()
  })

  test('the sales head finds the library under More, and opens a course', async () => {
    const { page, go } = await app.open(PHONE, { role: 'super_admin' })
    await go('/more')
    await click(page, 'Training library', 'a')
    await waitForText(page, 'Frostique: core sales training')
    assert.ok((await text(page)).includes('Published'))
    await clickContaining(page, 'Frostique: core sales training', 'a')
    await waitForText(page, 'Unpublish')
    for (const lesson of ['The 25-minute visit', 'Frostique in 90 seconds', 'The rep quiz', 'Pitch Ravi: single bakery']) {
      assert.ok((await text(page)).includes(lesson), lesson)
    }
    await page.close()
  })

  test('the sales head rearranges the tutorial’s modules', async () => {
    const { page, go, api } = await app.open(LAPTOP, { role: 'super_admin' })
    await go('/training/courses/course-1')
    await clickContaining(page, 'Frostique app tutorial', 'button')
    await waitForText(page, 'Reps watch them in this order')
    await click(page, 'Move module 3 up')
    await click(page, 'Move module 1 down')
    const order = await page.$$eval('ol[aria-label=Modules] input', (els) => els.map((e) => e.value))
    assert.deepEqual(order, ['3 · Your storefront', '1 · The big picture', '2 · Getting started'])
    await click(page, 'Save lesson')
    await waitForText(page, 'Lesson saved.')
    const body = bodyOf(api, '/training/items/les-tutorial', 'PATCH')
    assert.deepEqual(
      body.payload.items.map((m) => m.youtubeId),
      ['tutorial003', 'tutorial001', 'tutorial002'],
    )
    await page.close()
  })

  test('the sales head adds the app tutorial by pasting only the playlist link', async () => {
    const { page, go, api } = await app.open(LAPTOP, { role: 'super_admin' })
    await go('/training/courses/course-1')
    await waitForText(page, 'Frostique app tutorial')
    await click(page, 'Add lesson')
    await clickContaining(page, 'Paste a YouTube playlist link', '[role=option], button')
    await waitForText(page, 'YouTube playlist link')
    await page.type('input[placeholder="e.g. The 25-minute visit"]', 'Frostique app tutorial')
    await page.type('input[placeholder^="https://www.youtube.com/playlist"]', 'https://www.youtube.com/playlist?list=PLfrostiqueAppTutorial')
    await click(page, 'Save lesson')
    await waitForText(page, 'Lesson added.')
    const body = bodyOf(api, '/training/courses/course-1/items')
    assert.equal(body.kind, 'playlist')
    assert.equal(body.step, 'tutorial')
    assert.deepEqual(body.payload, { url: 'https://www.youtube.com/playlist?list=PLfrostiqueAppTutorial', items: [] })
    await page.close()
  })
})
