import { z } from 'zod'
import { normalizePhone } from '@/lib/format'
import type { DiscountType, LeadStatus, LeadSummary, LostReason, PlanCode } from '@/lib/types'
import { NEXT_DATE_MAX, NEXT_DATE_MIN, NOTE_MIN, nextDateRule } from './rules'

/** Digits of a typed rupee amount: "2499", "2,499" or "₹2,499". */
export const rupeeDigits = (v: string | undefined) => (v ?? '').replace(/[,\s₹]/g, '')

/**
 * The deal (api-contract §3b): plan chip, tenure chip, monthly list price, and an offer
 * ('' none, an offer's id, or 'other' for a discount typed by hand).
 */
export const dealShape = {
  planCode: z.enum(['free', 'growth', 'growth_plus', 'pro']).nullable().optional(),
  dealTenureMonths: z.number().nullable().optional(),
  /** List price per month, typed. */
  dealValue: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{1,9}$/.test(rupeeDigits(v)), 'Enter the amount in rupees, digits only.')
    .optional(),
  offerChoice: z.string().optional(),
  discountType: z.enum(['percent', 'amount']).optional(),
  discountValue: z.string().trim().optional(),
  couponCode: z
    .string()
    .trim()
    .max(40, 'Keep the coupon under 40 characters.')
    .refine((v) => /^[A-Za-z0-9_-]*$/.test(v), 'Use only letters, numbers, - and _.')
    .optional(),
}
export type DealValues = { [K in keyof typeof dealShape]?: z.input<(typeof dealShape)[K]> }

export const OTHER_DISCOUNT = 'other'

const parsePrice = (v: DealValues) => {
  const digits = rupeeDigits(v.dealValue)
  return digits && /^\d+$/.test(digits) ? Number(digits) : null
}
const parseDiscount = (v: DealValues) => {
  const raw = rupeeDigits(v.discountValue).replace('%', '')
  return raw && /^\d+(\.\d{1,2})?$/.test(raw) ? Number(raw) : null
}

/** The deal checks the API makes, so the rep sees them before saving. */
export function checkDeal(v: DealValues, ctx: z.RefinementCtx) {
  if (v.planCode === 'free' || v.offerChoice !== OTHER_DISCOUNT) {
    if (v.offerChoice && v.planCode !== 'free' && parsePrice(v) === null) ctx.addIssue({ code: 'custom', path: ['dealValue'], message: 'Enter the monthly price before adding an offer.' })
    return
  }
  const price = parsePrice(v)
  const off = parseDiscount(v)
  if (price === null) ctx.addIssue({ code: 'custom', path: ['dealValue'], message: 'Enter the monthly price before adding a discount.' })
  if (off === null) return ctx.addIssue({ code: 'custom', path: ['discountValue'], message: v.discountType === 'amount' ? 'Enter the rupees off, digits only.' : 'Enter how much % off, like 10.' })
  if (v.discountType === 'amount') {
    if (!Number.isInteger(off)) ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Enter whole rupees.' })
    else if (price !== null && off > price * (v.dealTenureMonths ?? 1)) ctx.addIssue({ code: 'custom', path: ['discountValue'], message: "The ₹ discount can't be more than the deal total." })
  } else if (off > 100) ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'A % discount must be between 0 and 100.' })
}

/** The deal fields every form starts with, from what the lead already carries. */
export function dealDefaults(lead?: Pick<LeadSummary, 'planCode' | 'dealTenureMonths' | 'dealValue' | 'offer' | 'discountType' | 'discountValue' | 'couponCode'>): DealValues {
  const typed = !!lead && !lead.offer && !!lead.discountType
  return {
    planCode: lead?.planCode ?? null,
    dealTenureMonths: lead?.dealTenureMonths ?? null,
    dealValue: lead?.dealValue != null && lead.planCode !== 'free' ? String(lead.dealValue) : '',
    offerChoice: lead?.offer ? lead.offer.id : typed ? OTHER_DISCOUNT : '',
    discountType: (typed && lead?.discountType) || 'percent',
    discountValue: typed && lead?.discountValue != null ? String(lead.discountValue) : '',
    couponCode: typed ? (lead?.couponCode ?? '') : '',
  }
}

