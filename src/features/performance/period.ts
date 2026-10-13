import { addDays, formatDate } from '@/lib/format'

/** The review periods a manager picks from; "custom" keeps its own dates in the address. */
export type PeriodPreset = 'this_month' | 'last_month' | 'this_quarter' | 'custom'

export interface ReviewPeriod {
  preset: PeriodPreset
  /** First and last day, India dates, inclusive. */
  from: string
  to: string
}

/** The API's limits: screens cover at most 366 days, a downloaded file 92. */
export const REVIEW_MAX_DAYS = 366
export const EXPORT_MAX_DAYS = 92

export const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'custom', label: 'Custom' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const month = (y: number, m: number) => ({ from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` })

/** Days from `from` to `to`, both counted. */
export const daysIn = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1

/** Calendar months and quarters (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec), India dates. */
export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number)
  if (preset === 'this_month') return month(y, m)
  if (preset === 'last_month') return m === 1 ? month(y - 1, 12) : month(y, m - 1)
  const first = Math.floor((m - 1) / 3) * 3 + 1
  return { from: month(y, first).from, to: month(y, first + 2).to }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** The period in the address (`?period=…&from=…&to=…`), This month when missing or broken. */
export function readPeriod(params: URLSearchParams, today: string): ReviewPeriod {
  const preset = params.get('period') as PeriodPreset | null
  if (preset === 'custom') {
    const from = params.get('from') ?? ''
    const to = params.get('to') ?? ''
    if (ISO.test(from) && ISO.test(to) && from <= to && daysIn(from, to) <= REVIEW_MAX_DAYS) return { preset, from, to }
  }
  const known = preset === 'last_month' || preset === 'this_quarter' ? preset : 'this_month'
  return { preset: known, ...presetRange(known, today) }
}

/** Address parameters for a period; This month is the default and adds nothing. */
export function periodParams(p: ReviewPeriod): Record<string, string> {
  if (p.preset === 'this_month') return {}
  if (p.preset === 'custom') return { period: p.preset, from: p.from, to: p.to }
  return { period: p.preset }
}

/** A custom range starting from the current one, kept within the screen limit. */
export function customFrom(p: ReviewPeriod, change: { from?: string; to?: string }): ReviewPeriod {
  let from = change.from ?? p.from
  let to = change.to ?? p.to
  if (to < from) to = from
  if (daysIn(from, to) > REVIEW_MAX_DAYS) {
    if (change.from) to = addDays(from, REVIEW_MAX_DAYS - 1)
    else from = addDays(to, -(REVIEW_MAX_DAYS - 1))
  }
  return { preset: 'custom', from, to }
}

/** "October 2026", "Jul – Sep 2026" or "3 Oct – 13 Oct". */
export function describePeriod(p: ReviewPeriod): string {
  const fmt = (ymd: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { ...o, timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`))
  if (p.preset === 'this_month' || p.preset === 'last_month') return fmt(p.from, { month: 'long', year: 'numeric' })
  if (p.preset === 'this_quarter') return `${fmt(p.from, { month: 'short' })} – ${fmt(p.to, { month: 'short', year: 'numeric' })}`
  return p.from === p.to ? formatDate(p.from) : `${formatDate(p.from)} – ${formatDate(p.to)}`
}

/** Where a rep's review opens, for the same dates. */
export function reviewHref(userId: string, p: ReviewPeriod): string {
  const q = new URLSearchParams(periodParams(p)).toString()
  return `/people/${userId}/review${q ? `?${q}` : ''}`
}
