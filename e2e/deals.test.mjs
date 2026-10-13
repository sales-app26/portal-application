// The save confirmation on Log follow-up, the Won deal (plan, tenure, price, offer or discount)
// and the sales head's Plans & offers page, against the fake API.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { click, clickContaining, fill, PHONE, startApp, tap, waitForText } from './harness.mjs'
import { ids } from './mock-api.mjs'

const DIWALI = 'eeeeeee1-eeee-4eee-8eee-eeeeeeeeeeee'

let app
before(async () => (app = await startApp()))
after(async () => app?.close())

const text = (page) => page.evaluate(() => document.body.innerText)
const followUps = (api) => api.writes.filter((x) => x.path.endsWith('/follow-ups'))
/** The value of the input labelled `label`. */
const valueOf = (page, label) =>
  page.evaluate((label) => {
    const l = [...document.querySelectorAll('label')].find((x) => x.textContent.replace('(optional)', '').trim() === label && x.getClientRects().length)
    return l ? document.getElementById(l.htmlFor)?.value : undefined
  }, label)

describe('confirm before saving a follow-up', () => {
  test('shows what will be saved and what can’t change; Go back keeps everything typed', async () => {
    const { page, go, api, errors } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Interested', '[role=radio]')
    const note = 'Spoke to the owner and his son about billing, stock and the delivery app; they want a demo next Tuesday.'
    await fill(page, 'Note', note)
    await click(page, 'Tomorrow', '[aria-label="Quick dates"] button')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Save this follow-up?')
    const summary = await text(page)
    for (const part of ['Stage', 'Interested', 'Next follow-up', 'Tomorrow', `“${note.slice(0, 80).trimEnd()}…”`, 'You can fix the note and next follow-up date until midnight today'])
      assert.ok(summary.includes(part), `the summary shows ${part}`)
    assert.equal(followUps(api).length, 0, 'nothing is sent before the rep confirms')

    await click(page, 'Go back')
    await page.waitForFunction(() => !document.body.innerText.includes('Save this follow-up?'), { timeout: 3000 })
    assert.equal(await valueOf(page, 'Note'), note, 'the note is still there')
    assert.ok(await page.$('[role=radio][aria-checked=true]'), 'the stage is still picked')
    assert.equal(followUps(api).length, 0)

    await click(page, 'Save follow-up')
    await waitForText(page, 'Save this follow-up?')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Follow-up saved.')
    assert.equal(followUps(api).length, 1, 'saved once')
    const body = JSON.parse(followUps(api)[0].body)
    assert.equal(body.status, 'interested')
    assert.equal(body.note, note)
    assert.ok(body.nextFollowUpDate, 'the next date is sent')
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('a visit photo running out while the summary is open sends the rep back to retake it', async () => {
    const { page, go, api } = await app.open(PHONE, { projectId: ids.d2d })
    await go(`/leads/${ids.d2dLead}`)
    await tap(page, 'button', 'Log follow-up')
    await tap(page, 'button > span > span.text-title-sm', 'Take photo')
    await tap(page, 'button[aria-label="Take photo"]')
    await tap(page, 'button', 'Use photo')
    await waitForText(page, 'Photo taken')
    await fill(page, 'Note', 'Met the owner at the counter.')
    await tap(page, 'button', 'Save follow-up')
    await waitForText(page, 'Visit photo attached')
    await waitForText(page, 'save within')
    // Eleven minutes pass on the phone.
    await page.evaluate(() => {
      const now = Date.now
      Date.now = () => now() + 11 * 60_000
    })
    await waitForText(page, 'The photo was taken more than 10 minutes ago. Take it again.', 4000)
    await page.waitForFunction(() => !document.body.innerText.includes('Save this follow-up?'), { timeout: 3000 }) // the summary closed
    await waitForText(page, 'Take photo') // and the form asks for a new one
    assert.equal(followUps(api).length, 0)
    await page.close()
  })

  test('winning says only a sales manager can move the lead back, and shows the deal', async () => {
    const { page, go } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Won', '[role=radio]')
    await fill(page, 'Note', 'Signed up at the counter.')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Save this follow-up?')
    const summary = await text(page)
    assert.ok(summary.includes('Once won, only your sales manager can move this lead to another stage.'))
    assert.ok(summary.includes('Growth · Client pays ₹2,499 for 1 month'), 'the deal is summed up')
    await page.close()
  })
})

describe('the Won deal', () => {
  test('plan chip prefills the price; tenure and an offer give the live total; the request carries them', async () => {
    const { page, go, api, errors } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Won', '[role=radio]')
    await waitForText(page, 'Mark as won')
    await click(page, 'Growth Plus', '[role=radio]')
    assert.equal(await valueOf(page, 'Monthly price'), '3499', 'the sales head’s price is filled in')
    await click(page, '6 months', '[role=radio]')
    await clickContaining(page, 'Diwali offer', '[role=radio]')
    await waitForText(page, 'Client pays ₹18,894 for 6 months (₹3,149/month after 10% off · DIWALI10)')
    await waitForText(page, 'Coupon DIWALI10 is filled in for you.')
    assert.ok(!(await text(page)).includes('Monsoon'), 'an ended offer is not offered')
    await fill(page, 'Note', 'Signed for six months with the Diwali offer.')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Growth Plus · Client pays ₹18,894 for 6 months')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Won!')
    const body = JSON.parse(followUps(api)[0].body)
    assert.equal(body.status, 'converted')
    assert.equal(body.planCode, 'growth_plus')
    assert.equal(body.dealTenureMonths, 6)
    assert.equal(body.dealValue, 3499)
    assert.equal(body.offerId, DIWALI)
    for (const k of ['discountType', 'discountValue', 'couponCode']) assert.equal(body[k], undefined, `no ${k} with an offer`)
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('Other discount: ₹ off the whole deal with a coupon, checked against the total', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Won', '[role=radio]')
    await click(page, '3 months', '[role=radio]')
    await click(page, 'Other discount', '[role=radio]')
    await click(page, '₹ off', 'button')
    await fill(page, 'How many ₹ off the whole deal', '8000')
    await fill(page, 'Coupon code', 'shop500')
    await fill(page, 'Note', 'Agreed on a discount at the shop.')
    await click(page, 'Save follow-up')
    await waitForText(page, "The ₹ discount can't be more than the deal total.")
    assert.ok(!(await text(page)).includes('Save this follow-up?'))

    const field = await page.evaluateHandle(() => {
      const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === 'How many ₹ off the whole deal')
      return document.getElementById(l.htmlFor)
    })
    await field.evaluate((el) => (el.focus(), el.select()))
    await page.keyboard.type('500')
    await waitForText(page, 'Client pays ₹6,997 for 3 months (₹2,332/month after ₹500 off · SHOP500)')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Save this follow-up?')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Won!')
    const body = JSON.parse(followUps(api)[0].body)
    assert.deepEqual(
      { planCode: body.planCode, dealTenureMonths: body.dealTenureMonths, dealValue: body.dealValue, discountType: body.discountType, discountValue: body.discountValue, couponCode: body.couponCode, offerId: body.offerId },
      { planCode: 'growth', dealTenureMonths: 3, dealValue: 2499, discountType: 'amount', discountValue: 500, couponCode: 'SHOP500', offerId: undefined },
    )
    await page.close()
  })

  test('Free needs no price, tenure or discount', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'Log follow-up')
    await click(page, 'Won', '[role=radio]')
    await click(page, 'Free', '[role=radio]')
    await waitForText(page, 'Free plan: the client pays nothing.')
    const shown = await text(page)
    for (const gone of ['For how long', 'Monthly price', 'Offer or discount']) assert.ok(!shown.includes(gone), `${gone} is hidden`)
    await fill(page, 'Note', 'Started on the free plan.')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Save this follow-up?')
    await click(page, 'Save follow-up')
    await waitForText(page, 'Won!')
    const body = JSON.parse(followUps(api)[0].body)
    assert.equal(body.planCode, 'free')
    for (const k of ['dealValue', 'dealTenureMonths', 'offerId', 'discountType', 'discountValue']) assert.equal(body[k], undefined)
    await page.close()
  })

  test('Add lead takes the same deal as the expected deal, with no confirmation', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go('/home')
    await click(page, 'Add lead')
    await fill(page, 'Contact person', 'New Client')
    await fill(page, 'Phone', '98765 43210')
    await fill(page, 'Location', 'Kondhwa')
    await waitForText(page, 'Expected deal')
    await click(page, 'Growth', '[role=radio]')
    await click(page, '12 months', '[role=radio]')
    await waitForText(page, 'Client pays ₹29,988 for 12 months (₹2,499/month)')
    await fill(page, 'Note', 'Interested in a yearly plan.')
    await click(page, 'Save lead')
    await waitForText(page, 'Lead saved.')
    const body = JSON.parse(api.writes.find((x) => x.path === `/projects/${ids.online}/leads`).body)
    assert.equal(body.planCode, 'growth')
    assert.equal(body.dealTenureMonths, 12)
    assert.equal(body.dealValue, 2499)
    await page.close()
  })

  test('Edit lead sends the whole deal when any of it changes', async () => {
    const { page, go, api } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await click(page, 'More actions')
    await click(page, 'Edit lead')
    await waitForText(page, 'Save changes')
    await click(page, 'Pro', '[role=radio]')
    await click(page, 'Save changes')
    await waitForText(page, 'Lead updated.')
    const body = JSON.parse(api.writes.find((x) => x.method === 'PATCH' && x.path === `/leads/${ids.lead}`).body)
    assert.deepEqual(body, { planCode: 'pro', dealValue: 2499, dealTenureMonths: 1, offerId: null, discountType: null, discountValue: null, couponCode: null })
    await page.close()
  })

  test('the lead page and lists show the plan and the price after any discount', async () => {
    const { page, go } = await app.open(PHONE)
    await go(`/leads/${ids.lead}`)
    await waitForText(page, 'Growth · ₹2,499/mo')
    await waitForText(page, 'Expected deal')
    await go('/leads')
    await waitForText(page, 'Growth · ₹2,499/mo')
    await page.close()
  })
})

