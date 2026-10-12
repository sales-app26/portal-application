import { z } from 'zod'
import { normalizePhone } from '@/lib/format'
import type { LeadStatus, LostReason } from '@/lib/types'
import { NEXT_DATE_MAX, NEXT_DATE_MIN, NOTE_MIN, nextDateRule } from './rules'

const STATUS = z.enum(['new', 'contacted', 'interested', 'follow_up_scheduled', 'not_interested', 'converted', 'lost'])

/** Status + note + next date, validated like the API (PRD §4, §5.6). */
export const followUpShape = {
  status: STATUS.nullable().refine((s) => s !== null, 'Choose a status.'),
  note: z.string().trim().min(NOTE_MIN, `Write at least ${NOTE_MIN} characters.`).max(2000),
  nextFollowUpDate: z.string(),
  /** Why it was lost (Not interested / Lost only). */
  reason: z.string().nullable().optional(),
  /** Rupees per month, typed: "2499", "2,499" or "₹2,499". */
  dealValue: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{1,9}$/.test(v.replace(/[,\s₹]/g, '')), 'Enter the amount in rupees, digits only.')
    .optional(),
  plan: z.string().trim().max(80, 'Keep the plan under 80 characters.').optional(),
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

export const followUpSchema = z.object(followUpShape).superRefine(checkNextDate)
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
  .superRefine(checkNextDate)
export type LeadValues = z.input<typeof leadSchema>

export const REASON_STATUSES: LeadStatus[] = ['not_interested', 'lost']

/** The deal and reason fields an entry sends, only where the API accepts them. */
export function outcomeBody(v: { status: LeadStatus | null; reason?: string | null; dealValue?: string; plan?: string }, opts: { dealAlways?: boolean } = {}) {
  const body: { reason?: LostReason; dealValue?: number; plan?: string } = {}
  if (v.status && REASON_STATUSES.includes(v.status) && v.reason) body.reason = v.reason as LostReason
  if (opts.dealAlways || v.status === 'converted') {
    const digits = (v.dealValue ?? '').replace(/[,\s₹]/g, '')
    if (digits) body.dealValue = Number(digits)
    if (v.plan?.trim()) body.plan = v.plan.trim()
  }
  return body
}

