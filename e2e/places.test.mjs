// Where a visit was: "Taken at <place>" on visits, "Near <area>" in the camera, and
// "Use my location" on the Location field. Place names come from the API (OpenStreetMap).
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { click, LAPTOP, PHONE, sleep, startApp, tap, waitForText } from './harness.mjs'
import { ids } from './mock-api.mjs'

let app
before(async () => (app = await startApp()))
after(async () => app?.close())

const WANOWRIE = 'Wanowrie Road, Wanowrie, Pune 411040'
const OSM_LINK = 'https://www.openstreetmap.org/?mlat=18.4966&mlon=73.8993#map=18/18.4966/73.8993'
/** Words that never belong on a rep's screen. */
const JARGON = /\b(geocod\w*|API|coordinates|GPS|latitude|longitude)\b/i

const geoCalls = (api) => api.calls.filter((c) => c.path === '/geo/reverse')

/** The value of the input labelled `label`. */
const valueOf = (page, label) =>
  page.evaluate((label) => {
    const id = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === label && l.getClientRects().length)?.htmlFor
    return id ? document.getElementById(id).value : null
  }, label)

describe('where a visit was', () => {
  test('My day: a visit says where it was taken, with the map link and the OpenStreetMap credit', async () => {
    const { page, go, errors } = await app.open(PHONE)
    await go('/day')
    await waitForText(page, `Taken at ${WANOWRIE}`)
    // No name known for the other visit: its position stands in.
    await waitForText(page, 'Taken at 18.50000, 73.90000')
    const text = await page.evaluate(() => document.body.innerText)
    assert.ok(text.includes('© OpenStreetMap'), 'credit shown next to the place name')
    assert.ok(text.includes('± 12 m'), 'how close the location was')
    const links = await page.$$eval('a', (as) => as.filter((a) => a.textContent.trim() === 'Open map').map((a) => ({ href: a.href, target: a.target, rel: a.rel })))
    assert.equal(links.length, 2, 'one map link per visit')
    assert.deepEqual(links[0], { href: OSM_LINK, target: '_blank', rel: 'noreferrer' })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), PHONE.width, 'no horizontal overflow')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('the visit page and its full-screen photo show the place too', async () => {
    const { page, go, errors } = await app.open(LAPTOP)
    await go('/entries/33333332-3333-4333-8333-333333333333')
    await waitForText(page, `Taken at ${WANOWRIE}`)
    await click(page, 'Open visit photo')
    await page.waitForSelector('[role=dialog][aria-label="Visit photo"]')
    const panel = await page.$eval('[role=dialog][aria-label="Visit photo"]', (d) => ({
      text: d.innerText,
      href: [...d.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Open map')?.href,
    }))
    assert.ok(panel.text.includes(`Taken at ${WANOWRIE}`), 'photo viewer says where')
    assert.ok(panel.text.includes('© OpenStreetMap'))
    assert.equal(panel.href, OSM_LINK)
    assert.ok(!JARGON.test(panel.text), `no technical words: ${panel.text}`)
    assert.deepEqual(errors, [])
    await page.close()
  })
})

describe('Use my location', () => {
  test('fills the Location field with the area the phone is in', async () => {
    const { page, go, api, errors } = await app.open(PHONE, { projectId: ids.online })
    await go('/home')
    await click(page, 'Add lead')
    await tap(page, 'button', 'Use my location')
    await waitForText(page, 'Filled in from your location')
    assert.equal(await valueOf(page, 'Location'), 'Wanowrie')
    const [call] = geoCalls(api)
    assert.deepEqual(call.query, { lat: '18.4966', lng: '73.8993' })
    const text = await page.evaluate(() => document.querySelector('[role=dialog]').innerText)
    assert.ok(text.includes('© OpenStreetMap'), 'credit next to the filled-in name')
    assert.ok(!JARGON.test(text), 'no technical words')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('says so in plain words when no area name is known there', async () => {
    const { page, go, errors } = await app.open(PHONE, { projectId: ids.online, gps: { latitude: 0.1, longitude: 0.1, accuracy: 20 } })
    await go('/home')
    await click(page, 'Add lead')
    await tap(page, 'button', 'Use my location')
    await waitForText(page, 'We couldn’t find the area name here. Type it instead.')
    assert.equal(await valueOf(page, 'Location'), '', 'field left for typing')
    assert.deepEqual(errors, [])
    await page.close()
  })
})

describe('visit camera', () => {
  test('shows the area the photo will be stamped with, looking it up once for a steady position', async () => {
    const { page, go, api, errors } = await app.open(PHONE, { projectId: ids.d2d })
    await go('/home')
    await click(page, 'Add lead')
    await tap(page, 'button > span > span.text-title-sm', 'Take photo')
    await waitForText(page, 'Near Wanowrie', 8000)
    // A few metres of drift is not worth asking again.
    await page.setGeolocation({ latitude: 18.49662, longitude: 73.89931, accuracy: 10 })
    await sleep(1500)
    assert.equal(geoCalls(api).length, 1, 'one lookup for one spot')
    await tap(page, 'button[aria-label="Take photo"]')
    await tap(page, 'button', 'Use photo')
    await waitForText(page, 'Photo taken')
    await waitForText(page, 'Near Wanowrie')
    assert.deepEqual(errors, [])
    await page.close()
  })
})
