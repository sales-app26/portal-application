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
})
