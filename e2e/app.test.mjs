// Browser tests against a fake API: node --test e2e/   (or npm run test:e2e)
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { tap, click, fill, LAPTOP, PHONE, sleep, startApp, waitForText, clickContaining } from './harness.mjs'
import { ids } from './mock-api.mjs'

/** Save follow-up asks for a last look first; the confirmation's own button saves. */
async function confirmSave(page) {
  await waitForText(page, 'Save this follow-up?')
  await click(page, 'Save follow-up')
}

let app
before(async () => (app = await startApp()))
after(async () => app?.close())

describe('sign in', () => {
  test('phone: Sign in button sits at the bottom of the screen', async () => {
    const { page, go, errors } = await app.open(PHONE, { signedIn: false })
    await go('/login')
    const box = await (await page.waitForSelector('button[type=submit]')).boundingBox()
    assert.ok(PHONE.height - (box.y + box.height) < 80, `button bottom at ${box.y + box.height}, viewport ${PHONE.height}`)
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('laptop: sign in is a centred card, button right under the fields', async () => {
    const { page, go } = await app.open(LAPTOP, { signedIn: false })
    await go('/login')
    const box = await (await page.waitForSelector('button[type=submit]')).boundingBox()
    assert.ok(box.y < LAPTOP.height - 150, 'button should not be pinned to the window bottom')
    assert.ok(box.x > 300, 'card is centred')
    await page.close()
  })
})

describe('sign out', () => {
  test('log out from Profile lands on the sign-in page, not a blank screen', async () => {
    const { page, go, errors } = await app.open(PHONE)
    await go('/profile')
    await click(page, 'Log out')
    await click(page, 'Log out', '[role=dialog] button')
    await waitForText(page, 'Your leads, follow-ups and visits in one place.')
    await sleep(300)
    assert.equal(await page.evaluate(() => location.pathname + location.search), '/login')
    assert.deepEqual(errors, [])
    await page.close()
  })
})

describe('field work', () => {
  test('home fits the phone width and shows the bottom bar', async () => {
    const { page, go, errors } = await app.open(PHONE)
    await go('/home')
    await waitForText(page, 'Due today')
    const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
    assert.equal(scrollW, innerW, 'no horizontal overflow')
    assert.ok(await page.$('nav[aria-label=Main] a[href="/leads"]'))
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('log a follow-up on an online lead sends JSON with a request id', async () => {
    const { page, go, api, errors } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Interested', '[role=radio]') // status chips: one tap
    await fill(page, 'Note', 'Called back, wants a demo next week.')
    await click(page, 'Save follow-up')
    await confirmSave(page)
    await waitForText(page, 'Follow-up saved.')
    const w = api.writes.find((x) => x.path.endsWith('/follow-ups'))
    assert.ok(w, 'follow-up was posted')
    assert.match(w.contentType, /application\/json/)
    const body = JSON.parse(w.body)
    assert.equal(body.status, 'interested')
    assert.equal(body.location, 'Wanowrie')
    assert.match(body.clientRequestId, /^[0-9a-f-]{36}$/)
    // The sheet is gone and the page takes taps again.
    await sleep(500)
    assert.equal(await page.evaluate(() => document.body.style.pointerEvents), '')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('note shorter than 5 characters is stopped before saving', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Contacted', '[role=radio]')
    await fill(page, 'Note', 'ok')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Write at least 5 characters.')
    assert.ok(!(await page.evaluate(() => document.body.innerText.includes('Save this follow-up?'))), 'no confirmation for a form with mistakes')
    assert.equal(api.writes.filter((x) => x.path.endsWith('/follow-ups')).length, 0)
    await page.close()
  })
})

describe('deals, reasons and the agenda', () => {
  test('converting asks for the deal: the expected plan and price carry over, the price is sent as a number', async () => {
    const { page, go, api, errors } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Won', '[role=radio]')
    await waitForText(page, 'Mark as won')
    const value = await page.$('input[inputmode=numeric]')
    await value.evaluate((el) => (el.scrollIntoView({ block: 'center' }), el.focus(), el.select()))
    await page.keyboard.type('3,999') // replaces the prefilled expected value
    await waitForText(page, 'Client pays ₹3,999 for 1 month')
    await fill(page, 'Note', 'Signed up today, wants onboarding.')
    await click(page, 'Save follow-up')
    await confirmSave(page)
    await waitForText(page, 'Won!')
    const body = JSON.parse(api.writes.find((x) => x.path.endsWith('/follow-ups')).body)
    assert.equal(body.status, 'converted')
    assert.equal(body.dealValue, 3999)
    assert.equal(body.planCode, 'growth', 'the expected plan carries over')
    assert.equal(body.plan, undefined, 'no free-text plan any more')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('lost asks why, and the reason is sent; other statuses send no reason or deal', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Lost', '[role=radio]')
    await click(page, 'Price too high', '[role=radio]')
    await fill(page, 'Note', 'Went with a cheaper option.')
    await click(page, 'Save follow-up')
    await confirmSave(page)
    await waitForText(page, 'Follow-up saved.')
    const body = JSON.parse(api.writes.find((x) => x.path.endsWith('/follow-ups')).body)
    assert.equal(body.reason, 'price')
    assert.equal(body.dealValue, undefined)
    assert.equal(body.planCode, undefined)
    await page.close()
  })

  test('home agenda: counts from /me/agenda, and each chip loads its list', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go('/home')
    await waitForText(page, 'Going cold')
    await clickContaining(page, 'Tomorrow', '[role=radio]')
    await sleep(400)
    assert.equal(api.calls.filter((c) => c.path.endsWith('/leads')).at(-1).query.due, 'tomorrow')
    await clickContaining(page, 'Going cold', '[role=radio]')
    await sleep(400)
    const cold = api.calls.filter((c) => c.path.endsWith('/leads')).at(-1).query
    assert.equal(cold.cold, 'true')
    assert.equal(cold.sort, 'activity')
    await page.close()
  })
})

describe('visit proof (door-to-door)', () => {
  test('log follow-up with a live photo, tapped like a finger, saves photo and location', async () => {
    const { page, go, api, errors } = await app.open(PHONE, { projectId: ids.d2d })
    await go(`/leads/${ids.d2dLead}`)
    await tap(page, 'button', 'Log follow-up')
    await waitForText(page, 'Save follow-up')
    await tap(page, 'button > span > span.text-title-sm', 'Take photo')
    await tap(page, 'button[aria-label="Take photo"]')
    await tap(page, 'button', 'Use photo')
    await waitForText(page, 'Photo taken')
    assert.ok(!(await page.evaluate(() => document.body.innerText.includes('Discard what you typed?'))), 'the sheet stayed quiet')
    await fill(page, 'Note', 'Met the owner at the counter, wants pricing.')
    await tap(page, 'button', 'Save follow-up')
    await waitForText(page, 'Visit photo attached')
    await tap(page, 'button', 'Save follow-up') // the confirmation's button, a real finger again
    await waitForText(page, 'Follow-up saved.')
    const w = api.writes.find((x) => x.path === `/leads/${ids.d2dLead}/follow-ups`)
    assert.ok(w, 'follow-up was posted')
    assert.match(w.contentType, /multipart\/form-data/)
    for (const field of ['photo', 'latitude', 'longitude', 'gpsAccuracyM', 'captureToken', 'note']) assert.ok(w.body.includes(`name="${field}"`), `multipart has ${field}`)
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('closing the camera with a tap leaves the follow-up form open', async () => {
    const { page, go } = await app.open(PHONE, { projectId: ids.d2d })
    await go(`/leads/${ids.d2dLead}`)
    await tap(page, 'button', 'Log follow-up')
    await tap(page, 'button > span > span.text-title-sm', 'Take photo')
    await tap(page, 'button[aria-label="Close camera"]')
    await page.waitForFunction(() => !document.querySelector('[aria-label="Visit photo"]'), { timeout: 3000 })
    await sleep(400)
    const text = await page.evaluate(() => document.body.innerText)
    assert.ok(text.includes('Save follow-up'), 'form still open')
    assert.ok(!text.includes('Discard what you typed?'), 'no discard prompt')
    await page.close()
  })

  test('add lead with a live photo sends multipart with photo, GPS and capture token', async () => {
    const { page, go, api, errors } = await app.open(PHONE, { projectId: ids.d2d })
    await go('/home')
    await click(page, 'Add lead')
    // Real taps: the camera sits outside the sheet, and must still take a finger.
    await tap(page, 'button > span > span.text-title-sm', 'Take photo')
    // Shutter enables once the fake camera and the fixed GPS position are ready.
    await tap(page, 'button[aria-label="Take photo"]')
    await tap(page, 'button', 'Use photo')
    await waitForText(page, 'Photo taken')
    await waitForText(page, '± 12 m')
    await fill(page, 'Contact person', 'New Client')
    await fill(page, 'Phone', '98765 43210')
    await fill(page, 'Location', 'Kondhwa')
    await fill(page, 'Note', 'Shop owner keen, follow up Monday.')
    await click(page, 'Save lead')
    await waitForText(page, 'Lead saved.')
    const w = api.writes.find((x) => x.path === `/projects/${ids.d2d}/leads`)
    assert.ok(w, 'lead was posted')
    assert.match(w.contentType, /multipart\/form-data/)
    assert.ok(w.body, 'request body captured')
    for (const field of ['photo', 'latitude', 'longitude', 'gpsAccuracyM', 'captureToken', 'clientRequestId', 'phone'])
      assert.ok(w.body.includes(`name="${field}"`), `multipart has ${field}`)
    assert.match(w.body, /name="phone"\r\n\r\n9876543210/)
    assert.match(w.body, /name="photo"; filename="visit.jpg"\r\nContent-Type: image\/jpeg/)
    assert.ok(
      api.writes.some((x) => x.path === '/visits/capture-token'),
      'capture token requested',
    )
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('closing the camera or a picker leaves the form open and untouched', async () => {
    const { page, go } = await app.open(PHONE, { projectId: ids.d2d })
    await go('/home')
    await click(page, 'Add lead')
    await click(page, 'Interested', '[role=radio]') // Add lead starts as New; a chip changes it in place
    await sleep(400)
    assert.ok(await page.evaluate(() => document.body.innerText.includes('Save lead')), 'form still open')
    await click(page, 'Take photo', 'button > span > span.text-title-sm')
    await page.waitForSelector('button[aria-label="Take photo"]:not([disabled])', { timeout: 10000 })
    await click(page, 'Take photo', 'button[aria-label="Take photo"]')
    await click(page, 'Use photo')
    await waitForText(page, 'Photo taken')
    await sleep(400)
    const text = await page.evaluate(() => document.body.innerText)
    assert.ok(!text.includes('Discard what you typed?'), 'no discard prompt')
    assert.ok(text.includes('Save lead'), 'form still open')
    await page.close()
  })

  test('device Back closes the open sheet, not the page', async () => {
    const { page, go } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await waitForText(page, 'Save follow-up')
    await page.evaluate(() => history.back()) // what the Android back button does
    await page.waitForFunction(() => !document.body.innerText.includes('Save follow-up'), { timeout: 3000 })
    assert.equal(await page.evaluate(() => location.pathname), `/leads/${ids.lead}`)
    await page.close()
  })

  test('low GPS accuracy is accepted and flagged', async () => {
    const { page, go } = await app.open(PHONE, { projectId: ids.d2d, gps: { latitude: 18.49, longitude: 73.89, accuracy: 180 } })
    await go('/home')
    await click(page, 'Add lead')
    await click(page, 'Take photo', 'button > span > span.text-title-sm')
    await waitForText(page, 'Approximate', 10000) // the camera's location pill
    await page.close()
  })

  test('save without a photo is blocked in a door-to-door project', async () => {
    const { page, go, api } = await app.open(PHONE, { projectId: ids.d2d })
    await go('/home')
    await click(page, 'Add lead')
    await fill(page, 'Contact person', 'No Photo')
    await fill(page, 'Phone', '9876543211')
    await fill(page, 'Location', 'Kondhwa')
    await fill(page, 'Note', 'Trying to save without a photo.')
    await click(page, 'Save lead')
    await waitForText(page, 'Take a photo of the visit to save it.')
    assert.equal(api.writes.filter((x) => x.path.endsWith('/leads')).length, 0)
    await page.close()
  })
})

describe('pull to refresh', () => {
  const pull = async (page, from, to) => {
    await page.touchscreen.touchStart(195, from)
    for (let y = from; y <= to; y += 20) await page.touchscreen.touchMove(195, y)
    await page.touchscreen.touchEnd()
  }

  test('pulling down from the top refetches what is on screen', async () => {
    const { page, go, api, errors } = await app.open(PHONE)
    await go('/home')
    await waitForText(page, 'Due today')
    const before = api.calls.filter((c) => c.path === '/me/home').length
    await pull(page, 120, 420)
    await page.waitForSelector('[aria-label="Refreshing"]', { timeout: 2000 })
    await page.waitForFunction(() => !document.querySelector('[aria-label="Refreshing"]'), { timeout: 4000 })
    assert.ok(api.calls.filter((c) => c.path === '/me/home').length > before, 'home data was requested again')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('a short pull does nothing', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go('/home')
    await waitForText(page, 'Due today')
    const before = api.calls.length
    await pull(page, 120, 180)
    await sleep(400)
    assert.equal(api.calls.length, before)
    assert.equal(await page.$('[aria-label="Refreshing"]'), null)
    await page.close()
  })

  test('an open sheet is not pulled', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await waitForText(page, 'Save follow-up')
    await sleep(400)
    const before = api.calls.length
    await pull(page, 300, 600)
    await sleep(500)
    assert.equal(api.calls.length, before, 'no refetch while a form is open')
    await page.close()
  })
})

describe('navigating right after a sheet closes', () => {
  test('saving a lead lands on that lead, and one Back goes to where you were', async () => {
    const { page, go, errors } = await app.open(PHONE)
    await go('/home')
    await click(page, 'Add lead')
    await fill(page, 'Contact person', 'New Client')
    await fill(page, 'Phone', '98765 43210')
    await fill(page, 'Location', 'Kondhwa')
    await fill(page, 'Note', 'Keen to start next month.')
    await click(page, 'Save lead')
    await page.waitForFunction(() => location.pathname === '/leads/55555555-5555-4555-8555-555555555555', { timeout: 5000 })
    await page.evaluate(() => history.back())
    await page.waitForFunction(() => location.pathname === '/home', { timeout: 3000 })
    assert.deepEqual(errors, [])
    await page.close()
  })
})

describe('timelines and maps', () => {
  test('My day lists the day in order with numbered visit pins and photo thumbnails', async () => {
    const { page, go, errors } = await app.open(PHONE)
    await go('/day')
    await waitForText(page, 'Phone call, asked for a quote.')
    const text = await page.evaluate(() => document.body.innerText)
    assert.ok(text.includes('3 follow-ups') && text.includes('2 visits'), 'summary line')
    assert.ok(text.indexOf('Phone call') < text.indexOf('Second visit'), 'oldest first')
    assert.equal((await page.$$('[aria-label="Open visit photo"]')).length, 2)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), PHONE.width, 'no horizontal overflow')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('tapping a thumbnail opens the photo viewer with GPS details, and Back closes it', async () => {
    const { page, go, errors } = await app.open(PHONE)
    await go('/day')
    await click(page, 'Open visit photo')
    await waitForText(page, '18.50000, 73.90000') // the last visit of the day was opened
    await waitForText(page, 'Taken at 18.50000, 73.90000') // no place name known: the position itself
    await waitForText(page, 'Open map')
    await page.evaluate(() => history.back())
    await page.waitForFunction(() => !document.querySelector('[aria-label="Visit photo"]'), { timeout: 3000 })
    assert.equal(await page.evaluate(() => location.pathname), '/day')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('phone: Map opens a sheet with numbered pins, an accuracy circle and the OSM credit', async () => {
    const { page, go, errors } = await app.open(PHONE)
    await go('/day')
    await click(page, 'Map')
    await page.waitForSelector('.leaflet-container .map-pin', { timeout: 8000 })
    assert.equal((await page.$$('.map-pin')).length, 2)
    assert.equal((await page.$$('.leaflet-overlay-pane path')).length, 2, 'accuracy circles')
    assert.ok(await page.evaluate(() => document.querySelector('.leaflet-control-attribution')?.textContent.includes('OpenStreetMap')), 'attribution visible')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('laptop: map sits beside the list and selecting an entry highlights its pin', async () => {
    const { page, go } = await app.open(LAPTOP)
    await go('/day')
    await page.waitForSelector('.leaflet-container .map-pin', { timeout: 8000 })
    await page.hover('[data-entry-id="33333332-3333-4333-8333-333333333333"]')
    await page.waitForSelector('.map-pin-selected', { timeout: 3000 })
    await page.close()
  })

  test('editable entry can be edited; locked ones offer no Edit', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go('/day')
    // 3 editable entries, the status change is locked.
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Edit').length), 3)
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Edit').click())
    await waitForText(page, 'Edit follow-up')
    await page.waitForSelector('textarea')
    await page.evaluate(() => document.querySelector('textarea').select())
    await page.keyboard.type('Updated: owner wants a demo on Monday.')
    await click(page, 'Save changes')
    await waitForText(page, 'Changes saved.')
    const w = api.writes.find((x) => x.method === 'PATCH' && x.path.startsWith('/entries/'))
    assert.ok(w, 'patched')
    assert.deepEqual(Object.keys(JSON.parse(w.body)), ['note'], 'only changed fields are sent')
    await page.close()
  })

  test('/entries/:id shows the entry with its photo and a mini map', async () => {
    const { page, go, errors } = await app.open(PHONE)
    await go('/entries/33333332-3333-4333-8333-333333333333')
    await waitForText(page, 'Visited the shop, owner present.')
    await page.waitForSelector('.leaflet-container .map-pin', { timeout: 8000 })
    assert.ok(await page.$('[aria-label="Open visit photo"]'))
    assert.deepEqual(errors, [])
    await page.close()
  })
})

describe('speaking a note', () => {
  // Like iPhone: words come through as "not final yet", and Stop never gets an "ended" back.
  const fakeIphoneMic = () => {
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() {
        window.__mic = this
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'owner wants a demo on friday' }], { isFinal: false })] }), 50)
      }
      stop() {}
      abort() {}
    }
  }

  test('tap to stop always stops, and keeps the words heard', async () => {
    const { page, go, errors } = await app.open(PHONE)
    await page.evaluateOnNewDocument(fakeIphoneMic)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Speak')
    await waitForText(page, '“owner wants a demo on friday”')
    await click(page, 'Listening… tap to stop')
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Speak'), { timeout: 2000 })
    assert.ok((await page.$eval('textarea[name=note]', (t) => t.value)).includes('owner wants a demo on friday'))
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('a blocked microphone says what to do', async () => {
    const { page, go } = await app.open(PHONE)
    await page.evaluateOnNewDocument(() => {
      window.SpeechRecognition = window.webkitSpeechRecognition = class {
        start() {
          setTimeout(() => this.onerror?.({ error: 'not-allowed' }), 50)
        }
        stop() {}
      }
    })
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Speak')
    await waitForText(page, 'Allow the microphone for Pronttera')
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Speak'), { timeout: 2000 })
    await page.close()
  })
})

describe('iPad', () => {
  const IPAD = { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
  const drag = async (page, x, from, to) => {
    await page.touchscreen.touchStart(x, from)
    for (let y = from; y <= to; y += 25) await page.touchscreen.touchMove(x, y)
    await page.touchscreen.touchEnd()
  }

  test('the Add lead sheet stays put when dragged', async () => {
    const { page, go } = await app.open(IPAD)
    await page.setUserAgent(IPAD_UA)
    await go('/home')
    await click(page, 'Add lead')
    await waitForText(page, 'Save lead')
    await sleep(600)
    const title = await page.$$eval('[role=dialog] h2', (h) =>
      h
        .map((e) => e.getBoundingClientRect())
        .find((r) => r.height)
        ?.toJSON(),
    )
    await drag(page, 410, title.y + 10, title.y + 600)
    await sleep(800)
    const text = await page.evaluate(() => document.body.innerText)
    assert.ok(text.includes('Save lead'), 'sheet still open')
    assert.ok(!text.includes('Discard what you typed?'), 'no discard prompt')
    await page.close()
  })

  test('Speak opens the keyboard on the note and points at its mic', async () => {
    const { page, go } = await app.open(IPAD)
    await page.setUserAgent(IPAD_UA)
    // iPadOS says "Macintosh"; a real iPad reports 5 touch points (the emulator says 1).
    await page.evaluateOnNewDocument(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 }))
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await waitForText(page, 'Save follow-up')
    await tap(page, 'button', 'Speak')
    await waitForText(page, 'Tap the 🎤 on your keyboard and speak.')
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'note')
    await page.close()
  })
})