describe('Plans & offers (sales head)', () => {
  test('sets plan prices, adds an offer, ends one; the request bodies say so', async () => {
    const { page, go, api, errors } = await app.open(PHONE, { role: 'super_admin' })
    await go('/plans-offers')
    await waitForText(page, 'Plan prices')
    assert.equal(await valueOf(page, 'Growth'), '2499')
    assert.equal(await valueOf(page, 'Pro'), '')
    await fill(page, 'Pro', '4999')
    await click(page, 'Save prices')
    await waitForText(page, 'Plan prices saved.')
    const put = api.writes.find((x) => x.method === 'PUT' && x.path === '/settings/plan-prices')
    assert.deepEqual(JSON.parse(put.body), { prices: [{ plan: 'pro', monthlyPrice: 4999 }] })

    // Both offers listed for the head, the ended one marked.
    await waitForText(page, 'Diwali offer')
    await waitForText(page, 'Ended')

    await click(page, 'Add offer')
    await waitForText(page, 'New offer')
    await fill(page, 'Name', 'Wedding season')
    await fill(page, 'How much % off', '15')
    await fill(page, 'Coupon code', 'shaadi15')
    await click(page, 'Save offer')
    await waitForText(page, 'Offer saved.')
    const post = api.writes.find((x) => x.method === 'POST' && x.path === '/offers')
    assert.deepEqual(JSON.parse(post.body), { name: 'Wedding season', discountType: 'percent', discountValue: 15, couponCode: 'SHAADI15', startsOn: null, endsOn: null })
    await waitForText(page, 'Wedding season')

    await page.evaluate(() => {
      const row = [...document.querySelectorAll('li')].find((li) => li.textContent.includes('Diwali offer'))
      row.querySelector('button[aria-label="More actions"]').click()
    })
    await click(page, 'End offer')
    await waitForText(page, 'Diwali offer ended. Deals already won keep it.')
    const patch = api.writes.find((x) => x.method === 'PATCH' && x.path === `/offers/${DIWALI}`)
    assert.deepEqual(JSON.parse(patch.body), { active: false })
    assert.deepEqual(errors, [])
    await page.close()
  })

  test('checks an offer before sending it', async () => {
    const { page, go, api } = await app.open(PHONE, { role: 'super_admin' })
    await go('/plans-offers')
    await click(page, 'Add offer')
    await fill(page, 'Name', 'Too good')
    await fill(page, 'How much % off', '120')
    await click(page, 'Save offer')
    await waitForText(page, 'A % off can be at most 100.')
    assert.equal(api.writes.filter((x) => x.path === '/offers').length, 0)
    await page.close()
  })

  test('sits under More for the sales head only', async () => {
    const head = await app.open(PHONE, { role: 'super_admin' })
    await head.go('/more')
    await waitForText(head.page, 'Plans & offers')
    await head.page.close()
    const rep = await app.open(PHONE)
    await rep.go('/plans-offers')
    await rep.page.waitForFunction(() => location.pathname === '/home', { timeout: 5000 })
    await rep.page.close()
  })
})
