import { z } from 'zod'
import { normalizePhone } from '@/lib/format'
import type { LeadStatus } from '@/lib/types'
import { NEXT_DATE_MAX, NEXT_DATE_MIN, NOTE_MIN, nextDateRule } from './rules'

const STATUS = z.enum(['new', 'contacted', 'interested', 'follow_up_scheduled', 'not_interested', 'converted', 'lost'])

/** Status + note + next date, validated like the API (PRD §4, §5.6). */
export const followUpShape = {
  status: STATUS.nullable().refine((s) => s !== null, 'Choose a status.'),
  note: z.string().trim().min(NOTE_MIN, `Write at least ${NOTE_MIN} characters.`).max(2000),
  nextFollowUpDate: z.string(),
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
    ...followUpShape,
  })
  .superRefine(checkNextDate)
export type LeadValues = z.input<typeof leadSchema>
