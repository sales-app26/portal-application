import { REASON_LABEL, rupeesShort } from '@/lib/format'
import type { LostReason, ScorecardNumbers } from '@/lib/types'

/** The scorecard numbers a list can be sorted by, in sales words. */
export type SortKey =
  | 'dealsWon'
  | 'wonRevenue'
  | 'targetPercent'
  | 'conversionPercent'
  | 'followUps'
  | 'visits'
  | 'leadsAdded'
  | 'activeDays'
  | 'avgDaysToWin'
  | 'overdueNow'
  | 'lostLeads'

export interface Measure {
  key: SortKey
  label: string
  /** The column heading on a laptop. */
  short: string
  /** Lower is better (overdue leads, days to win). */
  lowerIsBetter?: boolean
  format: (n: number) => string
}

/** ₹15K, ₹10K, ₹1.2L: short, without a trailing ".0". */
export const money = (n: number) => rupeesShort(n).replace(/\.0(?=[KLC])/, '')
const count = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const pct = (n: number) => `${Math.round(n)}%`
const days = (n: number) => `${count(n)} ${n === 1 ? 'day' : 'days'}`

export const MEASURES: Record<SortKey, Measure> = {
  dealsWon: { key: 'dealsWon', label: 'Deals won', short: 'Won', format: count },
  wonRevenue: { key: 'wonRevenue', label: 'Revenue won (₹/month)', short: 'Revenue', format: money },
  targetPercent: { key: 'targetPercent', label: 'Target reached', short: 'Target', format: pct },
  conversionPercent: { key: 'conversionPercent', label: 'Conversion', short: 'Conversion', format: pct },
  followUps: { key: 'followUps', label: 'Follow-ups', short: 'Follow-ups', format: count },
  visits: { key: 'visits', label: 'Visits', short: 'Visits', format: count },
  leadsAdded: { key: 'leadsAdded', label: 'Leads added', short: 'Added', format: count },
  activeDays: { key: 'activeDays', label: 'Active days', short: 'Active days', format: count },
  avgDaysToWin: { key: 'avgDaysToWin', label: 'Days to win', short: 'Days to win', lowerIsBetter: true, format: days },
  overdueNow: { key: 'overdueNow', label: 'Overdue now', short: 'Overdue', lowerIsBetter: true, format: count },
  lostLeads: { key: 'lostLeads', label: 'Lost leads', short: 'Lost', lowerIsBetter: true, format: count },
}

/** Sort choices on a phone, most asked-for first. */
export const SORT_CHOICES: SortKey[] = ['dealsWon', 'wonRevenue', 'targetPercent', 'conversionPercent', 'followUps', 'visits', 'activeDays', 'leadsAdded', 'overdueNow']

/** Best first; reps without the number (no target, nothing closed) go last. */
export function compareBy<T extends ScorecardNumbers & { user: { name: string } }>(key: SortKey, dir: 'desc' | 'asc' = 'desc') {
  return (a: T, b: T) => {
    const x = a[key]
    const y = b[key]
    if (x === null && y === null) return a.user.name.localeCompare(b.user.name)
    if (x === null) return 1
    if (y === null) return -1
    return (dir === 'desc' ? y - x : x - y) || b.dealsWon - a.dealsWon || a.user.name.localeCompare(b.user.name)
  }
}

/** "—" for a number that does not apply (no target, nothing closed). */
export const show = (key: SortKey, n: number | null) => (n === null ? '—' : MEASURES[key].format(n))

export const reasonLabel = (r: LostReason | 'unspecified' | null) => (r === null ? null : r === 'unspecified' ? 'No reason given' : REASON_LABEL[r])

/** Frostique plans read by name; anything else is shown as it was typed. */
const PLAN_NAMES: Record<string, string> = { free: 'Free', growth: 'Growth', growth_plus: 'Growth Plus', pro: 'Pro' }
export const planLabel = (plan: string | null) => (!plan || plan === 'unspecified' ? 'No plan recorded' : (PLAN_NAMES[plan.toLowerCase()] ?? plan))

/** The definitions shown under the numbers, so everyone reads them the same way. */
export const DEFINITIONS = {
  conversion: 'Conversion = deals won ÷ (deals won + leads marked Not interested or Lost) in these dates. A lead lost and then won counts as won.',
  activeDays: 'Active days = days with at least one follow-up, visit or stage change, out of the working days so far (days on leave are left out).',
  target: 'Target = each campaign’s weekly or monthly target, scaled to these dates. Revenue is the monthly value of the deals won.',
  now: 'Overdue and open leads are as of now, whatever the dates.',
}
