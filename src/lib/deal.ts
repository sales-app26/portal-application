import { rupees } from './format'
import type { DiscountType, LeadSummary, PlanCode } from './types'

// Client mirror of the API's deal-rules.ts (api-contract §3b). The server still decides.

export const PLAN_LABEL: Record<PlanCode, string> = { free: 'Free', growth: 'Growth', growth_plus: 'Growth Plus', pro: 'Pro' }
export const PLANS = Object.keys(PLAN_LABEL) as PlanCode[]
export const TENURES = [1, 3, 6, 12] as const

export const months = (n: number) => `${n} ${n === 1 ? 'month' : 'months'}`

export interface DealTerms {
  /** List price per month. */
  price: number | null
  tenure: number | null
  discountType: DiscountType | null
  discountValue: number | null
}

export interface DealMoney {
  tenure: number
  listTotal: number
  discountAmount: number
  /** What the client pays for the whole tenure, rounded down to a rupee. */
  total: number
  /** Total ÷ tenure. */
  monthly: number
}

/** Price × tenure − discount, a percent taken off the whole deal (same rounding as the server). */
export function dealMoney({ price, tenure, discountType, discountValue }: DealTerms): DealMoney | null {
  if (price === null || !Number.isFinite(price)) return null
  const t = tenure ?? 1
  const list = price * t
  let total = list
  if (discountType === 'percent' && discountValue !== null) total = Math.floor((list * (10_000 - Math.round(discountValue * 100))) / 10_000)
  else if (discountType === 'amount' && discountValue !== null) total = Math.max(list - discountValue, 0)
  return { tenure: t, listTotal: list, discountAmount: list - total, total, monthly: Math.round((total / t) * 100) / 100 }
}

/** "10% off", "₹500 off". */
export function discountLabel(type: DiscountType, value: number) {
  return type === 'percent' ? `${value}% off` : `${rupees(value)} off`
}

/**
 * The live summary line: "Client pays ₹13,494 for 6 months (₹2,249/month after 10% off · DIWALI10)".
 */
export function dealSentence(plan: PlanCode | null, terms: DealTerms, coupon?: string | null): string | null {
  if (plan === 'free') return 'Free plan: the client pays nothing.'
  const m = dealMoney(terms)
  if (!m) return null
  const pays = `Client pays ${rupees(m.total)} for ${months(m.tenure)}`
  if (!terms.discountType || terms.discountValue === null) return m.tenure === 1 ? pays : `${pays} (${rupees(m.monthly)}/month)`
  const after = [`${rupees(m.monthly)}/month after ${discountLabel(terms.discountType, terms.discountValue)}`, coupon].filter(Boolean).join(' · ')
  return `${pays} (${after})`
}

/** A saved deal in a few words, for the lead page and lists: plan, tenure, price after discount, offer. */
export function dealOf(lead: Pick<LeadSummary, 'planCode' | 'plan' | 'dealTenureMonths' | 'dealValue' | 'effectiveMonthlyValue' | 'discountType' | 'discountValue' | 'couponCode' | 'offer'>) {
  const plan = lead.planCode ? PLAN_LABEL[lead.planCode] : lead.plan
  const free = lead.planCode === 'free'
  const monthly = lead.effectiveMonthlyValue ?? lead.dealValue
  const discount = lead.discountType && lead.discountValue !== null ? discountLabel(lead.discountType, lead.discountValue) : null
  return {
    plan,
    /** "₹2,249/mo" — the price after any discount. */
    price: free ? 'Free' : monthly !== null ? `${rupees(monthly)}/mo` : null,
    tenure: !free && lead.dealTenureMonths ? months(lead.dealTenureMonths) : null,
    /** "Diwali offer · DIWALI10", "10% off · SHOP10". */
    offer: lead.offer ? [lead.offer.name, lead.couponCode].filter(Boolean).join(' · ') : discount ? [discount, lead.couponCode].filter(Boolean).join(' · ') : null,
    hasDeal: !!plan || lead.dealValue !== null,
  }
}