export interface DealBody {
  dealValue?: number | null
  planCode?: PlanCode | null
  dealTenureMonths?: number | null
  offerId?: string | null
  discountType?: DiscountType | null
  discountValue?: number | null
  couponCode?: string | null
}

/**
 * The deal as the API takes it. `replace` (Edit lead) sends every field, null where empty, since
 * any deal field there replaces the whole deal; otherwise only the fields with a value.
 */
export function dealBody(v: DealValues, { replace = false } = {}): DealBody {
  const free = v.planCode === 'free'
  const offer = !free && v.offerChoice && v.offerChoice !== OTHER_DISCOUNT ? v.offerChoice : null
  const typed = !free && v.offerChoice === OTHER_DISCOUNT
  const full: DealBody = {
    planCode: (v.planCode as PlanCode | null | undefined) ?? null,
    dealValue: free ? null : parsePrice(v),
    dealTenureMonths: free ? null : (v.dealTenureMonths ?? null),
    offerId: offer,
    discountType: typed ? (v.discountType ?? 'percent') : null,
    discountValue: typed ? parseDiscount(v) : null,
    couponCode: typed && v.couponCode?.trim() ? v.couponCode.trim().toUpperCase() : null,
  }
  if (replace) return full
  return Object.fromEntries(Object.entries(full).filter(([, x]) => x !== null)) as DealBody
}

const STATUS = z.enum(['new', 'contacted', 'interested', 'follow_up_scheduled', 'not_interested', 'converted', 'lost'])

/** Status + note + next date, validated like the API (PRD §4, §5.6). */
export const followUpShape = {
  status: STATUS.nullable().refine((s) => s !== null, 'Choose a status.'),
  note: z.string().trim().min(NOTE_MIN, `Write at least ${NOTE_MIN} characters.`).max(2000),
  nextFollowUpDate: z.string(),
  /** Why it was lost (Not interested / Lost only). */
  reason: z.string().nullable().optional(),
  ...dealShape,
  location: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, ' '))
    .pipe(z.string().min(2, 'Location must be 2 to 100 characters.').max(100, 'Location must be 2 to 100 characters.')),
}

export function checkNextDate(v: { status: LeadStatus | null; nextFollowUpDate: string }, ctx: z.RefinementCtx) {
  const rule = nextDateRule(v.status)
  const d = v.nextFollowUpDate
  if (rule === 'required' && !d) ctx.addIssue({ code: 'custom', path: ['nextFollowUpDate'], message: 'Choose the next follow-up date for Follow-up scheduled.' })
  if (rule !== 'hidden' && d) {
    if (d < NEXT_DATE_MIN()) ctx.addIssue({ code: 'custom', path: ['nextFollowUpDate'], message: 'The next follow-up date cannot be in the past.' })
    if (d > NEXT_DATE_MAX()) ctx.addIssue({ code: 'custom', path: ['nextFollowUpDate'], message: 'The next follow-up date can be at most 365 days ahead.' })
  }
}

export const followUpSchema = z.object(followUpShape).superRefine((v, ctx) => {
  checkNextDate(v, ctx)
  if (v.status === 'converted') checkDeal(v, ctx)
})
export type FollowUpValues = z.input<typeof followUpSchema>

export const leadSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter the client name.').max(120),
    businessName: z.string().trim().max(160),
    phone: z.string().trim().refine((v) => normalizePhone(v) !== null, 'Enter a 10-digit Indian mobile number.'),
    notes: z.string().trim().max(2000),
    source: z.string().nullable(),
    ...followUpShape,
  })
  .superRefine((v, ctx) => {
    checkNextDate(v, ctx)
    checkDeal(v, ctx) // Add lead: the expected deal, at any stage.
  })
export type LeadValues = z.input<typeof leadSchema>

export const REASON_STATUSES: LeadStatus[] = ['not_interested', 'lost']

/** The deal and reason fields an entry sends, only where the API accepts them. */
export function outcomeBody(v: { status: LeadStatus | null; reason?: string | null } & DealValues, opts: { dealAlways?: boolean; withDeal?: boolean } = {}) {
  const body: { reason?: LostReason } & DealBody = {}
  if (v.status && REASON_STATUSES.includes(v.status) && v.reason) body.reason = v.reason as LostReason
  if (opts.withDeal !== false && (opts.dealAlways || v.status === 'converted')) Object.assign(body, dealBody(v))
  return body
}

