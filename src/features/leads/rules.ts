import { STATUSES, STATUS_LABEL, addDays, todayIST } from '@/lib/format'
import type { LeadStatus } from '@/lib/types'

// Client mirror of the API's lead-rules.ts (PRD §4). The server still decides.

export const TERMINAL: LeadStatus[] = ['not_interested', 'converted', 'lost']

export type NextDateRule = 'required' | 'optional' | 'hidden'

export function nextDateRule(status: LeadStatus | null): NextDateRule {
  if (!status) return 'hidden'
  if (status === 'follow_up_scheduled') return 'required'
  if (TERMINAL.includes(status)) return 'hidden'
  return 'optional'
}

export const NEXT_DATE_MIN = () => todayIST()
export const NEXT_DATE_MAX = () => addDays(todayIST(), 365)

/** Statuses offered when adding a lead: every status, New included. */
export const createStatuses = (): LeadStatus[] => STATUSES

/**
 * Statuses offered on a follow-up. New is never allowed again; a converted lead
 * stays Converted unless an admin changes it (PRD §4, §5.6).
 */
export function followUpStatuses(current: LeadStatus): LeadStatus[] {
  if (current === 'converted') return ['converted']
  return STATUSES.filter((s) => s !== 'new')
}

/** Statuses offered on a manual change: not New, not the current one. */
export function changeStatuses(current: LeadStatus, canLeaveConverted: boolean): LeadStatus[] {
  if (current === 'converted' && !canLeaveConverted) return []
  return STATUSES.filter((s) => s !== 'new' && s !== current)
}

export const statusOptions = (list: LeadStatus[]) => list.map((s) => ({ value: s, label: STATUS_LABEL[s] }))

export const NOTE_MIN = 5
