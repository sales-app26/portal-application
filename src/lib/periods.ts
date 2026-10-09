import { addDays } from './format'

export type PeriodKind = 'week' | 'month'

export interface Period {
  kind: PeriodKind
  /** First and last day, inclusive, as the API's weeks and months run (Monday to Sunday, calendar month). */
  from: string
  to: string
}

const parts = (ymd: string) => ymd.split('-').map(Number) as [number, number, number]
const pad = (n: number) => String(n).padStart(2, '0')

/** Monday = 0 … Sunday = 6, for a YYYY-MM-DD date. */
export const weekdayIndex = (ymd: string) => (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7

export function periodOf(kind: PeriodKind, anchor: string): Period {
  if (kind === 'week') {
    const from = addDays(anchor, -weekdayIndex(anchor))
    return { kind, from, to: addDays(from, 6) }
  }
  const [y, m] = parts(anchor)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { kind, from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` }
}

/** The period before (-1) or after (+1) this one. */
export function shiftPeriod(p: Period, by: -1 | 1): Period {
  if (p.kind === 'week') return periodOf('week', addDays(p.from, by * 7))
  const [y, m] = parts(p.from)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return periodOf('month', `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`)
}

export function periodLabel(p: Period): string {
  const fmt = (ymd: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { ...o, timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`))
  if (p.kind === 'month') return fmt(p.from, { month: 'long', year: 'numeric' })
  const sameMonth = p.from.slice(0, 7) === p.to.slice(0, 7)
  return `${fmt(p.from, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${fmt(p.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
}
